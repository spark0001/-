const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000
const READING_INCENTIVE_TARGET_DAYS = 10

function normalizeText(value) {
  return String(value || '').trim()
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

function buildPermissionInfo(userRecord) {
  const role = userRecord ? userRecord.role || 'guest' : 'guest'
  const superAdmin = typeof (userRecord && userRecord.superAdmin) === 'boolean'
    ? userRecord.superAdmin
    : false
  const activityPermission = typeof (userRecord && userRecord.activityPermission) === 'boolean'
    ? userRecord.activityPermission
    : false
  const rewardPermission = typeof (userRecord && userRecord.rewardPermission) === 'boolean'
    ? userRecord.rewardPermission
    : (superAdmin || activityPermission)

  return {
    role,
    superAdmin,
    dataPermission: typeof (userRecord && userRecord.dataPermission) === 'boolean'
      ? userRecord.dataPermission
      : false,
    activityPermission,
    rewardPermission,
    imageUploadPermission: true
  }
}

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function getPublishAt(activity) {
  return Number(activity && activity.publishAt) || 0
}

function isScheduledActivity(activity, currentTimestamp = Date.now()) {
  const publishAt = getPublishAt(activity)

  return !!(publishAt && publishAt > currentTimestamp)
}

function formatPublishTimeText(timestamp) {
  const publishAt = Number(timestamp) || 0

  if (!publishAt) {
    return ''
  }

  const dateParts = getChinaDateParts(publishAt)
  const date = new Date(publishAt + CHINA_TIME_OFFSET)

  if (!dateParts || Number.isNaN(date.getTime())) {
    return ''
  }

  return `${dateParts.year}-${dateParts.month}-${dateParts.day} ${padNumber(date.getUTCHours())}:${padNumber(date.getUTCMinutes())}`
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

function getActivityModeText(activityMode) {
  return activityMode === 'online' ? '线上' : '线下'
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

function getAvatarText(userRecord, fallbackText = '') {
  const sourceText = normalizeText((userRecord && (userRecord.nickName || userRecord.name)) || fallbackText)

  if (!sourceText) {
    return '读'
  }

  return sourceText.slice(0, 1)
}

function buildTimeText(activity) {
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

  if (activity.timeText) {
    return activity.timeText
  }

  if (activity.activityTime) {
    return activity.activityTime
  }

  return ''
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

async function buildRewardClaimMembers(registrations) {
  const openidList = (registrations || [])
    .map((item) => normalizeText(item && item.openid))
    .filter(Boolean)

  if (!openidList.length) {
    return []
  }

  const uniqueOpenidList = Array.from(new Set(openidList))
  const [userMap, applicationMap] = await Promise.all([
    getUserMapByOpenidList(uniqueOpenidList),
    getLatestApplicationMapByOpenidList(uniqueOpenidList)
  ])

  return uniqueOpenidList.map((registeredOpenid) => {
    const userRecord = userMap[registeredOpenid] || null
    const applicationInfo = applicationMap[registeredOpenid] || null
    const displayName = resolveAttendeeName(userRecord, applicationInfo)

    return {
      openid: registeredOpenid,
      avatarUrl: normalizeText(userRecord && userRecord.avatarUrl),
      avatarText: getAvatarText(userRecord, displayName)
    }
  })
}

function getLatestApplicationMap(applicationList) {
  const applicationMap = {}

  ;(applicationList || []).forEach((item) => {
    const registeredOpenid = normalizeText(item && item.openid)

    if (!registeredOpenid) {
      return
    }

    const currentTimestamp = toTimestamp(item && item.createdAt) || 0
    const existedTimestamp = toTimestamp(applicationMap[registeredOpenid] && applicationMap[registeredOpenid].createdAt) || 0

    if (!applicationMap[registeredOpenid] || currentTimestamp >= existedTimestamp) {
      applicationMap[registeredOpenid] = item
    }
  })

  return applicationMap
}

async function getUserMapByOpenidList(openidList) {
  const userMap = {}
  const safeOpenidList = Array.from(new Set((openidList || []).filter(Boolean)))
  const chunkSize = 20

  for (let index = 0; index < safeOpenidList.length; index += chunkSize) {
    const chunk = safeOpenidList.slice(index, index + chunkSize)
    const res = await db.collection('users').where({
      openid: _.in(chunk)
    }).get().catch(() => ({ data: [] }))

    ;(res.data || []).forEach((item) => {
      userMap[item.openid] = item
    })
  }

  return userMap
}

async function getLatestApplicationMapByOpenidList(openidList) {
  const safeOpenidList = Array.from(new Set((openidList || []).filter(Boolean)))

  if (!safeOpenidList.length) {
    return {}
  }

  const applicationList = []
  const chunkSize = 20

  for (let index = 0; index < safeOpenidList.length; index += chunkSize) {
    const chunk = safeOpenidList.slice(index, index + chunkSize)
    const res = await db.collection('applications').where({
      openid: _.in(chunk)
    }).get().catch(() => ({ data: [] }))

    applicationList.push(...(res.data || []))
  }

  return getLatestApplicationMap(applicationList)
}

function resolveAttendeeName(userRecord, applicationInfo) {
  return normalizeText(
    (userRecord && (userRecord.nickName || userRecord.name))
      || (applicationInfo && applicationInfo.name)
      || ''
  ) || '未命名成员'
}

function resolveAttendeeContact(userRecord, applicationInfo) {
  return normalizeText(
    (applicationInfo && applicationInfo.contact)
      || (userRecord && userRecord.contact)
      || ''
  )
}

async function buildAttendanceManage(registrations, activityMode, permissionInfo) {
  const canManageAttendance = activityMode === 'offline' && !!(permissionInfo && permissionInfo.activityPermission)

  if (!canManageAttendance) {
    return {
      visible: false,
      attendeeList: []
    }
  }

  const safeRegistrations = Array.isArray(registrations) ? registrations : []
  const openidList = safeRegistrations
    .map((item) => normalizeText(item && item.openid))
    .filter(Boolean)

  if (!openidList.length) {
    return {
      visible: true,
      attendeeList: []
    }
  }

  const [userMap, applicationMap] = await Promise.all([
    getUserMapByOpenidList(openidList),
    getLatestApplicationMapByOpenidList(openidList)
  ])

  return {
    visible: true,
    attendeeList: safeRegistrations.reduce((list, item) => {
      const registeredOpenid = normalizeText(item && item.openid)

      if (!registeredOpenid) {
        return list
      }

      const userRecord = userMap[registeredOpenid] || null
      const applicationInfo = applicationMap[registeredOpenid] || null
      const displayName = resolveAttendeeName(userRecord, applicationInfo)
      const attended = item && item.attended === true

      list.push({
        openid: registeredOpenid,
        avatarUrl: normalizeText(userRecord && userRecord.avatarUrl),
        avatarText: getAvatarText(
          userRecord || {
            nickName: displayName
          }
        ),
        displayName,
        contact: resolveAttendeeContact(userRecord, applicationInfo),
        attended,
        attendanceStatusText: attended ? '已到场' : '缺席'
      })

      return list
    }, [])
  }
}

function sortByCreatedAtDesc(list) {
  return (list || []).slice().sort((a, b) => {
    return (toTimestamp(b && b.createdAt) || 0) - (toTimestamp(a && a.createdAt) || 0)
  })
}

function getUniqueUserCount(eventList, eventType) {
  const map = {}

  ;(eventList || []).forEach((item) => {
    if (item.eventType === eventType && item.openid) {
      map[item.openid] = true
    }
  })

  return Object.keys(map).length
}

function getRelatedAttendanceUserCount(readingLogList, lifeShareList) {
  const openidMap = {}

  ;(readingLogList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (openid) {
      openidMap[openid] = true
    }
  })

  ;(lifeShareList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (openid) {
      openidMap[openid] = true
    }
  })

  return Object.keys(openidMap).length
}

function buildDashboard(activity, eventList, canView, readingLogList, lifeShareList) {
  if (!canView) {
    return {
      canView: false,
      exposureUserCount: 0,
      detailClickUserCount: 0,
      registerUserCount: 0,
      attendanceUserCount: 0
    }
  }

  const registrations = Array.isArray(activity.registrations) ? activity.registrations : []
  const exposureUserCount = getUniqueUserCount(eventList, 'exposure')
  const detailClickUserCount = getUniqueUserCount(eventList, 'detail_click')
  const attendanceUserCount = normalizeActivityType(activity && activity.activityType) === 'rewardClaim'
    ? 0
    : getRelatedAttendanceUserCount(readingLogList, lifeShareList)

  return {
    canView: true,
    exposureUserCount,
    detailClickUserCount,
    registerUserCount: Number(activity.registrationCount) || registrations.length,
    attendanceUserCount
  }
}

function getFirstImageUrl(item) {
  const images = Array.isArray(item && item.images) ? item.images : []
  return normalizeText(images[0])
}

function getImageList(item) {
  return Array.isArray(item && item.images)
    ? item.images.map((image) => normalizeText(image)).filter(Boolean)
    : []
}

function isBlockedContent(item) {
  const reviewStatus = normalizeText(item && item.reviewStatus)

  return reviewStatus === 'blocked'
    || item.isBlocked === true
    || item.blocked === true
}

function isFeaturedContent(item) {
  return !!(
    item
    && (
      item.isFeatured === true
      || item.featured === true
      || item.isSelected === true
      || item.selected === true
    )
  )
}

function buildPublicVisibleContentList(list, recentCount = 3) {
  const safeList = sortByCreatedAtDesc(list || []).filter((item) => !isBlockedContent(item))
  const featuredList = []
  const recentNormalList = []

  safeList.forEach((item) => {
    if (isFeaturedContent(item)) {
      featuredList.push(item)
      return
    }

    if (recentNormalList.length < recentCount) {
      recentNormalList.push(item)
    }
  })

  return featuredList.concat(recentNormalList)
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

function buildReadingPreviewText(item) {
  const contentTitle = resolveReadingContentTitle(item)
  const bookTitle = normalizeText(item && item.bookTitle)
  const insight = normalizeText(item && item.insight)
  const excerpt = normalizeText(item && item.excerpt)
  const summaryText = insight || excerpt

  if (contentTitle && summaryText && contentTitle !== summaryText) {
    return `${contentTitle}：${summaryText}`
  }

  if (bookTitle && summaryText) {
    return `${bookTitle}：${summaryText}`
  }

  return contentTitle || summaryText || bookTitle || '阅读打卡'
}

function buildRelatedReadingLogs(list) {
  return (list || []).map((item) => {
    const insight = normalizeText(item && item.insight)
    const excerpt = normalizeText(item && item.excerpt)
    const images = getImageList(item)
    const bookTitle = normalizeText(item && item.bookTitle) || '未填写书名'
    const contentTitle = resolveReadingContentTitle(item)

    return {
      _id: item._id,
      type: 'reading',
      title: contentTitle || bookTitle,
      bookTitle,
      contentTitle,
      author: normalizeText(item && item.author),
      duration: Number(item && item.duration) || 0,
      pagesOrChapter: normalizeText(item && item.pagesOrChapter),
      insight,
      excerpt,
      activityId: normalizeText(item && item.activityId),
      activityTitle: normalizeText(item && item.activityTitle),
      summaryText: insight || excerpt,
      previewText: buildReadingPreviewText(item),
      createdAt: toTimestamp(item.createdAt),
      imageUrl: normalizeText(images[0]),
      images,
      isFeatured: isFeaturedContent(item),
      reviewStatus: isBlockedContent(item) ? 'blocked' : 'normal'
    }
  })
}

function buildRelatedLifeShares(list) {
  return (list || []).map((item) => {
    const images = getImageList(item)
    const title = normalizeText(item.title)
    const content = normalizeText(item.content)

    return {
      _id: item._id,
      type: 'life',
      activityId: normalizeText(item && item.activityId),
      activityTitle: normalizeText(item && item.activityTitle),
      title: title || '生活分享',
      content,
      previewText: content || title || '生活分享',
      createdAt: toTimestamp(item.createdAt),
      imageUrl: normalizeText(images[0]),
      images,
      isFeatured: isFeaturedContent(item),
      reviewStatus: isBlockedContent(item) ? 'blocked' : 'normal'
    }
  })
}

function buildRelatedRewardShares(list) {
  return (list || []).map((item) => {
    const images = getImageList(item)
    const title = normalizeText(item && item.title)
    const content = normalizeText(item && item.content)

    return {
      _id: item._id,
      type: 'reward',
      title: title || '晒晒你的奖励',
      content,
      previewText: content || title || '晒晒你的奖励',
      activityId: normalizeText(item && item.activityId),
      activityTitle: normalizeText(item && item.activityTitle),
      createdAt: toTimestamp(item.createdAt),
      imageUrl: normalizeText(images[0]),
      images,
      isFeatured: isFeaturedContent(item),
      reviewStatus: isBlockedContent(item) ? 'blocked' : 'normal'
    }
  })
}

function buildContentManage(canManageContent, readingLogList, lifeShareList, rewardShareList) {
  const safeReadingLogList = Array.isArray(readingLogList) ? readingLogList : []
  const safeLifeShareList = Array.isArray(lifeShareList) ? lifeShareList : []
  const safeRewardShareList = Array.isArray(rewardShareList) ? rewardShareList : []

  return {
    visible: !!canManageContent,
    totalCount: safeReadingLogList.length + safeLifeShareList.length + safeRewardShareList.length,
    readingLogCount: safeReadingLogList.length,
    readingLogs: canManageContent ? buildRelatedReadingLogs(safeReadingLogList) : [],
    lifeShareCount: safeLifeShareList.length,
    lifeShares: canManageContent ? buildRelatedLifeShares(safeLifeShareList) : [],
    rewardShareCount: safeRewardShareList.length,
    rewardShares: canManageContent ? buildRelatedRewardShares(safeRewardShareList) : []
  }
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
    const [userRes, activityRes] = await Promise.all([
      db.collection('users').where({ openid }).limit(1).get(),
      db.collection('activities').doc(activityId).get()
    ])

    const activity = activityRes.data

    if (!activity) {
      return {
        success: false,
        message: '活动不存在'
      }
    }

    const userRecord = (userRes.data && userRes.data[0]) || null
    const permissionInfo = buildPermissionInfo(userRecord)
    const registrations = Array.isArray(activity.registrations) ? activity.registrations : []
    const isRegistered = registrations.some((item) => item && item.openid === openid)
    const registrationCount = Number(activity.registrationCount) || registrations.length
    const activityTimeRange = getActivityTimeRange(activity)
    const activityMode = normalizeActivityMode(activity.activityMode)
    const activityType = normalizeActivityType(activity.activityType)
    const publishAt = getPublishAt(activity)
    const isScheduled = isScheduledActivity(activity)
    const publishTimeText = formatPublishTimeText(publishAt)
    const rewardMonthKey = activityType === 'rewardClaim'
      ? normalizeText(activity.rewardMonthKey)
      : ''
    const rewardLabel = activityType === 'rewardClaim'
      ? (normalizeText(activity.rewardLabel) || getCurrentRewardMeta().rewardLabel)
      : ''
    const memberUser = isMemberUser(userRecord)
    const ongoing = isActivityOngoing(activity)
    const ended = isActivityEnded(activity)
    const endedRegisterMessage = '活动已结束，无法报名'
    const registerLimitMessage = '非成员仅可报名活动期间内的线下活动'
    const rewardRegisterLimitMessage = '仅满足当前阅读激励规则的成员可报名领取奖励'
    const scheduledRegisterMessage = '活动预约发布中，暂不可报名'
    const canNonMemberRegister = activityMode === 'offline' && ongoing
    let rewardEligibleCount = 0
    let rewardClaimMembers = []
    let attendanceManage = {
      visible: false,
      attendeeList: []
    }
    let registerDisabledReason = ''
    let canRegister = false

    if (isScheduled && !permissionInfo.activityPermission) {
      return {
        success: false,
        message: '活动尚未发布'
      }
    }

    if (activityType === 'rewardClaim') {
      const readingIncentiveProgress = await getCurrentReadingIncentiveProgress(openid)
      rewardEligibleCount = readingIncentiveProgress.completedCount
      rewardClaimMembers = await buildRewardClaimMembers(registrations)
      registerDisabledReason = isScheduled
        ? (isRegistered ? '' : scheduledRegisterMessage)
        : (ended
        ? (isRegistered ? '' : endedRegisterMessage)
        : (!memberUser || !readingIncentiveProgress.isAchieved ? rewardRegisterLimitMessage : ''))
      canRegister = !isScheduled && !ended && activity.status === 'published' && !isRegistered && memberUser && readingIncentiveProgress.isAchieved
    } else {
      registerDisabledReason = isScheduled
        ? (isRegistered ? '' : scheduledRegisterMessage)
        : (ended
        ? (isRegistered ? '' : endedRegisterMessage)
        : (!memberUser && !canNonMemberRegister ? registerLimitMessage : ''))
      canRegister = !isScheduled && !ended && activity.status === 'published' && !isRegistered && (memberUser || canNonMemberRegister)
    }

    attendanceManage = await buildAttendanceManage(registrations, activityMode, permissionInfo)
    let eventList = []
    let readingLogList = []
    let lifeShareList = []
    let rewardShareList = []
    let relatedReadingLogs = []
    let relatedLifeShares = []
    let relatedRewardShares = []
    const canManageContent = !!(permissionInfo.superAdmin || permissionInfo.activityPermission)

    if (permissionInfo.dataPermission) {
      try {
        eventList = await getAllRecords('activity_events', { activityId })
      } catch (error) {
        eventList = []
      }
    }

    if (activityType === 'rewardClaim') {
      try {
        const rewardShareRes = await getAllRecords('reward_shares', { activityId }).catch(() => [])

        rewardShareList = sortByCreatedAtDesc(rewardShareRes || [])
        relatedRewardShares = buildRelatedRewardShares(
          buildPublicVisibleContentList(rewardShareList)
        )
      } catch (error) {
        rewardShareList = []
        relatedRewardShares = []
      }
    } else {
      try {
        const [readingRes, lifeShareRes] = await Promise.all([
          getAllRecords('reading_logs', { activityId }).catch(() => []),
          getAllRecords('life_shares', { activityId }).catch(() => [])
        ])

        readingLogList = sortByCreatedAtDesc(readingRes || [])
        lifeShareList = sortByCreatedAtDesc(lifeShareRes || [])
        relatedReadingLogs = buildRelatedReadingLogs(
          buildPublicVisibleContentList(readingLogList)
        )
        relatedLifeShares = buildRelatedLifeShares(
          buildPublicVisibleContentList(lifeShareList)
        )
      } catch (error) {
        readingLogList = []
        lifeShareList = []
        relatedReadingLogs = []
        relatedLifeShares = []
      }
    }

    return {
      success: true,
      permissionInfo,
      activity: {
        _id: activity._id,
        title: activity.title || '',
        timeType: activity.timeType || 'singlePoint',
        startDate: activity.startDate || '',
        endDate: activity.endDate || '',
        startTime: activity.startTime || '',
        endTime: activity.endTime || '',
        hasExactTime: !!activity.hasExactTime,
        timeText: buildTimeText(activity),
        activityTime: buildTimeText(activity),
        location: activity.location || '',
        description: activity.description || '',
        theme: activity.theme || '',
        officialAccountUrl: activity.officialAccountUrl || '',
        activityMode,
        activityModeText: getActivityModeText(activityMode),
        activityType,
        isRewardClaim: activityType === 'rewardClaim',
        rewardMonthKey,
        rewardLabel,
        coverUrl: activity.coverUrl || '',
        status: activity.status || 'published',
        isScheduled,
        publishAt,
        publishTimeText,
        publishStatusText: isScheduled ? '预约' : '已发布',
        isEnded: ended,
        sortTime: Number(activityTimeRange.startTimestamp) || 0,
        endSortTime: Number(activityTimeRange.endTimestamp) || Number(activityTimeRange.startTimestamp) || 0,
        createdAt: toTimestamp(activity.createdAt),
        registrationCount,
        isRegistered,
        canRegister,
        registerDisabledReason,
        registrationStatusText: isRegistered ? '已报名' : '未报名'
      },
      rewardClaimMembers,
      dashboard: buildDashboard(activity, eventList, permissionInfo.dataPermission, readingLogList, lifeShareList),
      relatedContent: {
        readingLogCount: readingLogList.length,
        readingLogs: relatedReadingLogs,
        lifeShareCount: lifeShareList.length,
        lifeShares: relatedLifeShares
      },
      rewardShareContent: {
        rewardShareCount: rewardShareList.length,
        rewardShares: relatedRewardShares
      },
      attendanceManage,
      contentManage: buildContentManage(canManageContent, readingLogList, lifeShareList, rewardShareList)
    }
  } catch (error) {
    return {
      success: false,
      message: '获取活动详情失败',
      error: error.message || error
    }
  }
}
