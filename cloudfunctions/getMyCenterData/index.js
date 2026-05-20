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

function normalizeMonthKey(value) {
  const safeValue = normalizeText(value)
  return /^\d{4}-\d{2}$/.test(safeValue) ? safeValue : ''
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

function getCurrentYear(currentDate = Date.now()) {
  const dateParts = getChinaDateParts(currentDate)
  return Number(dateParts && dateParts.year) || new Date().getFullYear()
}

function getCurrentMonth(currentDate = Date.now()) {
  const dateParts = getChinaDateParts(currentDate)
  return Number(dateParts && dateParts.month) || (new Date().getMonth() + 1)
}

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function sortByCreatedAtDesc(list) {
  return (list || []).slice().sort((a, b) => {
    return (toTimestamp(b.createdAt) || 0) - (toTimestamp(a.createdAt) || 0)
  })
}

function getPriorityUserRecord(userList) {
  return (userList || [])
    .slice()
    .sort((a, b) => {
      const statusScoreA = a && a.status === 'approved' ? 2 : (a && a.status === 'pending' ? 1 : 0)
      const statusScoreB = b && b.status === 'approved' ? 2 : (b && b.status === 'pending' ? 1 : 0)

      if (statusScoreB !== statusScoreA) {
        return statusScoreB - statusScoreA
      }

      const updatedAtA = toTimestamp(a && a.updatedAt) || 0
      const updatedAtB = toTimestamp(b && b.updatedAt) || 0

      if (updatedAtB !== updatedAtA) {
        return updatedAtB - updatedAtA
      }

      return (toTimestamp(b && b.createdAt) || 0) - (toTimestamp(a && a.createdAt) || 0)
    })[0] || null
}

function resolveUserProfileField(userRecord, latestApplication, fieldName) {
  const userValue = normalizeText(userRecord && userRecord[fieldName])
  const applicationValue = normalizeText(latestApplication && latestApplication[fieldName])
  const isApprovedUser = userRecord && userRecord.status === 'approved'

  if (isApprovedUser) {
    return userValue || applicationValue
  }

  return userValue || applicationValue
}

function buildPermissionInfo(userRecord) {
  const baseRole = userRecord ? userRecord.role || 'guest' : 'guest'
  const superAdmin = typeof (userRecord && userRecord.superAdmin) === 'boolean'
    ? userRecord.superAdmin
    : false
  const applicationReviewPermission = typeof (userRecord && userRecord.applicationReviewPermission) === 'boolean'
    ? userRecord.applicationReviewPermission
    : !!(userRecord && userRecord.role === 'admin' && userRecord.status === 'approved')
  const activityPermission = typeof (userRecord && userRecord.activityPermission) === 'boolean'
    ? userRecord.activityPermission
    : false
  const rewardPermission = typeof (userRecord && userRecord.rewardPermission) === 'boolean'
    ? userRecord.rewardPermission
    : (superAdmin || activityPermission)
  const bookRecommendationPermission = typeof (userRecord && userRecord.bookRecommendationPermission) === 'boolean'
    ? userRecord.bookRecommendationPermission
    : false
  const posterManagePermission = typeof (userRecord && userRecord.posterManagePermission) === 'boolean'
    ? userRecord.posterManagePermission
    : false
  const role = superAdmin
    || applicationReviewPermission
    || activityPermission
    || rewardPermission
    || bookRecommendationPermission
    || posterManagePermission
    || (typeof (userRecord && userRecord.dataPermission) === 'boolean' && userRecord.dataPermission === true)
    ? 'admin'
    : baseRole

  return {
    role,
    superAdmin,
    applicationReviewPermission,
    dataPermission: typeof (userRecord && userRecord.dataPermission) === 'boolean'
      ? userRecord.dataPermission
      : false,
    activityPermission,
    rewardPermission,
    bookRecommendationPermission,
    posterManagePermission,
    imageUploadPermission: true
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

function getUniqueUserCount(eventList, eventType) {
  const userMap = {}

  ;(eventList || []).forEach((item) => {
    if (item.eventType === eventType && item.openid) {
      userMap[item.openid] = true
    }
  })

  return Object.keys(userMap).length
}

function buildActivityCountMap(list) {
  const countMap = {}

  ;(list || []).forEach((item) => {
    const activityId = normalizeText(item && item.activityId)

    if (!activityId) {
      return
    }

    countMap[activityId] = (countMap[activityId] || 0) + 1
  })

  return countMap
}

function buildActivityUserMap(list) {
  const activityUserMap = {}

  ;(list || []).forEach((item) => {
    const activityId = normalizeText(item && item.activityId)
    const openid = normalizeText(item && item.openid)

    if (!activityId || !openid) {
      return
    }

    if (!activityUserMap[activityId]) {
      activityUserMap[activityId] = {}
    }

    activityUserMap[activityId][openid] = true
  })

  return activityUserMap
}

function getMergedUniqueUserCount(firstUserMap, secondUserMap) {
  const mergedMap = {}

  Object.keys(firstUserMap || {}).forEach((openid) => {
    mergedMap[openid] = true
  })

  Object.keys(secondUserMap || {}).forEach((openid) => {
    mergedMap[openid] = true
  })

  return Object.keys(mergedMap).length
}

function formatRateText(numerator, denominator) {
  if (!denominator) {
    return '0%'
  }

  const rate = Number(((numerator / denominator) * 100).toFixed(1))
  return `${rate}%`
}

function getFirstImageUrl(item) {
  const images = Array.isArray(item && item.images) ? item.images : []
  return normalizeText(images[0])
}

function resolveReadingContentTitle(item) {
  const explicitTitle = normalizeText(item && (item.contentTitle || item.title))
  const insight = normalizeText(item && item.insight)
  const excerpt = normalizeText(item && item.excerpt)

  if (explicitTitle) {
    return explicitTitle
  }

  if (insight) {
    return '感悟'
  }

  if (excerpt) {
    return '摘抄'
  }

  return ''
}

function buildDayKey(item) {
  const createdAtDayKey = buildDayKeyFromDateParts(getChinaDateParts(item && item.createdAt))

  if (createdAtDayKey) {
    return createdAtDayKey
  }

  return normalizeDayKey(item && item.dayKey)
}

function getUniqueReadingDayCount(list) {
  const dayMap = {}

  ;(list || []).forEach((item) => {
    const dayKey = buildDayKey(item)

    if (dayKey) {
      dayMap[dayKey] = true
    }
  })

  return Object.keys(dayMap).length
}

function getDurationTotal(list) {
  return (list || []).reduce((sum, item) => {
    return sum + (Number(item && item.duration) || 0)
  }, 0)
}

function getWeekdayLabel(dayKey) {
  const safeDayKey = normalizeDayKey(dayKey)

  if (!safeDayKey) {
    return ''
  }

  const parts = safeDayKey.split('-').map((item) => Number(item))
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const weekdayTextList = ['日', '一', '二', '三', '四', '五', '六']

  return weekdayTextList[date.getUTCDay()] || ''
}

function buildRecentChinaDayMetaList(dayCount = 7, currentDate = Date.now()) {
  const baseTimestamp = toTimestamp(currentDate) || Date.now()
  const baseDate = new Date(baseTimestamp + CHINA_TIME_OFFSET)
  const result = []

  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const currentDateValue = new Date(baseDate.getTime())
    currentDateValue.setUTCDate(baseDate.getUTCDate() - offset)

    const dayKey = buildDayKeyFromDateParts({
      year: currentDateValue.getUTCFullYear(),
      month: padNumber(currentDateValue.getUTCMonth() + 1),
      day: padNumber(currentDateValue.getUTCDate())
    })

    result.push({
      dayKey,
      weekdayLabel: getWeekdayLabel(dayKey)
    })
  }

  return result
}

function filterReadingLogsByActivityPeriod(readingLogList, activity) {
  if (!activity) {
    return []
  }

  const activityId = normalizeText(activity && activity._id)
  const { startDayKey, endDayKey } = buildActivityDayRange(activity)

  return (readingLogList || []).filter((item) => {
    const dayKey = buildDayKey(item)

    return normalizeText(item && item.activityId) === activityId
      && isDayInClosedRange(dayKey, startDayKey, endDayKey)
  })
}

function buildRecentReadingDurationSummary(readingLogList, currentDate = Date.now()) {
  const recentDayMetaList = buildRecentChinaDayMetaList(7, currentDate)
  const recentDayMap = {}
  const durationMap = {}

  recentDayMetaList.forEach((item) => {
    recentDayMap[item.dayKey] = item
    durationMap[item.dayKey] = 0
  })

  ;(readingLogList || []).forEach((item) => {
    const dayKey = buildDayKey(item)

    if (!recentDayMap[dayKey]) {
      return
    }

    durationMap[dayKey] += Number(item && item.duration) || 0
  })

  const days = recentDayMetaList.map((item) => {
    return {
      dayKey: item.dayKey,
      weekdayLabel: item.weekdayLabel,
      durationMinutes: durationMap[item.dayKey] || 0
    }
  })
  const totalDuration = days.reduce((sum, item) => sum + item.durationMinutes, 0)
  const peakDuration = days.reduce((maxValue, item) => Math.max(maxValue, item.durationMinutes), 0)

  return {
    days,
    averageDuration: days.length ? Math.round(totalDuration / days.length) : 0,
    peakDuration
  }
}

function buildTotalReadingSummary(readingLogList) {
  return {
    totalLogs: Array.isArray(readingLogList) ? readingLogList.length : 0,
    completedCount: getUniqueReadingDayCount(readingLogList),
    totalDuration: getDurationTotal(readingLogList)
  }
}

function buildMonthlyFavoriteSummary(readingLogList, currentYear) {
  const monthBookMap = {}

  ;(readingLogList || []).forEach((item) => {
    const monthKey = buildMonthKey(item)

    if (!monthKey || !monthKey.startsWith(`${currentYear}-`)) {
      return
    }

    const month = Number(monthKey.slice(5, 7))

    if (!month) {
      return
    }

    const bookTitle = normalizeText(item && item.bookTitle) || '未填写书名'
    const duration = Number(item && item.duration) || 0
    const latestCreatedAt = toTimestamp(item && item.createdAt) || 0

    if (!monthBookMap[month]) {
      monthBookMap[month] = {}
    }

    if (!monthBookMap[month][bookTitle]) {
      monthBookMap[month][bookTitle] = {
        bookTitle,
        durationMinutes: 0,
        latestCreatedAt: 0
      }
    }

    monthBookMap[month][bookTitle].durationMinutes += duration
    monthBookMap[month][bookTitle].latestCreatedAt = Math.max(
      monthBookMap[month][bookTitle].latestCreatedAt,
      latestCreatedAt
    )
  })

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const monthRecordMap = monthBookMap[month] || {}
    const favoriteRecord = Object.values(monthRecordMap)
      .sort((a, b) => {
        if (b.durationMinutes !== a.durationMinutes) {
          return b.durationMinutes - a.durationMinutes
        }

        return b.latestCreatedAt - a.latestCreatedAt
      })[0] || null

    return {
      month,
      monthLabel: `${month}月`,
      hasData: !!favoriteRecord,
      bookTitle: favoriteRecord ? favoriteRecord.bookTitle : '',
      durationMinutes: favoriteRecord ? favoriteRecord.durationMinutes : 0
    }
  })
}

