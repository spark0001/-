const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
    || message.indexOf('collection.remove:fail -502005') !== -1
}

async function ensureCollection(collectionName) {
  try {
    await db.createCollection(collectionName)
  } catch (error) {
    if (!isCollectionAlreadyExistError(error)) {
      throw error
    }
  }
}

async function getAllRecords(collectionName, whereData) {
  const pageSize = 100
  let skip = 0
  let records = []

  while (true) {
    let query = db.collection(collectionName)

    if (whereData && Object.keys(whereData).length) {
      query = query.where(whereData)
    }

    const res = await query
      .skip(skip)
      .limit(pageSize)
      .get()

    const currentBatch = res.data || []
    records = records.concat(currentBatch)

    if (currentBatch.length < pageSize) {
      break
    }

    skip += currentBatch.length
  }

  return records
}

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function normalizeEffectMode(value) {
  return value === 'scheduled' ? 'scheduled' : 'immediate'
}

function normalizeThresholdType(value) {
  return value === 'consecutive' ? 'consecutive' : 'accumulated'
}

function toTimestamp(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.getTime()
}

function buildPermissionInfo(userRecord) {
  const activityPermission = typeof (userRecord && userRecord.activityPermission) === 'boolean'
    ? userRecord.activityPermission
    : false
  const superAdmin = userRecord && userRecord.superAdmin === true

  return {
    rewardPermission: typeof (userRecord && userRecord.rewardPermission) === 'boolean'
      ? userRecord.rewardPermission
      : (superAdmin || activityPermission)
  }
}

function buildRuleId() {
  return `reading-rule-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function getTimestamp(dateText, timeText) {
  const dateTokens = String(dateText || '').split('-').map((item) => Number(item))
  const timeTokens = String(timeText || '').split(':').map((item) => Number(item))
  const year = dateTokens[0]
  const month = dateTokens[1]
  const day = dateTokens[2]
  const hour = timeTokens[0]
  const minute = timeTokens[1]

  if (
    !Number.isFinite(year)
    || !Number.isFinite(month)
    || !Number.isFinite(day)
    || !Number.isFinite(hour)
    || !Number.isFinite(minute)
  ) {
    return Number.NaN
  }

  return Date.UTC(year, month - 1, day, hour - 8, minute)
}

async function getUserRecord(openid) {
  const res = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()

  return (res.data || [])[0] || null
}

async function getActivityRecord(activityId) {
  if (!activityId) {
    return null
  }

  try {
    const res = await db.collection('activities').doc(activityId).get()
    return res.data || null
  } catch (error) {
    return null
  }
}

async function deactivateCurrentActiveRules(currentTimestamp) {
  const safeRuleList = await getAllRecords('reading_incentive_rules').catch((error) => {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  })

  const activeRuleList = safeRuleList.filter((item) => item && item.isActive === true && item._id)

  if (!activeRuleList.length) {
    return
  }

  await Promise.all(activeRuleList.map((item) => {
    return db.collection('reading_incentive_rules').doc(item._id).update({
      data: {
        isActive: false,
        updatedAt: currentTimestamp
      }
    })
  }))
}

async function clearFutureScheduledRules(currentTimestamp) {
  const safeRuleList = await getAllRecords('reading_incentive_rules').catch((error) => {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  })

  const currentTime = toTimestamp(currentTimestamp) || Date.now()
  const targetRuleList = safeRuleList.filter((item) => {
    const effectAt = toTimestamp(item && item.effectAt)

    return normalizeEffectMode(item && item.effectMode) === 'scheduled'
      && item.isActive !== true
      && !!effectAt
      && effectAt > currentTime
      && item._id
  })

  if (!targetRuleList.length) {
    return
  }

  await Promise.all(targetRuleList.map((item) => {
    return db.collection('reading_incentive_rules').doc(item._id).remove()
  }))
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()

  try {
    const userRecord = await getUserRecord(OPENID)
    const permissionInfo = buildPermissionInfo(userRecord)

    if (!permissionInfo.rewardPermission) {
      return {
        success: false,
        message: '当前账号没有阅读激励规则配置权限'
      }
    }

    const effectMode = normalizeEffectMode(event.effectMode)
    const activityId = normalizeText(event.activityId)
    const requireOfflineAttendance = event.requireOfflineAttendance !== false
    const thresholdType = normalizeThresholdType(event.thresholdType)
    const thresholdUnit = 'days'
    const thresholdValue = Number(event.thresholdValue)
    const now = new Date()
    let effectAt = now

    if (!activityId) {
      return {
        success: false,
        message: '请选择关联活动'
      }
    }

    if (!isPositiveInteger(thresholdValue)) {
      return {
        success: false,
        message: '门槛数值必须是正整数'
      }
    }

    if (thresholdUnit !== 'days') {
      return {
        success: false,
        message: '第一版仅支持按天数配置规则'
      }
    }

    const activityRecord = await getActivityRecord(activityId)

    if (
      !activityRecord
      || activityRecord.status !== 'published'
      || normalizeActivityMode(activityRecord.activityMode) !== 'offline'
      || normalizeActivityType(activityRecord.activityType) === 'rewardClaim'
    ) {
      return {
        success: false,
        message: '关联活动必须是已发布的线下普通活动'
      }
    }

    if (effectMode === 'scheduled') {
      const effectAtDate = normalizeText(event.effectAtDate)
      const effectAtTime = normalizeText(event.effectAtTime)
      const effectAtTimestamp = getTimestamp(effectAtDate, effectAtTime)

      if (!Number.isFinite(effectAtTimestamp)) {
        return {
          success: false,
          message: '请填写有效的预约生效时间'
        }
      }

      if (effectAtTimestamp <= Date.now()) {
        return {
          success: false,
          message: '预约生效时间必须晚于当前时间'
        }
      }

      effectAt = new Date(effectAtTimestamp)
    }

    await ensureCollection('reading_incentive_rules')

    if (effectMode === 'immediate') {
      await deactivateCurrentActiveRules(now)
    } else {
      await clearFutureScheduledRules(now)
    }

    await db.collection('reading_incentive_rules').add({
      data: {
        ruleId: buildRuleId(),
        isActive: effectMode === 'immediate',
        effectMode,
        effectAt,
        activityId,
        activityTitle: normalizeText(activityRecord.title) || '未命名活动',
        requireOfflineAttendance,
        thresholdType,
        thresholdUnit,
        thresholdValue,
        createdAt: now,
        updatedAt: now
      }
    })

    return {
      success: true,
      message: effectMode === 'immediate' ? '阅读激励规则已立即生效' : '阅读激励规则已预约保存'
    }
  } catch (error) {
    return {
      success: false,
      message: '保存阅读激励规则失败',
      error: error && error.message ? error.message : error
    }
  }
}
