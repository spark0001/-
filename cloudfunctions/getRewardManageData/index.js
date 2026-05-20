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

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
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
      : (superAdmin || activityPermission),
    activityPermission
  }
}

function buildTimeText(activity) {
  if (activity.timeText) {
    return activity.timeText
  }

  if (activity.activityTime) {
    return activity.activityTime
  }

  if (activity.timeType === 'singlePoint' && activity.startDate && activity.startTime) {
    return `${activity.startDate} ${activity.startTime}`
  }

  if (activity.timeType === 'singleDayRange' && activity.startDate && activity.startTime && activity.endTime) {
    return `${activity.startDate} ${activity.startTime} - ${activity.endTime}`
  }

  if (activity.startDate && activity.endDate) {
    return activity.hasExactTime
      ? `${activity.startDate} ${activity.startTime} ~ ${activity.endDate} ${activity.endTime}`
      : `${activity.startDate} ~ ${activity.endDate}`
  }

  return ''
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

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function getLatestApplicationMap(applicationList) {
  const applicationMap = {}

  ;(applicationList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (!openid) {
      return
    }

    const currentTimestamp = toTimestamp(item && item.createdAt) || 0
    const existedTimestamp = toTimestamp(applicationMap[openid] && applicationMap[openid].createdAt) || 0

    if (!applicationMap[openid] || currentTimestamp >= existedTimestamp) {
      applicationMap[openid] = item
    }
  })

  return applicationMap
}

function getCompletedCountMap(readingLogList) {
  const countMap = {}
  const openidDayMap = {}

  ;(readingLogList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)
    const createdAtDateParts = getChinaDateParts(item && item.createdAt)
    const dayKey = createdAtDateParts
      ? `${createdAtDateParts.year}-${createdAtDateParts.month}-${createdAtDateParts.day}`
      : normalizeDayKey(item && item.dayKey)

    if (!openid || !dayKey) {
      return
    }

    if (!openidDayMap[openid]) {
      openidDayMap[openid] = {}
    }

    openidDayMap[openid][dayKey] = true
  })

  Object.keys(openidDayMap).forEach((openid) => {
    countMap[openid] = Object.keys(openidDayMap[openid]).length
  })

  return countMap
}

