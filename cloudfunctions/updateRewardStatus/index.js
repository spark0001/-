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

function buildMonthKeyFromDateParts(dateParts) {
  if (!dateParts) {
    return ''
  }

  return `${dateParts.year}-${dateParts.month}`
}

function buildMonthKey(item) {
  const createdAtMonthKey = buildMonthKeyFromDateParts(getChinaDateParts(item && item.createdAt))

  if (createdAtMonthKey) {
    return createdAtMonthKey
  }

  const storedMonthKey = normalizeText(item && item.monthKey)

  if (/^\d{4}-\d{2}$/.test(storedMonthKey)) {
    return storedMonthKey
  }

  const storedDayKey = normalizeDayKey(item && item.dayKey)

  return storedDayKey ? storedDayKey.slice(0, 7) : ''
}

function getCurrentRewardMeta(currentDate = new Date()) {
  const dateParts = getChinaDateParts(currentDate)
  const year = dateParts ? dateParts.year : new Date(currentDate).getUTCFullYear()
  const month = dateParts ? dateParts.month : padNumber(new Date(currentDate).getUTCMonth() + 1)

  return {
    monthKey: `${year}-${month}`,
    rewardLabel: `${year}年${month}月奖励`
  }
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

function isEligibleMemberUser(userRecord) {
  const role = normalizeText(userRecord && userRecord.role)
  return !!(userRecord && userRecord.status === 'approved' && (role === 'member' || role === 'admin'))
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

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function isCurrentReadingIncentiveActivity(activity) {
  return !!(
    activity
    && activity.status === 'published'
    && activity.isCurrentReadingIncentive === true
    && normalizeActivityMode(activity.activityMode) === 'offline'
    && normalizeActivityType(activity.activityType) !== 'rewardClaim'
  )
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

function normalizeEffectMode(value) {
  return value === 'scheduled' ? 'scheduled' : 'immediate'
}

function normalizeThresholdType(value) {
  return value === 'consecutive' ? 'consecutive' : 'accumulated'
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
      updates.push(db.collection('reading_incentive_rules').doc(ruleDocId).update({
        data: {
          isActive: true,
          updatedAt: now
        }
      }))
      item.isActive = true
      item.updatedAt = now
      return
    }

    if (ruleDocId !== dueRuleId && item.isActive === true) {
      updates.push(db.collection('reading_incentive_rules').doc(ruleDocId).update({
        data: {
          isActive: false,
          updatedAt: now
        }
      }))
      item.isActive = false
      item.updatedAt = now
    }
  })

  if (updates.length) {
    await Promise.all(updates)
  }

  return safeRuleList
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

async function getCurrentReadingIncentiveProgress(openid) {
  const [readingRuleList, readingLogList] = await Promise.all([
    getAllRecords('reading_incentive_rules').catch(() => []),
    getAllRecords('reading_logs', {
      openid
    }).catch(() => [])
  ])
  const safeReadingRuleList = await activateDueReadingIncentiveRule(readingRuleList || []).catch(() => ensureArray(readingRuleList))
  const currentReadingIncentiveRule = selectCurrentReadingIncentiveRule(safeReadingRuleList)
  const incentiveActivityId = normalizeText(currentReadingIncentiveRule && currentReadingIncentiveRule.activityId)
  const activityRes = incentiveActivityId
    ? await db.collection('activities').doc(incentiveActivityId).get().catch(() => ({ data: null }))
    : { data: null }
  const activity = activityRes.data || null

  if (!currentReadingIncentiveRule || !activity) {
    return {
      activity: null,
      completedCount: 0,
      attended: false,
      isAchieved: false,
      thresholdType: 'accumulated',
      requireOfflineAttendance: true,
      targetCount: 0
    }
  }

  const activityId = normalizeText(activity && activity._id)
  const { startDayKey, endDayKey } = buildActivityDayRange(activity)
  const thresholdType = normalizeThresholdType(currentReadingIncentiveRule && currentReadingIncentiveRule.thresholdType)
  const requireOfflineAttendance = currentReadingIncentiveRule && currentReadingIncentiveRule.requireOfflineAttendance !== false
  const targetCount = Number(currentReadingIncentiveRule && currentReadingIncentiveRule.thresholdValue) > 0
    ? Number(currentReadingIncentiveRule.thresholdValue)
    : READING_INCENTIVE_TARGET_DAYS
  const relatedDayKeyList = buildEligibleRuleDayKeyList(readingLogList, activityId, startDayKey, endDayKey)
  const registrations = ensureArray(activity && activity.registrations)
  const attended = registrations.some((item) => {
    return normalizeText(item && item.openid) === openid && item.attended === true
  })
  const completedCount = getRuleCompletedCount(relatedDayKeyList, thresholdType)
  const meetsAttendanceRequirement = requireOfflineAttendance ? attended : true

  return {
    activity,
    completedCount,
    attended,
    isAchieved: meetsAttendanceRequirement && completedCount >= targetCount,
    thresholdType,
    requireOfflineAttendance,
    targetCount
  }
}

function isCollectionNotExistError(error) {
  const message = normalizeText(
    (error && error.errMsg)
      || (error && error.message)
      || error
  )

  return message.includes('DATABASE_COLLECTION_NOT_EXIST')
    || message.includes('collection not exists')
    || message.includes('Db or Table not exist')
}

async function ensureCollection(collectionName) {
  if (!db || typeof db.createCollection !== 'function') {
    return false
  }

  try {
    await db.createCollection(collectionName)
    return true
  } catch (error) {
    return false
  }
}

async function getAllRecords(collectionName, whereData) {
  const pageSize = 100
  let skip = 0
  let records = []

  while (true) {
    const res = await db.collection(collectionName)
      .where(whereData)
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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const operatorOpenid = wxContext.OPENID
  const targetOpenid = normalizeText(event.targetOpenid)
  const status = normalizeText(event.status)
  const inputRewardActivityId = normalizeText(event.rewardActivityId)
  const inputRewardActivityTitle = normalizeText(event.rewardActivityTitle)

  if (!targetOpenid) {
    return {
      success: false,
      message: '缺少成员标识'
    }
  }

  if (status !== 'rewarded' && status !== 'waived' && status !== 'pending') {
    return {
      success: false,
      message: '不支持的奖励状态'
    }
  }

  try {
    const [operatorRes, targetUserRes] = await Promise.all([
      db.collection('users').where({ openid: operatorOpenid }).limit(1).get(),
      db.collection('users').where({ openid: targetOpenid }).limit(1).get()
    ])

    const operatorRecord = (operatorRes.data || [])[0] || null
    const targetUserRecord = (targetUserRes.data || [])[0] || null
    const permissionInfo = buildPermissionInfo(operatorRecord)

    if (!permissionInfo.rewardPermission) {
      return {
        success: false,
        message: '当前账号没有奖励管理权限'
      }
    }

    if (!isEligibleMemberUser(targetUserRecord)) {
      return {
        success: false,
        message: '该用户不是可发放奖励的正式成员'
      }
    }

    const rewardMeta = getCurrentRewardMeta()
    const readingIncentiveProgress = await getCurrentReadingIncentiveProgress(targetOpenid)

    if (!readingIncentiveProgress.isAchieved) {
      return {
        success: false,
        message: '该成员尚未达成当前阅读激励规则'
      }
    }

    let rewardActivityId = ''
    let rewardActivityTitle = ''

    if (status === 'rewarded') {
      let joinedActivity = null

      if (inputRewardActivityId) {
        const joinedActivityRes = await db.collection('activities').doc(inputRewardActivityId).get().catch(() => ({ data: null }))
        const activityRecord = joinedActivityRes.data || null
        const registrations = Array.isArray(activityRecord && activityRecord.registrations) ? activityRecord.registrations : []

        if (
          activityRecord
          && activityRecord.status === 'published'
          && normalizeText(activityRecord.activityType) === 'rewardClaim'
          && registrations.some((item) => item && item.openid === targetOpenid)
        ) {
          joinedActivity = activityRecord
        }
      }

      if (!joinedActivity) {
        const rewardActivityList = await getAllRecords('activities', {
          status: 'published',
          activityType: 'rewardClaim',
          rewardMonthKey: rewardMeta.monthKey
        }).catch(() => [])

        joinedActivity = (rewardActivityList || []).find((activity) => {
          const registrations = Array.isArray(activity.registrations) ? activity.registrations : []
          return registrations.some((item) => item && item.openid === targetOpenid)
        }) || null
      }

      if (!joinedActivity) {
        return {
          success: false,
          message: '该成员尚未报名本月奖励领取活动'
        }
      }

      rewardActivityId = joinedActivity._id || inputRewardActivityId
      rewardActivityTitle = joinedActivity.title || inputRewardActivityTitle || '奖励领取活动'
    }

    let existedRes = { data: [] }

    try {
      existedRes = await db.collection('reward_records').where({
        openid: targetOpenid,
        monthKey: rewardMeta.monthKey
      }).limit(1).get()
    } catch (error) {
      if (!isCollectionNotExistError(error)) {
        throw error
      }
    }

    if (status === 'pending') {
      if ((existedRes.data || []).length) {
        await db.collection('reward_records').doc(existedRes.data[0]._id).remove().catch((error) => {
          if (!isCollectionNotExistError(error)) {
            throw error
          }
        })
      }

      return {
        success: true,
        message: '已取消已发奖励标记'
      }
    }

    const now = new Date()
    const nextData = {
      openid: targetOpenid,
      monthKey: rewardMeta.monthKey,
      rewardLabel: rewardMeta.rewardLabel,
      status,
      rewardActivityId,
      rewardActivityTitle,
      updatedBy: operatorOpenid,
      updatedAt: now
    }

    if ((existedRes.data || []).length) {
      await db.collection('reward_records').doc(existedRes.data[0]._id).update({
        data: nextData
      })
    } else {
      try {
        await db.collection('reward_records').add({
          data: {
            ...nextData,
            createdAt: now
          }
        })
      } catch (error) {
        if (!isCollectionNotExistError(error)) {
          throw error
        }

        await ensureCollection('reward_records')

        await db.collection('reward_records').add({
          data: {
            ...nextData,
            createdAt: now
          }
        })
      }
    }

    return {
      success: true,
      message: status === 'rewarded' ? '已标记本月奖励' : '已标记放弃奖励'
    }
  } catch (error) {
    return {
      success: false,
      message: '奖励状态保存失败',
      error: error.message || error
    }
  }
}