function getHeatmapLevel(durationMinutes, maxDuration) {
  if (!durationMinutes || maxDuration <= 0) {
    return 0
  }

  const ratio = durationMinutes / maxDuration

  if (ratio >= 0.75) {
    return 4
  }

  if (ratio >= 0.5) {
    return 3
  }

  if (ratio >= 0.25) {
    return 2
  }

  return 1
}

function buildAnnualHeatmapSummary(readingLogList, currentYear) {
  const durationByDayMap = {}

  ;(readingLogList || []).forEach((item) => {
    const dayKey = buildDayKey(item)

    if (!dayKey || !dayKey.startsWith(`${currentYear}-`)) {
      return
    }

    durationByDayMap[dayKey] = (durationByDayMap[dayKey] || 0) + (Number(item && item.duration) || 0)
  })

  const maxDuration = Object.keys(durationByDayMap).reduce((maxValue, dayKey) => {
    return Math.max(maxValue, Number(durationByDayMap[dayKey]) || 0)
  }, 0)

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const monthLabel = `${month}月`
    const firstDay = new Date(Date.UTC(currentYear, month - 1, 1))
    const firstWeekday = firstDay.getUTCDay()
    const daysInMonth = new Date(Date.UTC(currentYear, month, 0)).getUTCDate()
    const cells = []

    for (let emptyIndex = 0; emptyIndex < firstWeekday; emptyIndex += 1) {
      cells.push({
        key: `${monthLabel}-empty-${emptyIndex}`,
        level: 0,
        isPlaceholder: true
      })
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayKey = `${currentYear}-${padNumber(month)}-${padNumber(day)}`
      const durationMinutes = Number(durationByDayMap[dayKey]) || 0

      cells.push({
        key: dayKey,
        day,
        durationMinutes,
        level: getHeatmapLevel(durationMinutes, maxDuration),
        isPlaceholder: false
      })
    }

    while (cells.length % 7 !== 0) {
      cells.push({
        key: `${monthLabel}-tail-${cells.length}`,
        level: 0,
        isPlaceholder: true
      })
    }

    while (cells.length < 35) {
      cells.push({
        key: `${monthLabel}-pad-${cells.length}`,
        level: 0,
        isPlaceholder: true
      })
    }

    return {
      month,
      monthLabel,
      cells
    }
  })

  return {
    year: currentYear,
    maxDuration,
    months
  }
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