function buildDayKey(item) {
  const createdAtDayKey = buildDayKeyFromDateParts(getChinaDateParts(item && item.createdAt))

  if (createdAtDayKey) {
    return createdAtDayKey
  }

  return normalizeDayKey(item && item.dayKey)
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

function isReadingIncentiveActivityCandidate(activity) {
  return !!(
    activity
    && activity.status === 'published'
    && normalizeActivityMode(activity.activityMode) === 'offline'
    && normalizeActivityType(activity.activityType) !== 'rewardClaim'
    && (
      activity.isReadingIncentiveActivity === true
      || activity.isCurrentReadingIncentive === true
    )
  )
}

function isOfflineNormalPublishedActivity(activity) {
  return !!(
    activity
    && activity.status === 'published'
    && normalizeActivityMode(activity.activityMode) === 'offline'
    && normalizeActivityType(activity.activityType) !== 'rewardClaim'
  )
}

function isCurrentReadingIncentiveActivity(activity) {
  return !!(
    isReadingIncentiveActivityCandidate(activity)
    && activity.isCurrentReadingIncentive === true
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

function selectRewardManageReadingIncentiveActivity(activityList, selectedActivityId) {
  const safeSelectedActivityId = normalizeText(selectedActivityId)
  const safeActivityList = ensureArray(activityList).filter(isReadingIncentiveActivityCandidate)

  if (safeSelectedActivityId) {
    const matchedActivity = safeActivityList.find((item) => normalizeText(item && item._id) === safeSelectedActivityId)

    if (matchedActivity) {
      return matchedActivity
    }
  }

  return selectCurrentReadingIncentiveActivity(safeActivityList)
}

function buildReadingIncentiveActivityOptionList(activityList, currentActivityId) {
  const safeCurrentActivityId = normalizeText(currentActivityId)

  return ensureArray(activityList)
    .filter(isReadingIncentiveActivityCandidate)
    .slice()
    .sort((a, b) => {
      const isCurrentA = normalizeText(a && a._id) === safeCurrentActivityId ? 1 : 0
      const isCurrentB = normalizeText(b && b._id) === safeCurrentActivityId ? 1 : 0

      if (isCurrentB !== isCurrentA) {
        return isCurrentB - isCurrentA
      }

      return (Number(b && b.sortTime) || 0) - (Number(a && a.sortTime) || 0)
    })
    .map((item) => {
      const { startDayKey, endDayKey } = buildActivityDayRange(item)

      return {
        _id: item && item._id ? item._id : '',
        title: (item && item.title) || '未命名活动',
        timeText: buildTimeText(item || {}),
        startDayKey,
        endDayKey,
        isCurrent: normalizeText(item && item._id) === safeCurrentActivityId
      }
    })
}

function buildReadingIncentiveRuleActivityOptionList(activityList, selectedActivityId) {
  const safeSelectedActivityId = normalizeText(selectedActivityId)

  return ensureArray(activityList)
    .filter(isOfflineNormalPublishedActivity)
    .slice()
    .sort((a, b) => {
      const isSelectedA = normalizeText(a && a._id) === safeSelectedActivityId ? 1 : 0
      const isSelectedB = normalizeText(b && b._id) === safeSelectedActivityId ? 1 : 0

      if (isSelectedB !== isSelectedA) {
        return isSelectedB - isSelectedA
      }

      return (Number(b && b.sortTime) || 0) - (Number(a && a.sortTime) || 0)
    })
    .map((item) => {
      const { startDayKey, endDayKey } = buildActivityDayRange(item)

      return {
        _id: item && item._id ? item._id : '',
        title: (item && item.title) || '未命名活动',
        timeText: buildTimeText(item || {}),
        startDayKey,
        endDayKey
      }
    })
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

function buildUniqueSortedDayKeyList(dayMap) {
  return Object.keys(dayMap || {}).sort()
}

function getRuleCompletedCount(dayKeyList, thresholdType) {
  const safeDayKeyList = ensureArray(dayKeyList)

  if (normalizeThresholdType(thresholdType) !== 'consecutive') {
    return safeDayKeyList.length
  }

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

function buildCompletedCountMapByReadingRule(readingLogList, incentiveActivity, readingRule) {
  if (!readingRule || !incentiveActivity || !incentiveActivity._id) {
    return {}
  }

  const countMap = {}
  const openidDayMap = {}
  const activityId = normalizeText(incentiveActivity._id)
  const { startDayKey, endDayKey } = buildActivityDayRange(incentiveActivity)

  ;(readingLogList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)
    const dayKey = buildDayKey(item)

    if (!openid || !dayKey || normalizeText(item && item.activityId) !== activityId || !isDayInClosedRange(dayKey, startDayKey, endDayKey)) {
      return
    }

    if (!openidDayMap[openid]) {
      openidDayMap[openid] = {}
    }

    openidDayMap[openid][dayKey] = true
  })

  Object.keys(openidDayMap).forEach((openid) => {
    countMap[openid] = getRuleCompletedCount(
      buildUniqueSortedDayKeyList(openidDayMap[openid]),
      readingRule && readingRule.thresholdType
    )
  })

  return countMap
}

function buildAttendedOpenidMap(incentiveActivity) {
  const attendedMap = {}
  const registrations = Array.isArray(incentiveActivity && incentiveActivity.registrations) ? incentiveActivity.registrations : []

  registrations.forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (openid && item.attended === true) {
      attendedMap[openid] = true
    }
  })

  return attendedMap
}

function buildAchievedOpenidMap(readingRule, completedCountMap, attendedOpenidMap) {
  if (!readingRule) {
    return {}
  }

  const achievedMap = {}
  const targetCount = Number(readingRule && readingRule.thresholdValue) > 0
    ? Number(readingRule.thresholdValue)
    : READING_INCENTIVE_TARGET_DAYS
  const requireOfflineAttendance = readingRule && readingRule.requireOfflineAttendance !== false

  Object.keys(completedCountMap || {}).forEach((openid) => {
    const completedCount = Number(completedCountMap[openid]) || 0

    if (completedCount >= targetCount && (!requireOfflineAttendance || attendedOpenidMap[openid])) {
      achievedMap[openid] = true
    }
  })

  return achievedMap
}

function buildChinaDateTimeParts(value) {
  const timestamp = toTimestamp(value)

  if (!timestamp) {
    return null
  }

  const date = new Date(timestamp + CHINA_TIME_OFFSET)

  return {
    year: date.getUTCFullYear(),
    month: padNumber(date.getUTCMonth() + 1),
    day: padNumber(date.getUTCDate()),
    hour: padNumber(date.getUTCHours()),
    minute: padNumber(date.getUTCMinutes())
  }
}

function getReadingIncentiveRuleEffectText(rule) {
  const safeRule = rule || {}
  const effectMode = normalizeEffectMode(safeRule.effectMode)

  if (effectMode === 'immediate') {
    return '立即生效'
  }

  const dateTimeParts = buildChinaDateTimeParts(safeRule.effectAt)

  if (!dateTimeParts) {
    return '预约生效'
  }

  return `预约于 ${dateTimeParts.year}-${dateTimeParts.month}-${dateTimeParts.day} ${dateTimeParts.hour}:${dateTimeParts.minute} 生效`
}

function buildReadingIncentiveRuleItem(rule, activityMap = {}) {
  if (!rule) {
    return null
  }

  const activityId = normalizeText(rule.activityId)
  const matchedActivity = activityMap[activityId] || null
  const dateTimeParts = buildChinaDateTimeParts(rule.effectAt)
  const thresholdType = normalizeThresholdType(rule.thresholdType)

  return {
    ruleId: normalizeText(rule.ruleId || rule._id),
    isActive: rule.isActive === true,
    effectMode: normalizeEffectMode(rule.effectMode),
    effectAt: toTimestamp(rule.effectAt),
    effectAtDate: dateTimeParts ? `${dateTimeParts.year}-${dateTimeParts.month}-${dateTimeParts.day}` : '',
    effectAtTime: dateTimeParts ? `${dateTimeParts.hour}:${dateTimeParts.minute}` : '',
    effectText: getReadingIncentiveRuleEffectText(rule),
    activityId,
    activityTitle: normalizeText(rule.activityTitle) || normalizeText(matchedActivity && matchedActivity.title),
    requireOfflineAttendance: rule.requireOfflineAttendance !== false,
    thresholdType,
    thresholdTypeText: thresholdType === 'consecutive' ? '连续' : '累计',
    thresholdUnit: 'days',
    thresholdUnitText: '天数',
    thresholdValue: Number(rule.thresholdValue) > 0 ? Number(rule.thresholdValue) : READING_INCENTIVE_TARGET_DAYS,
    updatedAt: toTimestamp(rule.updatedAt),
    createdAt: toTimestamp(rule.createdAt)
  }
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
    effectAt: null,
    activityId,
    activityTitle: normalizeText(activity && activity.title),
    requireOfflineAttendance: true,
    thresholdType: 'accumulated',
    thresholdUnit: 'days',
    thresholdValue: READING_INCENTIVE_TARGET_DAYS,
    updatedAt: activity && (activity.updatedAt || activity.createdAt) || null,
    createdAt: activity && (activity.updatedAt || activity.createdAt) || null
  }
}

