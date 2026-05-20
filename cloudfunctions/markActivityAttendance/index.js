const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000
const READING_INCENTIVE_TARGET_DAYS = 10

function normalizeText(value) {
  return String(value || '').trim()
}

function isTransactionConflictError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('TransactionConflict') !== -1
    || message.indexOf('DATABASE_TRANSACTION_CONFLICT') !== -1
    || message.indexOf('resource system error') !== -1
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function runTransactionWithRetry(executor, maxRetryCount = 3) {
  let lastError = null

  for (let attempt = 0; attempt < maxRetryCount; attempt += 1) {
    try {
      return await db.runTransaction(executor)
    } catch (error) {
      lastError = error

      if (!isTransactionConflictError(error) || attempt === (maxRetryCount - 1)) {
        throw error
      }

      await wait(80 * (attempt + 1))
    }
  }

  throw lastError || new Error('事务执行失败')
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

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function getChinaDateParts(value) {
  const timestamp = toTimestamp(value)

  if (!timestamp) {
    return null
  }

  const date = new Date(timestamp + CHINA_TIME_OFFSET)

  return {
    year: date.getUTCFullYear(),
    month: padNumber(date.getUTCMonth() + 1),
    day: padNumber(date.getUTCDate())
  }
}

function normalizeDayKey(value) {
  const safeValue = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? safeValue : ''
}

function buildPermissionInfo(userRecord) {
  return {
    activityPermission: !!(userRecord && userRecord.activityPermission)
  }
}

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function getCurrentRewardMeta(currentDate = new Date()) {
  const dateParts = getChinaDateParts(currentDate)
  const year = dateParts ? dateParts.year : new Date(currentDate).getUTCFullYear()
  const month = dateParts ? dateParts.month : padNumber(new Date(currentDate).getUTCMonth() + 1)

  return {
    monthKey: `${year}-${month}`
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

function buildDayKey(item) {
  const createdAtDateParts = getChinaDateParts(item && item.createdAt)

  if (createdAtDateParts) {
    return `${createdAtDateParts.year}-${createdAtDateParts.month}-${createdAtDateParts.day}`
  }

  return normalizeDayKey(item && item.dayKey)
}

function getUniqueDayCount(list) {
  const dayMap = {}

  ;(list || []).forEach((item) => {
    const dayKey = buildDayKey(item)

    if (dayKey) {
      dayMap[dayKey] = true
    }
  })

  return Object.keys(dayMap).length
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

function normalizeEffectMode(value) {
  return value === 'scheduled' ? 'scheduled' : 'immediate'
}

function normalizeThresholdType(value) {
  return value === 'consecutive' ? 'consecutive' : 'accumulated'
}

function isMemberUser(userRecord) {
  const role = normalizeText(userRecord && userRecord.role)
  return !!(userRecord && userRecord.status === 'approved' && (role === 'member' || role === 'admin'))
}

function selectCurrentReadingIncentiveRule(ruleList) {
  return ensureArray(ruleList)
    .filter((item) => item && item.isActive === true)
    .slice()
    .sort((a, b) => {
      const bTimestamp = toTimestamp(b && (b.updatedAt || b.createdAt || b.effectAt)) || 0
      const aTimestamp = toTimestamp(a && (a.updatedAt || a.createdAt || a.effectAt)) || 0
      return bTimestamp - aTimestamp
    })[0] || null
}

async function activateDueReadingIncentiveRule(ruleList, currentTimestamp = Date.now()) {
  const safeRuleList = ensureArray(ruleList)
  const dueRule = safeRuleList
    .filter((item) => {
      const effectAt = toTimestamp(item && item.effectAt)
      return normalizeEffectMode(item && item.effectMode) === 'scheduled'
        && item.isActive !== true
        && !!effectAt
        && effectAt <= currentTimestamp
    })
    .slice()
    .sort((a, b) => {
      const bEffectAt = toTimestamp(b && b.effectAt) || 0
      const aEffectAt = toTimestamp(a && a.effectAt) || 0
      return bEffectAt - aEffectAt
    })[0] || null

  if (!dueRule || !dueRule._id) {
    return safeRuleList
  }

  const now = new Date(currentTimestamp)
  const dueRuleId = normalizeText(dueRule._id)
  const updates = []

  safeRuleList.forEach((item) => {
    const ruleDocId = normalizeText(item && item._id)

    if (!ruleDocId) {
      return
    }

    if (ruleDocId === dueRuleId && item.isActive !== true) {
      updates.push(
        db.collection('reading_incentive_rules').doc(ruleDocId).update({
          data: {
            isActive: true,
            updatedAt: now
          }
        })
      )
      item.isActive = true
      item.updatedAt = now
      return
    }

    if (ruleDocId !== dueRuleId && item.isActive === true) {
      updates.push(
        db.collection('reading_incentive_rules').doc(ruleDocId).update({
          data: {
            isActive: false,
            updatedAt: now
          }
        })
      )
      item.isActive = false
      item.updatedAt = now
    }
  })

  if (updates.length) {
    await Promise.all(updates)
  }

  return safeRuleList
}

function selectCurrentRewardActivity(activityList) {
  return (activityList || [])
    .filter((item) => {
      return item
        && item.status === 'published'
        && normalizeActivityType(item.activityType) === 'rewardClaim'
    })
    .sort((a, b) => {
      const bTimestamp = Number(b && b.publishAt) || toTimestamp(b && (b.updatedAt || b.createdAt)) || 0
      const aTimestamp = Number(a && a.publishAt) || toTimestamp(a && (a.updatedAt || a.createdAt)) || 0

      if (bTimestamp !== aTimestamp) {
        return bTimestamp - aTimestamp
      }

      return (Number(b && b.sortTime) || 0) - (Number(a && a.sortTime) || 0)
    })[0] || null
}

function buildActivityDayRange(activity) {
  const startDayKey = normalizeDayKey(activity && activity.startDate) || buildDayKey({
    createdAt: Number(activity && activity.sortTime) ? new Date(Number(activity.sortTime)) : null
  })
  const endDayKey = normalizeDayKey(activity && activity.endDate)
    || normalizeDayKey(activity && activity.startDate)
    || buildDayKey({
      createdAt: Number(activity && activity.endSortTime) ? new Date(Number(activity.endSortTime)) : null
    })
    || startDayKey

  return {
    startDayKey,
    endDayKey
  }
}

function isDayInClosedRange(dayKey, startDayKey, endDayKey) {
  return !!(dayKey && startDayKey && endDayKey && dayKey >= startDayKey && dayKey <= endDayKey)
}

function buildDateFromDayKey(dayKey) {
  const safeDayKey = normalizeDayKey(dayKey)

  if (!safeDayKey) {
    return null
  }

  const parts = safeDayKey.split('-').map((item) => Number(item))

  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) {
    return null
  }

  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
}

function getDayDiff(previousDayKey, nextDayKey) {
  const previousDate = buildDateFromDayKey(previousDayKey)
  const nextDate = buildDateFromDayKey(nextDayKey)

  if (!previousDate || !nextDate) {
    return Number.MAX_SAFE_INTEGER
  }

  return Math.round((nextDate.getTime() - previousDate.getTime()) / (24 * 60 * 60 * 1000))
}

function buildEligibleRuleDayKeyList(readingLogList, activityId, startDayKey, endDayKey) {
  const dayKeyMap = {}

  ensureArray(readingLogList).forEach((item) => {
    const dayKey = buildDayKey(item)

    if (
      !dayKey
      || normalizeText(item && item.activityId) !== activityId
      || !isDayInClosedRange(dayKey, startDayKey, endDayKey)
    ) {
      return
    }

    dayKeyMap[dayKey] = true
  })

  return Object.keys(dayKeyMap).sort()
}

function getAccumulatedCompletedCount(dayKeyList) {
  return ensureArray(dayKeyList).length
}

function getConsecutiveCompletedCount(dayKeyList) {
  const safeDayKeyList = ensureArray(dayKeyList)

  if (!safeDayKeyList.length) {
    return 0
  }

  let currentCount = 0
  let maxCount = 0
  let previousDayKey = ''

  safeDayKeyList.forEach((dayKey) => {
    if (!previousDayKey) {
      currentCount = 1
      maxCount = 1
      previousDayKey = dayKey
      return
    }

    const diff = getDayDiff(previousDayKey, dayKey)

    if (diff === 1) {
      currentCount += 1
    } else {
      currentCount = 1
    }

    if (currentCount > maxCount) {
      maxCount = currentCount
    }

    previousDayKey = dayKey
  })

  return maxCount
}

function getRuleCompletedCount(dayKeyList, thresholdType) {
  return normalizeThresholdType(thresholdType) === 'consecutive'
    ? getConsecutiveCompletedCount(dayKeyList)
    : getAccumulatedCompletedCount(dayKeyList)
}

function buildRuleBasedReadingProgress(readingLogList, rule, activity, openid) {
  if (!rule || !activity || !openid) {
    return {
      completedCount: 0,
      attended: false,
      isAchieved: false
    }
  }

  const activityId = normalizeText(activity && activity._id)
  const { startDayKey, endDayKey } = buildActivityDayRange(activity)
  const thresholdType = normalizeThresholdType(rule && rule.thresholdType)
  const requireOfflineAttendance = rule && rule.requireOfflineAttendance !== false
  const targetCount = Number(rule && rule.thresholdValue) > 0
    ? Number(rule.thresholdValue)
    : READING_INCENTIVE_TARGET_DAYS
  const relatedDayKeyList = buildEligibleRuleDayKeyList(readingLogList, activityId, startDayKey, endDayKey)
  const attended = ensureArray(activity && activity.registrations).some((item) => {
    return normalizeText(item && item.openid) === openid && item.attended === true
  })
  const completedCount = getRuleCompletedCount(relatedDayKeyList, thresholdType)
  const meetsAttendanceRequirement = requireOfflineAttendance ? attended : true

  return {
    completedCount,
    attended,
    isAchieved: meetsAttendanceRequirement && completedCount >= targetCount
  }
}

async function ensureRewardActivityAutoRegistrationForUser(targetOpenid) {
  const safeTargetOpenid = normalizeText(targetOpenid)

  if (!safeTargetOpenid) {
    return false
  }

  const rewardMeta = getCurrentRewardMeta()
  const [userRes, rewardActivityList, readingRuleList, readingLogList] = await Promise.all([
    db.collection('users').where({ openid: safeTargetOpenid }).limit(1).get().catch(() => ({ data: [] })),
    getAllRecords('activities', {
      status: 'published',
      activityType: 'rewardClaim',
      rewardMonthKey: rewardMeta.monthKey
    }).catch(() => []),
    getAllRecords('reading_incentive_rules').catch((queryError) => {
      if (!isCollectionNotExistError(queryError)) {
        throw queryError
      }

      return []
    }).catch(() => []),
    getAllRecords('reading_logs', {
      openid: safeTargetOpenid
    }).catch(() => [])
  ])
  const userRecord = (userRes.data || [])[0] || null
  const rewardActivity = selectCurrentRewardActivity(rewardActivityList || [])
  const safeReadingRuleList = await activateDueReadingIncentiveRule(readingRuleList || []).catch((error) => {
    console.error('activateDueReadingIncentiveRule error:', error)
    return ensureArray(readingRuleList)
  })
  const currentReadingIncentiveRule = selectCurrentReadingIncentiveRule(safeReadingRuleList)
  const incentiveActivityId = normalizeText(currentReadingIncentiveRule && currentReadingIncentiveRule.activityId)
  const incentiveActivityRes = incentiveActivityId
    ? await db.collection('activities').doc(incentiveActivityId).get().catch(() => ({ data: null }))
    : { data: null }
  const incentiveActivity = incentiveActivityRes.data || null

  if (!isMemberUser(userRecord) || !rewardActivity || !currentReadingIncentiveRule || !incentiveActivity) {
    return false
  }

  const progress = buildRuleBasedReadingProgress(
    readingLogList || [],
    currentReadingIncentiveRule,
    incentiveActivity,
    safeTargetOpenid
  )

  if (!progress.isAchieved) {
    return false
  }

  return runTransactionWithRetry(async (transaction) => {
    const freshRewardActivityRes = await transaction.collection('activities').doc(rewardActivity._id).get()
    const freshRewardActivity = freshRewardActivityRes.data || null

    if (
      !freshRewardActivity
      || freshRewardActivity.status !== 'published'
      || normalizeActivityType(freshRewardActivity.activityType) !== 'rewardClaim'
    ) {
      return false
    }

    const rewardRegistrations = Array.isArray(freshRewardActivity.registrations)
      ? freshRewardActivity.registrations.slice()
      : []

    if (rewardRegistrations.some((item) => normalizeText(item && item.openid) === safeTargetOpenid)) {
      return true
    }

    const now = new Date()

    rewardRegistrations.push({
      openid: safeTargetOpenid,
      createdAt: now,
      autoRegistered: true,
      registerSource: 'system:autoReward'
    })

    await transaction.collection('activities').doc(freshRewardActivity._id).update({
      data: {
        registrations: rewardRegistrations,
        registrationCount: rewardRegistrations.length,
        updatedAt: now
      }
    })

    return true
  })
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const activityId = normalizeText(event.activityId || event.id)
  const targetOpenid = normalizeText(event.targetOpenid)

  if (!activityId || !targetOpenid) {
    return {
      success: false,
      message: '缺少活动或成员信息'
    }
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const userRecord = (userRes.data || [])[0] || null
    const permissionInfo = buildPermissionInfo(userRecord)

    if (!permissionInfo.activityPermission) {
      return {
        success: false,
        message: '当前账号没有活动管理权限'
      }
    }

    const transactionResult = await runTransactionWithRetry(async (transaction) => {
      const activityRes = await transaction.collection('activities').doc(activityId).get()
      const activity = activityRes.data || null

      if (!activity) {
        return {
          success: false,
          message: '活动不存在'
        }
      }

      if (normalizeActivityMode(activity.activityMode) !== 'offline') {
        return {
          success: false,
          message: '仅线下活动支持到场管理'
        }
      }

      const registrations = Array.isArray(activity.registrations) ? activity.registrations.slice() : []
      const targetIndex = registrations.findIndex((item) => {
        return normalizeText(item && item.openid) === targetOpenid
      })

      if (targetIndex < 0) {
        return {
          success: false,
          message: '该成员未报名当前活动'
        }
      }

      const currentRegistration = registrations[targetIndex] || {}
      const attended = currentRegistration.attended === true
      const nextAttended = !attended

      registrations[targetIndex] = {
        ...currentRegistration,
        attended: nextAttended
      }

      await transaction.collection('activities').doc(activityId).update({
        data: {
          registrations,
          updatedAt: new Date()
        }
      })

      return {
        success: true,
        attended: nextAttended,
        message: nextAttended ? '已标记到场' : '已改为缺席'
      }
    })

    if (!transactionResult.success) {
      return transactionResult
    }

    if (transactionResult.attended) {
      await ensureRewardActivityAutoRegistrationForUser(targetOpenid).catch((error) => {
        console.error('ensureRewardActivityAutoRegistrationForUser after markActivityAttendance error:', error)
      })
    }

    return transactionResult
  } catch (error) {
    return {
      success: false,
      message: '保存到场状态失败',
      error: error.message || error
    }
  }
}
