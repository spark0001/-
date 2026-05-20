const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000
const READING_INCENTIVE_TARGET_DAYS = 10

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
  const safeValue = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? safeValue : ''
}

function normalizeMonthKey(value) {
  const safeValue = String(value || '').trim()
  return /^\d{4}-\d{2}$/.test(safeValue) ? safeValue : ''
}

function normalizeText(value) {
  return String(value || '').trim()
}

function buildDayKeyFromDateParts(dateParts) {
  if (!dateParts) {
    return ''
  }

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`
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

  const storedMonthKey = normalizeMonthKey(item && item.monthKey)

  if (storedMonthKey) {
    return storedMonthKey
  }

  const storedDayKey = normalizeDayKey(item && item.dayKey)

  return storedDayKey ? storedDayKey.slice(0, 7) : ''
}

function getCurrentMonthKey(currentDate = Date.now()) {
  return buildMonthKeyFromDateParts(getChinaDateParts(currentDate))
}

function buildEmptyMonthlyGiftProgressResponse(message = '') {
  return {
    success: true,
    fallback: true,
    message: normalizeText(message),
    monthKey: getCurrentMonthKey(),
    activityId: '',
    activityTitle: '',
    startDayKey: '',
    endDayKey: '',
    thresholdType: 'accumulated',
    requireOfflineAttendance: true,
    completedCount: 0,
    remainingCount: 0,
    attended: false,
    isAchieved: false,
    targetCount: 0,
    currentRewardActivityId: '',
    currentRewardActivityTitle: '',
    showRewardShare: false
  }
}

function getCurrentRewardMeta(currentDate = new Date()) {
  const dateParts = getChinaDateParts(currentDate)
  const year = dateParts ? dateParts.year : new Date(currentDate).getUTCFullYear()
  const month = dateParts ? dateParts.month : padNumber(new Date(currentDate).getUTCMonth() + 1)

  return {
    monthKey: `${year}-${month}`
  }
}

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function isMemberUser(userRecord) {
  const role = normalizeText(userRecord && userRecord.role)
  return !!(userRecord && userRecord.status === 'approved' && (role === 'member' || role === 'admin'))
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
  const createdAtDayKey = buildDayKeyFromDateParts(getChinaDateParts(item && item.createdAt))

  if (createdAtDayKey) {
    return createdAtDayKey
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

function getPublishAt(activity) {
  return Number(activity && activity.publishAt) || 0
}

function isScheduledActivity(activity, currentTimestamp = Date.now()) {
  const publishAt = getPublishAt(activity)

  return !!(publishAt && publishAt > currentTimestamp)
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

function isRewardShareActivitySelectable(activity, currentTimestamp = Date.now()) {
  const { endTimestamp } = getActivityTimeRange(activity)
  const safeEndTimestamp = Number(endTimestamp) || 0

  if (!safeEndTimestamp) {
    return false
  }

  if (isActivityOngoing(activity, currentTimestamp)) {
    return true
  }

  return currentTimestamp > safeEndTimestamp && currentTimestamp - safeEndTimestamp <= 30 * 24 * 60 * 60 * 1000
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

function selectCurrentReadingIncentiveActivity(activityList) {
  return (activityList || [])
    .filter(isCurrentReadingIncentiveActivity)
    .sort((a, b) => {
      const bTimestamp = toTimestamp(b && (b.updatedAt || b.createdAt)) || 0
      const aTimestamp = toTimestamp(a && (a.updatedAt || a.createdAt)) || 0
      return bTimestamp - aTimestamp
    })[0] || null
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

function getActivityTitle(activity) {
  return normalizeText(activity && activity.title)
}

function buildLegacyReadingIncentiveRule(activity) {
  const activityId = normalizeText(activity && activity._id)

  if (!activityId) {
    return null
  }

  return {
    _id: `legacy:${activityId}`,
    ruleId: `legacy:${activityId}`,
    isActive: true,
    effectMode: 'immediate',
    activityId,
    activityTitle: getActivityTitle(activity),
    requireOfflineAttendance: true,
    thresholdType: 'accumulated',
    thresholdUnit: 'days',
    thresholdValue: READING_INCENTIVE_TARGET_DAYS,
    createdAt: activity && (activity.updatedAt || activity.createdAt) || null,
    updatedAt: activity && (activity.updatedAt || activity.createdAt) || null
  }
}

function isDayInClosedRange(dayKey, startDayKey, endDayKey) {
  return !!(dayKey && startDayKey && endDayKey && dayKey >= startDayKey && dayKey <= endDayKey)
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

function selectScheduledReadingIncentiveRule(ruleList, currentTimestamp = Date.now()) {
  return ensureArray(ruleList)
    .filter((item) => {
      const effectAt = toTimestamp(item && item.effectAt)
      return normalizeEffectMode(item && item.effectMode) === 'scheduled'
        && item.isActive !== true
        && !!effectAt
        && effectAt > currentTimestamp
    })
    .slice()
    .sort((a, b) => {
      const aEffectAt = toTimestamp(a && a.effectAt) || 0
      const bEffectAt = toTimestamp(b && b.effectAt) || 0
      return aEffectAt - bEffectAt
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

function resolveCurrentReadingIncentiveRule(ruleList, activityList) {
  const currentRule = selectCurrentReadingIncentiveRule(ruleList)

  if (currentRule) {
    return currentRule
  }

  return buildLegacyReadingIncentiveRule(selectCurrentReadingIncentiveActivity(activityList))
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

function buildCurrentReadingIncentiveProgress(readingLogList, rule, activity, openid) {
  if (!rule || !activity || !openid) {
    return {
      ruleId: '',
      activityId: '',
      activityTitle: '',
      startDayKey: '',
      endDayKey: '',
      thresholdType: 'accumulated',
      requireOfflineAttendance: true,
      targetCount: 0,
      completedCount: 0,
      remainingCount: 0,
      attended: false,
      isAchieved: false
    }
  }

  const activityId = normalizeText(activity && activity._id)
  const thresholdType = normalizeThresholdType(rule && rule.thresholdType)
  const requireOfflineAttendance = rule && rule.requireOfflineAttendance !== false
  const targetCount = Number(rule && rule.thresholdValue) > 0
    ? Number(rule.thresholdValue)
    : READING_INCENTIVE_TARGET_DAYS
  const { startDayKey, endDayKey } = buildActivityDayRange(activity)
  const relatedDayKeyList = buildEligibleRuleDayKeyList(readingLogList, activityId, startDayKey, endDayKey)
  const registrations = Array.isArray(activity.registrations) ? activity.registrations : []
  const attended = registrations.some((item) => {
    return normalizeText(item && item.openid) === openid && item.attended === true
  })
  const completedCount = getRuleCompletedCount(relatedDayKeyList, thresholdType)
  const meetsAttendanceRequirement = requireOfflineAttendance ? attended : true

  return {
    ruleId: normalizeText(rule && (rule.ruleId || rule._id)),
    activityId,
    activityTitle: getActivityTitle(activity),
    startDayKey,
    endDayKey,
    thresholdType,
    requireOfflineAttendance,
    targetCount,
    completedCount,
    remainingCount: completedCount >= targetCount
      ? 0
      : targetCount - completedCount,
    attended,
    isAchieved: meetsAttendanceRequirement && completedCount >= targetCount
  }
}

async function ensureCurrentRewardActivityRegistrationForUser({
  openid,
  userRecord,
  progress,
  rewardActivity
}) {
  if (!openid || !isMemberUser(userRecord) || !progress || !progress.isAchieved || !rewardActivity || !rewardActivity._id) {
    return {
      rewardActivity,
      registered: false
    }
  }

  const registrations = Array.isArray(rewardActivity.registrations) ? rewardActivity.registrations.slice() : []
  const hasRegistered = registrations.some((item) => normalizeText(item && item.openid) === openid)

  if (hasRegistered) {
    return {
      rewardActivity,
      registered: true
    }
  }

  return runTransactionWithRetry(async (transaction) => {
    const freshRewardActivityRes = await transaction.collection('activities').doc(rewardActivity._id).get()
    const freshRewardActivity = freshRewardActivityRes.data || null

    if (
      !freshRewardActivity
      || freshRewardActivity.status !== 'published'
      || normalizeActivityType(freshRewardActivity.activityType) !== 'rewardClaim'
    ) {
      return {
        rewardActivity,
        registered: false
      }
    }

    const freshRegistrations = Array.isArray(freshRewardActivity.registrations)
      ? freshRewardActivity.registrations.slice()
      : []

    if (freshRegistrations.some((item) => normalizeText(item && item.openid) === openid)) {
      return {
        rewardActivity: freshRewardActivity,
        registered: true
      }
    }

    const now = new Date()

    freshRegistrations.push({
      openid,
      createdAt: now,
      autoRegistered: true,
      registerSource: 'system:autoReward'
    })

    await transaction.collection('activities').doc(freshRewardActivity._id).update({
      data: {
        registrations: freshRegistrations,
        registrationCount: freshRegistrations.length,
        updatedAt: now
      }
    })

    return {
      rewardActivity: {
        ...freshRewardActivity,
        registrations: freshRegistrations,
        registrationCount: freshRegistrations.length,
        updatedAt: now
      },
      registered: true
    }
  })
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const monthKey = getCurrentMonthKey()
    const rewardMeta = getCurrentRewardMeta()
    const [readingLogList, activityList, userRes, rewardActivityList, readingRuleList] = await Promise.all([
      getAllRecords('reading_logs', {
        openid
      }),
      getAllRecords('activities', {
        status: 'published'
      }).catch(() => []),
      db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] })),
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
      })
    ])
    const safeReadingRuleList = await activateDueReadingIncentiveRule(readingRuleList || []).catch((error) => {
      console.error('activateDueReadingIncentiveRule error:', error)
      return ensureArray(readingRuleList)
    })
    const currentReadingIncentiveRule = resolveCurrentReadingIncentiveRule(
      safeReadingRuleList || [],
      activityList || []
    )
    const currentReadingIncentiveActivity = ensureArray(activityList).find((item) => {
      return normalizeText(item && item._id) === normalizeText(currentReadingIncentiveRule && currentReadingIncentiveRule.activityId)
    }) || null
    const progress = buildCurrentReadingIncentiveProgress(
      readingLogList || [],
      currentReadingIncentiveRule,
      currentReadingIncentiveActivity,
      openid
    )
    const userRecord = (userRes.data || [])[0] || null
    const currentRewardActivity = selectCurrentRewardActivity(rewardActivityList || [])
    const rewardRegistrationResult = await ensureCurrentRewardActivityRegistrationForUser({
      openid,
      userRecord,
      progress,
      rewardActivity: currentRewardActivity
    }).catch((error) => {
      return {
        rewardActivity: currentRewardActivity,
        registered: false
      }
    })
    const resolvedRewardActivity = rewardRegistrationResult.rewardActivity || currentRewardActivity
    const showRewardShare = !!(
      rewardRegistrationResult.registered
      && resolvedRewardActivity
      && !isScheduledActivity(resolvedRewardActivity)
      && isRewardShareActivitySelectable(resolvedRewardActivity)
    )

    return {
      success: true,
      monthKey,
      activityId: progress.activityId,
      activityTitle: progress.activityTitle,
      startDayKey: progress.startDayKey,
      endDayKey: progress.endDayKey,
      thresholdType: progress.thresholdType,
      requireOfflineAttendance: progress.requireOfflineAttendance,
      completedCount: progress.completedCount,
      remainingCount: progress.remainingCount,
      attended: progress.attended,
      isAchieved: progress.isAchieved,
      targetCount: progress.targetCount,
      currentRewardActivityId: normalizeText(resolvedRewardActivity && resolvedRewardActivity._id),
      currentRewardActivityTitle: normalizeText(resolvedRewardActivity && resolvedRewardActivity.title),
      showRewardShare
    }
  } catch (error) {
    return buildEmptyMonthlyGiftProgressResponse(
      normalizeText(error && (error.errMsg || error.message)) || '获取月度进度失败'
    )
  }
}