function resolveCurrentReadingIncentiveRule(ruleList, activityList) {
  const currentRule = selectCurrentReadingIncentiveRule(ruleList)

  if (currentRule) {
    return currentRule
  }

  return buildLegacyReadingIncentiveRule(selectCurrentReadingIncentiveActivity(activityList))
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

async function appendAchievedMembersToRewardActivity(rewardActivity, achievedOpenidMap) {
  const rewardActivityId = normalizeText(rewardActivity && rewardActivity._id)

  if (!rewardActivityId) {
    return rewardActivity || null
  }

  const registrations = Array.isArray(rewardActivity && rewardActivity.registrations)
    ? rewardActivity.registrations.slice()
    : []
  const registeredOpenidMap = {}

  registrations.forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (openid) {
      registeredOpenidMap[openid] = true
    }
  })

  const now = new Date()
  const appendedRegistrations = Object.keys(achievedOpenidMap || {})
    .filter((openid) => achievedOpenidMap[openid] && !registeredOpenidMap[openid])
    .map((openid) => {
      return {
        openid,
        createdAt: now,
        autoRegistered: true,
        registerSource: 'system:autoReward'
      }
    })

  if (!appendedRegistrations.length) {
    return rewardActivity || null
  }

  const nextRegistrations = registrations.concat(appendedRegistrations)

  await db.collection('activities').doc(rewardActivityId).update({
    data: {
      registrations: nextRegistrations,
      registrationCount: nextRegistrations.length,
      updatedAt: now
    }
  })

  return {
    ...(rewardActivity || {}),
    registrations: nextRegistrations,
    registrationCount: nextRegistrations.length,
    updatedAt: now
  }
}