function normalizeThresholdType(value) {
  return value === 'consecutive' ? 'consecutive' : 'accumulated'
}

function selectCurrentReadingIncentiveRule(ruleList) {
  return (Array.isArray(ruleList) ? ruleList : [])
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

function normalizeEffectMode(value) {
  return value === 'scheduled' ? 'scheduled' : 'immediate'
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
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

function buildUniqueSortedDayKeyList(readingLogList) {
  const dayKeyMap = {}

  ;(readingLogList || []).forEach((item) => {
    const dayKey = buildDayKey(item)

    if (dayKey) {
      dayKeyMap[dayKey] = true
    }
  })

  return Object.keys(dayKeyMap).sort()
}

function getConsecutiveReadingDayCount(readingLogList) {
  const dayKeyList = buildUniqueSortedDayKeyList(readingLogList)

  if (!dayKeyList.length) {
    return 0
  }

  let currentCount = 0
  let maxCount = 0
  let previousDayKey = ''

  dayKeyList.forEach((dayKey) => {
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

function getRuleCompletedCount(readingLogList, thresholdType) {
  return normalizeThresholdType(thresholdType) === 'consecutive'
    ? getConsecutiveReadingDayCount(readingLogList)
    : getUniqueReadingDayCount(readingLogList)
}

function buildCurrentReadingIncentiveSummary(readingLogList, rule, activity, openid) {
  if (!rule || !activity || !openid) {
    return {
      activityId: '',
      activityTitle: '',
      startDayKey: '',
      endDayKey: '',
      thresholdType: 'accumulated',
      requireOfflineAttendance: true,
      totalLogs: 0,
      completedCount: 0,
      remainingCount: 0,
      totalDuration: 0,
      targetCount: 0,
      attended: false,
      isAchieved: false,
      latestLog: null
    }
  }

  const activityId = normalizeText(activity && activity._id)
  const thresholdType = normalizeThresholdType(rule && rule.thresholdType)
  const requireOfflineAttendance = rule && rule.requireOfflineAttendance !== false
  const targetCount = Number(rule && rule.thresholdValue) > 0
    ? Number(rule.thresholdValue)
    : READING_INCENTIVE_TARGET_DAYS
  const { startDayKey, endDayKey } = buildActivityDayRange(activity)
  const relatedReadingLogs = filterReadingLogsByActivityPeriod(readingLogList, activity)
  const registrations = Array.isArray(activity.registrations) ? activity.registrations : []
  const attended = registrations.some((item) => {
    return normalizeText(item && item.openid) === openid && item.attended === true
  })
  const sortedLogs = sortByCreatedAtDesc(relatedReadingLogs)
  const latestLog = sortedLogs[0] || null
  const completedCount = getRuleCompletedCount(relatedReadingLogs, thresholdType)
  const totalDuration = getDurationTotal(relatedReadingLogs)
  const meetsAttendanceRequirement = requireOfflineAttendance ? attended : true

  return {
    activityId,
    activityTitle: getActivityTitle(activity),
    startDayKey,
    endDayKey,
    thresholdType,
    requireOfflineAttendance,
    totalLogs: relatedReadingLogs.length,
    completedCount,
    remainingCount: completedCount >= targetCount
      ? 0
      : targetCount - completedCount,
    totalDuration,
    targetCount,
    attended,
    isAchieved: meetsAttendanceRequirement && completedCount >= targetCount,
    latestLog
  }
}

function buildMyRecordList(readingLogList, lifeShareList, limit = 5) {
  const mixedList = []

  ;(readingLogList || []).forEach((item) => {
    const images = Array.isArray(item && item.images)
      ? item.images.map((image) => normalizeText(image)).filter(Boolean)
      : []
    const insight = normalizeText(item && item.insight)
    const excerpt = normalizeText(item && item.excerpt)
    const contentTitle = resolveReadingContentTitle(item)

    mixedList.push({
      _id: item && item._id ? item._id : '',
      type: 'reading',
      typeText: '阅读打卡',
      title: contentTitle || normalizeText(item && item.bookTitle) || '未填写书名',
      summary: insight || excerpt,
      createdAt: toTimestamp(item && item.createdAt),
      dayKey: buildDayKey(item),
      imageUrl: normalizeText(images[0]) || getFirstImageUrl(item),
      images,
      bookTitle: normalizeText(item && item.bookTitle),
      contentTitle,
      author: normalizeText(item && item.author),
      duration: Number(item && item.duration) || 0,
      pagesOrChapter: normalizeText(item && item.pagesOrChapter),
      insight,
      excerpt,
      activityId: normalizeText(item && item.activityId),
      activityTitle: normalizeText(item && item.activityTitle),
      content: ''
    })
  })

  ;(lifeShareList || []).forEach((item) => {
    const title = normalizeText(item && item.title)
    const images = Array.isArray(item && item.images)
      ? item.images.map((image) => normalizeText(image)).filter(Boolean)
      : []
    const content = normalizeText(item && item.content)

    mixedList.push({
      _id: item && item._id ? item._id : '',
      type: 'life',
      typeText: '生活分享',
      title: title || '生活分享',
      summary: content,
      createdAt: toTimestamp(item && item.createdAt),
      dayKey: '',
      imageUrl: normalizeText(images[0]) || getFirstImageUrl(item),
      images,
      bookTitle: '',
      contentTitle: '',
      author: '',
      duration: 0,
      pagesOrChapter: '',
      insight: '',
      excerpt: '',
      activityId: normalizeText(item && item.activityId),
      activityTitle: normalizeText(item && item.activityTitle),
      content
    })
  })

  return mixedList
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
    .slice(0, limit)
}

function buildActivityDataCenter(activities, eventList, readingLogList, lifeShareList, canView) {
  if (!canView) {
    return {
      canView: false,
      cards: []
    }
  }

  const eventMap = {}

  ;(eventList || []).forEach((item) => {
    if (!item.activityId) {
      return
    }

    if (!eventMap[item.activityId]) {
      eventMap[item.activityId] = []
    }

    eventMap[item.activityId].push(item)
  })

  const readingLogCountMap = buildActivityCountMap(readingLogList)
  const lifeShareCountMap = buildActivityCountMap(lifeShareList)
  const readingLogUserMap = buildActivityUserMap(readingLogList)
  const lifeShareUserMap = buildActivityUserMap(lifeShareList)

  const cards = (activities || [])
    .slice()
    .sort((a, b) => {
      return (Number(b.sortTime) || 0) - (Number(a.sortTime) || 0)
    })
    .map((activity) => {
      const activityEvents = eventMap[activity._id] || []
      const registrations = Array.isArray(activity.registrations) ? activity.registrations : []
      const exposureUserCount = getUniqueUserCount(activityEvents, 'exposure')
      const detailClickUserCount = getUniqueUserCount(activityEvents, 'detail_click')
      const registerUserCount = Number(activity.registrationCount) || registrations.length
      const readingLogCount = Number(readingLogCountMap[activity._id]) || 0
      const lifeShareCount = Number(lifeShareCountMap[activity._id]) || 0
      const attendanceUserCount = getMergedUniqueUserCount(
        readingLogUserMap[activity._id],
        lifeShareUserMap[activity._id]
      )

      return {
        activityId: activity._id,
        title: activity.title || '未命名活动',
        timeText: buildTimeText(activity) || '时间待定',
        exposureUserCount,
        detailClickUserCount,
        registerUserCount,
        attendanceUserCount,
        readingLogCount,
        lifeShareCount,
        clickRateText: formatRateText(detailClickUserCount, exposureUserCount),
        registerConversionRateText: formatRateText(registerUserCount, detailClickUserCount)
      }
    })

  return {
    canView: true,
    cards
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const monthKey = getCurrentMonthKey()
  const currentYear = getCurrentYear()
  const currentMonth = getCurrentMonth()

  try {
    const [userList, applicationList, visitorApplicationList, allMyReadingLogs, myLifeShares, activityList, readingRuleList] = await Promise.all([
      getAllRecords('users', { openid }),
      getAllRecords('applications', { openid }),
      getAllRecords('visitor_applications', { openid }).catch(() => []),
      getAllRecords('reading_logs', { openid }),
      getAllRecords('life_shares', { openid }).catch(() => []),
      getAllRecords('activities', {
        status: 'published'
      }).catch(() => []),
      getAllRecords('reading_incentive_rules').catch((queryError) => {
        if (!isCollectionNotExistError(queryError)) {
          throw queryError
        }

        return []
      })
    ])

    const latestMemberApplication = sortByCreatedAtDesc(applicationList)[0] || null
    const latestVisitorApplication = sortByCreatedAtDesc(visitorApplicationList)[0] || null
    const latestApplication = latestMemberApplication || latestVisitorApplication || null
    const userRecord = getPriorityUserRecord(userList)
    const permissionInfo = buildPermissionInfo(userRecord)
    const safeReadingRuleList = await activateDueReadingIncentiveRule(readingRuleList || []).catch((error) => {
      console.error('activateDueReadingIncentiveRule error:', error)
      return ensureArray(readingRuleList)
    })
    const currentReadingIncentiveRule = resolveCurrentReadingIncentiveRule(
      safeReadingRuleList || [],
      activityList || []
    )
    const currentReadingIncentiveActivity = (activityList || []).find((item) => {
      return normalizeText(item && item._id) === normalizeText(currentReadingIncentiveRule && currentReadingIncentiveRule.activityId)
    }) || null
    const readingIncentiveSummary = buildCurrentReadingIncentiveSummary(
      allMyReadingLogs || [],
      currentReadingIncentiveRule,
      currentReadingIncentiveActivity,
      openid
    )
    const totalReadingSummary = buildTotalReadingSummary(allMyReadingLogs || [])
    const recentReadingDurationSummary = buildRecentReadingDurationSummary(allMyReadingLogs || [])
    const monthlyFavoriteSummary = buildMonthlyFavoriteSummary(allMyReadingLogs || [], currentYear)
    const annualHeatmapSummary = buildAnnualHeatmapSummary(allMyReadingLogs || [], currentYear)

    const [dataPermissionActivityList, activityEventList, activityReadingLogs, activityLifeShares] = permissionInfo.dataPermission
      ? await Promise.all([
        getAllRecords('activities'),
        getAllRecords('activity_events'),
        getAllRecords('reading_logs'),
        getAllRecords('life_shares').catch(() => [])
      ])
      : [[], [], [], []]

    return {
      success: true,
      userInfo: {
        hasUserRecord: !!userRecord,
        nickName: userRecord ? userRecord.nickName || '' : '',
        avatarUrl: userRecord ? userRecord.avatarUrl || '' : '',
        name: resolveUserProfileField(userRecord, latestApplication, 'name'),
        contact: resolveUserProfileField(userRecord, latestApplication, 'contact'),
        gradeMajor: resolveUserProfileField(userRecord, latestApplication, 'gradeMajor'),
        signature: normalizeText(userRecord && userRecord.signature),
        birthday: normalizeText(userRecord && userRecord.birthday),
        role: permissionInfo.role,
        superAdmin: permissionInfo.superAdmin,
        status: userRecord ? userRecord.status || '' : '',
        profileSupplementPrompted: !!(userRecord && userRecord.profileSupplementPrompted === true),
        applicationReviewPermission: permissionInfo.applicationReviewPermission,
        dataPermission: permissionInfo.dataPermission,
        activityPermission: permissionInfo.activityPermission,
        rewardPermission: permissionInfo.rewardPermission,
        bookRecommendationPermission: permissionInfo.bookRecommendationPermission,
        posterManagePermission: permissionInfo.posterManagePermission,
        imageUploadPermission: true,
        createdAt: userRecord ? toTimestamp(userRecord.createdAt) : null,
        updatedAt: userRecord ? toTimestamp(userRecord.updatedAt) : null
      },
      applicationInfo: latestApplication ? {
        hasApplication: true,
        applicationType: latestMemberApplication ? 'member' : 'visitor',
        status: latestApplication.status || '',
        name: latestApplication.name || '',
        gradeMajor: latestApplication.gradeMajor || '',
        reason: latestApplication.reason || '',
        contact: latestApplication.contact || '',
        reviewedBy: latestApplication.reviewedBy || '',
        reviewedAt: toTimestamp(latestApplication.reviewedAt),
        createdAt: toTimestamp(latestApplication.createdAt)
      } : {
        hasApplication: false,
        applicationType: '',
        status: '',
        name: '',
        gradeMajor: '',
        reason: '',
        contact: '',
        reviewedBy: '',
        reviewedAt: null,
        createdAt: null
      },
      readingSummary: {
        monthKey,
        currentYear,
        currentMonth,
        activityId: readingIncentiveSummary.activityId,
        activityTitle: readingIncentiveSummary.activityTitle,
        startDayKey: readingIncentiveSummary.startDayKey,
        endDayKey: readingIncentiveSummary.endDayKey,
        thresholdType: readingIncentiveSummary.thresholdType,
        requireOfflineAttendance: readingIncentiveSummary.requireOfflineAttendance,
        totalLogs: readingIncentiveSummary.totalLogs,
        completedCount: readingIncentiveSummary.completedCount,
        remainingCount: readingIncentiveSummary.remainingCount,
        attended: readingIncentiveSummary.attended,
        isAchieved: readingIncentiveSummary.isAchieved,
        totalDuration: readingIncentiveSummary.totalDuration,
        targetCount: readingIncentiveSummary.targetCount,
        totalSummary: totalReadingSummary,
        recentWeek: recentReadingDurationSummary,
        monthlyFavorites: monthlyFavoriteSummary,
        annualHeatmap: annualHeatmapSummary,
        latestLog: readingIncentiveSummary.latestLog ? {
          bookTitle: readingIncentiveSummary.latestLog.bookTitle || '',
          author: readingIncentiveSummary.latestLog.author || '',
          duration: Number(readingIncentiveSummary.latestLog.duration) || 0,
          pagesOrChapter: readingIncentiveSummary.latestLog.pagesOrChapter || '',
          insight: readingIncentiveSummary.latestLog.insight || '',
          excerpt: readingIncentiveSummary.latestLog.excerpt || '',
          dayKey: buildDayKey(readingIncentiveSummary.latestLog),
          giftEligible: !!readingIncentiveSummary.latestLog.giftEligible,
          createdAt: toTimestamp(readingIncentiveSummary.latestLog.createdAt)
        } : null
      },
      myRecordList: buildMyRecordList(allMyReadingLogs, myLifeShares, 2),
      activityDataCenter: buildActivityDataCenter(
        dataPermissionActivityList,
        activityEventList,
        activityReadingLogs,
        activityLifeShares,
        permissionInfo.dataPermission
      )
    }
  } catch (error) {
    return {
      success: false,
      message: '获取我的页面数据失败',
      error: error.message || error
    }
  }
}
