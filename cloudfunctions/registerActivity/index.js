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
    monthKey: `${year}-${month}`,
    rewardLabel: `${year}年${month}月奖励`
  }
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

function isMemberUser(userRecord) {
  const role = normalizeText(userRecord && userRecord.role)
  return !!(userRecord && userRecord.status === 'approved' && (role === 'member' || role === 'admin'))
}

function getActivityTimeRange(activity) {
  const timeType = normalizeText(activity && activity.timeType) || 'singlePoint'
  const startDate = normalizeText(activity && activity.startDate)
  const endDate = normalizeText(activity && activity.endDate) || startDate
  const startTimeInput = normalizeText(activity && activity.startTime)
  const endTimeInput = normalizeText(activity && activity.endTime)
  const hasExactTime = !!(activity && activity.hasExactTime)

  if (timeType === 'singlePoint' && startDate && startTimeInput) {
    const timestamp = getTimestamp(startDate, startTimeInput)

    if (!Number.isNaN(timestamp)) {
      return {
        startTimestamp: timestamp,
        endTimestamp: timestamp
      }
    }
  }

  if (timeType === 'singleDayRange' && startDate && startTimeInput && endTimeInput) {
    const startTimestamp = getTimestamp(startDate, startTimeInput)
    const endTimestamp = getTimestamp(startDate, endTimeInput)

    if (!Number.isNaN(startTimestamp) && !Number.isNaN(endTimestamp)) {
      return {
        startTimestamp,
        endTimestamp
      }
    }
  }

  if (timeType === 'dateRange' && startDate && endDate) {
    const startTime = hasExactTime ? (startTimeInput || '00:00') : '00:00'
    const endTime = hasExactTime ? (endTimeInput || '23:59') : '23:59'
    const startTimestamp = getTimestamp(startDate, startTime)
    const endTimestamp = getTimestamp(endDate, endTime)

    if (!Number.isNaN(startTimestamp) && !Number.isNaN(endTimestamp)) {
      return {
        startTimestamp,
        endTimestamp
      }
    }
  }

  return {
    startTimestamp: Number(activity && activity.sortTime) || 0,
    endTimestamp: Number(activity && activity.endSortTime) || Number(activity && activity.sortTime) || 0
  }
}

function isActivityOngoing(activity, currentTimestamp = Date.now()) {
  const { startTimestamp, endTimestamp } = getActivityTimeRange(activity)

  if (!startTimestamp || !endTimestamp) {
    return false
  }

  return currentTimestamp >= startTimestamp && currentTimestamp <= endTimestamp
}

function isActivityEnded(activity, currentTimestamp = Date.now()) {
  const { endTimestamp } = getActivityTimeRange(activity)

  if (!endTimestamp) {
    return false
  }

  return currentTimestamp > endTimestamp
}

function getPublishAt(activity) {
  return Number(activity && activity.publishAt) || 0
}

function isScheduledActivity(activity, currentTimestamp = Date.now()) {
  const publishAt = getPublishAt(activity)

  return !!(publishAt && publishAt > currentTimestamp)
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const activityId = normalizeText(event.activityId || event.id)

  if (!activityId) {
    return {
      success: false,
      message: '缺少活动ID'
    }
  }

  try {
    const [userRes, readingIncentiveProgress] = await Promise.all([
      db.collection('users').where({ openid }).limit(1).get()
        .catch(() => ({ data: [] })),
      getCurrentReadingIncentiveProgress(openid).catch(() => ({
        activity: null,
        completedCount: 0,
        attended: false,
        isAchieved: false,
        thresholdType: 'accumulated',
        requireOfflineAttendance: true,
        targetCount: 0
      }))
    ])
    const userRecord = (userRes.data && userRes.data[0]) || null

    return await runTransactionWithRetry(async (transaction) => {
      const detailRes = await transaction.collection('activities').doc(activityId).get()
      const activity = detailRes.data || null

      if (!activity) {
        return {
          success: false,
          message: '活动不存在'
        }
      }

      if (activity.status !== 'published') {
        return {
          success: false,
          message: '当前活动暂不可报名'
        }
      }

      if (isScheduledActivity(activity)) {
        return {
          success: false,
          message: '活动预约发布中，暂不可报名'
        }
      }

      if (isActivityEnded(activity)) {
        return {
          success: false,
          message: '活动已结束，无法报名'
        }
      }

      const activityType = normalizeActivityType(activity.activityType)

      if (activityType === 'rewardClaim') {
        if (!isMemberUser(userRecord) || !readingIncentiveProgress.isAchieved) {
          return {
            success: false,
            message: '仅满足当前阅读激励规则的成员可报名领取奖励'
          }
        }
      } else if (!isMemberUser(userRecord)) {
        const activityMode = normalizeActivityMode(activity.activityMode)

        if (activityMode !== 'offline' || !isActivityOngoing(activity)) {
          return {
            success: false,
            message: '非成员仅可报名活动期间内的线下活动'
          }
        }
      }

      const registrations = Array.isArray(activity.registrations) ? activity.registrations.slice() : []
      const hasRegistered = registrations.some((item) => item && item.openid === openid)

      if (hasRegistered) {
        return {
          success: false,
          message: '你已经报名过该活动'
        }
      }

      registrations.push({
        openid,
        createdAt: new Date()
      })

      await transaction.collection('activities').doc(activityId).update({
        data: {
          registrations,
          registrationCount: registrations.length,
          updatedAt: new Date()
        }
      })

      return {
        success: true,
        message: '报名成功',
        registrationCount: registrations.length
      }
    })
  } catch (error) {
    return {
      success: false,
      message: '活动报名失败',
      error: error.message || error
    }
  }
}