function getRewardActivityRegistrationMap(activityList) {
  const registrationMap = {}
  const sortedActivityList = (activityList || []).slice().sort((a, b) => {
    return (Number(b.sortTime) || 0) - (Number(a.sortTime) || 0)
  })

  sortedActivityList.forEach((activity) => {
    const registrations = Array.isArray(activity.registrations) ? activity.registrations : []

    registrations.forEach((item) => {
      const openid = normalizeText(item && item.openid)

      if (!openid || registrationMap[openid]) {
        return
      }

      registrationMap[openid] = {
        rewardActivityId: activity._id,
        rewardActivityTitle: activity.title || '奖励领取活动'
      }
    })
  })

  return registrationMap
}

function getRewardRecordMap(rewardRecordList) {
  const rewardRecordMap = {}

  ;(rewardRecordList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (!openid) {
      return
    }

    const currentTimestamp = toTimestamp(item && item.updatedAt) || toTimestamp(item && item.createdAt) || 0
    const existedTimestamp = toTimestamp(rewardRecordMap[openid] && (rewardRecordMap[openid].updatedAt || rewardRecordMap[openid].createdAt)) || 0

    if (!rewardRecordMap[openid] || currentTimestamp >= existedTimestamp) {
      rewardRecordMap[openid] = item
    }
  })

  return rewardRecordMap
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

function isActivityEnded(activity, currentTimestamp = Date.now()) {
  const { endTimestamp } = getActivityTimeRange(activity)

  if (!endTimestamp) {
    return false
  }

  return currentTimestamp > endTimestamp
}

async function settleWaivedRewardMembers({
  memberUserList,
  achievedOpenidMap,
  rewardRegistrationMap,
  rewardRecordMap,
  rewardActivityList,
  rewardMeta
}) {
  const safeRewardActivityList = Array.isArray(rewardActivityList) ? rewardActivityList : []

  if (!safeRewardActivityList.length) {
    return false
  }

  const allRewardActivitiesEnded = safeRewardActivityList.every((item) => isActivityEnded(item))

  if (!allRewardActivitiesEnded) {
    return false
  }

  const waivedRecordList = []
  const now = new Date()

  ;(memberUserList || []).forEach((item) => {
    const memberOpenid = normalizeText(item && item.openid)
    const rewardRecord = rewardRecordMap[memberOpenid] || null
    const rewardStatus = normalizeText(rewardRecord && rewardRecord.status)

    if (!memberOpenid || !achievedOpenidMap[memberOpenid] || rewardRegistrationMap[memberOpenid]) {
      return
    }

    if (rewardStatus === 'rewarded' || rewardStatus === 'waived') {
      return
    }

    waivedRecordList.push({
      openid: memberOpenid,
      monthKey: rewardMeta.monthKey,
      rewardLabel: rewardMeta.rewardLabel,
      status: 'waived',
      rewardActivityId: '',
      rewardActivityTitle: '',
      updatedBy: 'system:auto-waive',
      updatedAt: now,
      createdAt: now
    })
  })

  if (!waivedRecordList.length) {
    return false
  }

  await Promise.all(waivedRecordList.map((item) => {
    return db.collection('reward_records').add({
      data: item
    })
  }))

  return true
}

function getAutoWaivedOpenidMap({
  memberUserList,
  achievedOpenidMap,
  rewardRegistrationMap,
  rewardRecordMap,
  rewardActivityList
}) {
  const safeRewardActivityList = Array.isArray(rewardActivityList) ? rewardActivityList : []

  if (!safeRewardActivityList.length || !safeRewardActivityList.every((item) => isActivityEnded(item))) {
    return {}
  }

  const waivedMap = {}

  ;(memberUserList || []).forEach((item) => {
    const memberOpenid = normalizeText(item && item.openid)
    const rewardRecord = rewardRecordMap[memberOpenid] || null
    const rewardStatus = normalizeText(rewardRecord && rewardRecord.status)

    if (!memberOpenid || !achievedOpenidMap[memberOpenid] || rewardRegistrationMap[memberOpenid]) {
      return
    }

    if (rewardStatus === 'rewarded' || rewardStatus === 'waived') {
      return
    }

    waivedMap[memberOpenid] = true
  })

  return waivedMap
}

function getAvatarText(userRecord, applicationInfo) {
  const sourceText = normalizeText(
    (userRecord && (userRecord.nickName || userRecord.name))
      || (applicationInfo && applicationInfo.name)
  )

  return sourceText ? sourceText.slice(0, 1) : '读'
}

function resolveMemberField(userRecord, applicationInfo, fieldName) {
  const userValue = normalizeText(userRecord && userRecord[fieldName])
  const applicationValue = normalizeText(applicationInfo && applicationInfo[fieldName])

  return userValue || applicationValue
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const rewardMeta = getCurrentRewardMeta()
  const selectedIncentiveActivityId = normalizeText(event.incentiveActivityId)
  const readonlyStats = event.readonlyStats === true

  try {
    const [userRes, userList, applicationList, readingLogList, allPublishedActivityList, rewardRecordList, readingRuleList] = await Promise.all([
      db.collection('users').where({ openid }).limit(1).get(),
      getAllRecords('users', { status: 'approved' }).catch((queryError) => {
        console.error('get approved users error:', queryError)
        return []
      }),
      getAllRecords('applications').catch((queryError) => {
        console.error('get applications error:', queryError)
        return []
      }),
      getAllRecords('reading_logs').catch((queryError) => {
        console.error('get reading logs error:', queryError)
        return []
      }),
      getAllRecords('activities', {
        status: 'published'
      }).catch((queryError) => {
        console.error('get published activities error:', queryError)
        return []
      }),
      getAllRecords('reward_records', {
        monthKey: rewardMeta.monthKey
      }).catch((queryError) => {
        console.error('get reward records error:', queryError)
        return []
      }),
      getAllRecords('reading_incentive_rules').catch((queryError) => {
        if (!isCollectionNotExistError(queryError)) {
          console.error('get reading incentive rules error:', queryError)
        }

        return []
      })
    ])

    const currentUser = (userRes.data || [])[0] || null
    const permissionInfo = buildPermissionInfo(currentUser)

    if (!permissionInfo.rewardPermission) {
      return {
        success: false,
        message: '当前账号没有奖励管理权限'
      }
    }

    const memberUserList = ensureArray(userList).filter((item) => {
      const role = normalizeText(item && item.role)
      return role === 'member' || role === 'admin'
    })
    const applicationMap = getLatestApplicationMap(ensureArray(applicationList))
    const safePublishedActivityList = ensureArray(allPublishedActivityList)
    const activityMap = safePublishedActivityList.reduce((map, item) => {
      const activityId = normalizeText(item && item._id)

      if (activityId) {
        map[activityId] = item
      }

      return map
    }, {})
    const safeReadingRuleList = await activateDueReadingIncentiveRule(ensureArray(readingRuleList)).catch((error) => {
      console.error('activateDueReadingIncentiveRule error:', error)
      return ensureArray(readingRuleList)
    })
    const currentReadingIncentiveRule = buildReadingIncentiveRuleItem(
      resolveCurrentReadingIncentiveRule(safeReadingRuleList, safePublishedActivityList),
      activityMap
    )
    const scheduledReadingIncentiveRule = buildReadingIncentiveRuleItem(
      selectScheduledReadingIncentiveRule(safeReadingRuleList),
      activityMap
    )
    const currentIncentiveActivity = currentReadingIncentiveRule
      ? (activityMap[normalizeText(currentReadingIncentiveRule.activityId)] || null)
      : null
    const rewardManageIncentiveActivity = currentIncentiveActivity
    const rewardQualificationCompletedCountMap = buildCompletedCountMapByReadingRule(
      ensureArray(readingLogList),
      currentIncentiveActivity,
      currentReadingIncentiveRule
    )
    const rewardQualificationAttendedOpenidMap = buildAttendedOpenidMap(currentIncentiveActivity)
    const rewardQualificationAchievedOpenidMap = buildAchievedOpenidMap(
      currentReadingIncentiveRule,
      rewardQualificationCompletedCountMap,
      rewardQualificationAttendedOpenidMap
    )
    const completedCountMap = buildCompletedCountMapByReadingRule(
      ensureArray(readingLogList),
      rewardManageIncentiveActivity,
      currentReadingIncentiveRule
    )
    const attendedOpenidMap = buildAttendedOpenidMap(rewardManageIncentiveActivity)
    const achievedOpenidMap = buildAchievedOpenidMap(currentReadingIncentiveRule, completedCountMap, attendedOpenidMap)
    let safeRewardActivityList = safePublishedActivityList.filter((item) => {
      return normalizeActivityType(item && item.activityType) === 'rewardClaim'
        && normalizeText(item && item.rewardMonthKey) === rewardMeta.monthKey
    })
    const currentRewardActivity = selectCurrentRewardActivity(safeRewardActivityList)

    if (currentRewardActivity && !readonlyStats) {
      const syncedRewardActivity = await appendAchievedMembersToRewardActivity(currentRewardActivity, rewardQualificationAchievedOpenidMap).catch((error) => {
        console.error('appendAchievedMembersToRewardActivity error:', error)
        return currentRewardActivity
      })

      safeRewardActivityList = safeRewardActivityList.map((item) => {
        return normalizeText(item && item._id) === normalizeText(syncedRewardActivity && syncedRewardActivity._id)
          ? syncedRewardActivity
          : item
      })
    }

    const rewardRegistrationMap = getRewardActivityRegistrationMap(safeRewardActivityList)
    let latestRewardRecordList = ensureArray(rewardRecordList)
    let rewardRecordMap = getRewardRecordMap(latestRewardRecordList)
    let autoWaivedOpenidMap = {}

    if (!readonlyStats) {
      try {
        const settledWaived = await settleWaivedRewardMembers({
          memberUserList,
          achievedOpenidMap: rewardQualificationAchievedOpenidMap,
          rewardRegistrationMap,
          rewardRecordMap,
          rewardActivityList: safeRewardActivityList,
          rewardMeta
        })

        if (settledWaived) {
          latestRewardRecordList = await getAllRecords('reward_records', {
            monthKey: rewardMeta.monthKey
          }).catch(() => [])
          rewardRecordMap = getRewardRecordMap(latestRewardRecordList)
        }
      } catch (settleError) {
        console.error('settleWaivedRewardMembers error:', settleError)
        autoWaivedOpenidMap = getAutoWaivedOpenidMap({
          memberUserList,
          achievedOpenidMap: rewardQualificationAchievedOpenidMap,
          rewardRegistrationMap,
          rewardRecordMap,
          rewardActivityList: safeRewardActivityList
        })
      }
    } else {
      autoWaivedOpenidMap = getAutoWaivedOpenidMap({
        memberUserList,
        achievedOpenidMap: rewardQualificationAchievedOpenidMap,
        rewardRegistrationMap,
        rewardRecordMap,
        rewardActivityList: safeRewardActivityList
      })
    }

    const memberList = memberUserList.reduce((list, item) => {
      try {
        const memberOpenid = normalizeText(item && item.openid)

        if (!memberOpenid) {
          return list
        }

        const applicationInfo = applicationMap[memberOpenid] || null
        const rewardRecord = rewardRecordMap[memberOpenid] || null
        const rewardRegistration = rewardRegistrationMap[memberOpenid] || null
        const completedCount = Number(completedCountMap[memberOpenid]) || 0
        const isAchieved = !!achievedOpenidMap[memberOpenid]
        const rewardStatus = normalizeText(rewardRecord && rewardRecord.status)
        const isWaived = rewardStatus === 'waived' || !!autoWaivedOpenidMap[memberOpenid]
        const hasRewardActivityRegistration = !!rewardRegistration
        const isRewarded = rewardStatus === 'rewarded'
        const isPendingReward = isAchieved && hasRewardActivityRegistration && !isRewarded && !isWaived

        list.push({
          openid: memberOpenid,
          avatarUrl: normalizeText(item && item.avatarUrl),
          avatarText: getAvatarText(item, applicationInfo),
          name: resolveMemberField(item, applicationInfo, 'name') || '未命名成员',
          contact: resolveMemberField(item, applicationInfo, 'contact'),
          completedCount,
          isAchieved,
          hasRewardActivityRegistration,
          rewardActivityId: rewardRegistration ? rewardRegistration.rewardActivityId || '' : '',
          rewardActivityTitle: rewardRegistration ? rewardRegistration.rewardActivityTitle || '' : '',
          isRewarded,
          isPendingReward,
          isWaived,
          rewardStatus: isWaived ? 'waived' : rewardStatus,
          rewardTagText: rewardRecord ? (rewardRecord.rewardLabel || rewardMeta.rewardLabel) : (isWaived ? rewardMeta.rewardLabel : '')
        })
      } catch (memberError) {
        console.error('build reward member item error:', memberError, item)
      }

      return list
    }, []).sort((a, b) => {
      if (Number(b.isAchieved) !== Number(a.isAchieved)) {
        return Number(b.isAchieved) - Number(a.isAchieved)
      }

      if (Number(b.isRewarded) !== Number(a.isRewarded)) {
        return Number(b.isRewarded) - Number(a.isRewarded)
      }

      return String(a.name || '').localeCompare(String(b.name || ''))
    })

    return {
      success: true,
      permissionInfo,
      monthKey: rewardMeta.monthKey,
      rewardLabel: rewardMeta.rewardLabel,
      targetCount: currentReadingIncentiveRule
        ? (Number(currentReadingIncentiveRule.thresholdValue) > 0 ? Number(currentReadingIncentiveRule.thresholdValue) : READING_INCENTIVE_TARGET_DAYS)
        : 0,
      currentReadingIncentiveActivityId: normalizeText(currentIncentiveActivity && currentIncentiveActivity._id),
      selectedReadingIncentiveActivity: rewardManageIncentiveActivity ? {
        activityId: rewardManageIncentiveActivity._id || '',
        title: rewardManageIncentiveActivity.title || '未命名活动',
        timeText: buildTimeText(rewardManageIncentiveActivity),
        ...buildActivityDayRange(rewardManageIncentiveActivity),
        isCurrent: true
      } : {
        activityId: '',
        title: '',
        timeText: '',
        startDayKey: '',
        endDayKey: '',
        isCurrent: false
      },
      readingIncentiveActivityList: rewardManageIncentiveActivity ? [{
        _id: rewardManageIncentiveActivity._id || '',
        title: rewardManageIncentiveActivity.title || '未命名活动',
        timeText: buildTimeText(rewardManageIncentiveActivity),
        ...buildActivityDayRange(rewardManageIncentiveActivity),
        isCurrent: true
      }] : [],
      readingIncentiveRuleCurrent: currentReadingIncentiveRule,
      readingIncentiveRuleScheduled: scheduledReadingIncentiveRule,
      readingIncentiveRuleActivityList: buildReadingIncentiveRuleActivityOptionList(
        safePublishedActivityList,
        normalizeText(
          (scheduledReadingIncentiveRule && scheduledReadingIncentiveRule.activityId)
            || (currentReadingIncentiveRule && currentReadingIncentiveRule.activityId)
        )
      ),
      rewardActivityList: safeRewardActivityList.reduce((list, item) => {
        try {
          const registrations = Array.isArray(item && item.registrations) ? item.registrations : []

          list.push({
            _id: item && item._id ? item._id : '',
            title: (item && item.title) || '奖励领取活动',
            timeText: buildTimeText(item || {}),
            registrationCount: Number(item && item.registrationCount) || registrations.length,
            rewardLabel: (item && item.rewardLabel) || rewardMeta.rewardLabel
          })
        } catch (activityError) {
          console.error('build reward activity item error:', activityError, item)
        }

        return list
      }, []),
      memberList
    }
  } catch (error) {
    return {
      success: false,
      message: '奖励数据加载失败',
      error: error && error.stack ? error.stack : (error.message || error)
    }
  }
}
