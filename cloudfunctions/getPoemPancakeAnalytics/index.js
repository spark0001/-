const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ACTIVITY_COLLECTION = 'poem_pancake_activities'
const EVENT_COLLECTION = 'poem_pancake_events'
const PLAY_LOG_COLLECTION = 'poem_pancake_play_logs'
const VALID_DIMENSIONS = ['cycle', 'week', 'month', 'year']
const SERIES_KEYS = [
  'exposureUserCount',
  'detailClickUserCount',
  'playUserCount',
  'charCount'
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeDimension(value) {
  return VALID_DIMENSIONS.includes(value) ? value : 'cycle'
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function toTimestamp(value) {
  if (!value) {
    return 0
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 0
  }

  return date.getTime()
}

function cloneDate(value) {
  return new Date(value.getTime())
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function startOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function startOfYear(value) {
  return new Date(value.getFullYear(), 0, 1)
}

function addDays(value, days) {
  const nextDate = cloneDate(value)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function addMonths(value, months) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1)
}

function formatDateKey(value) {
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}-${padNumber(value.getDate())}`
}

function formatMonthKey(value) {
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}`
}

function formatDateTime(value) {
  const timestamp = toTimestamp(value)

  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function formatActivityTimeRange(startAt, deadlineAt) {
  const startText = formatDateTime(startAt)
  const deadlineText = formatDateTime(deadlineAt)

  if (startText && deadlineText) {
    return `${startText} - ${deadlineText}`
  }

  return deadlineText || startText || '时间待定'
}

function formatRateText(numerator, denominator) {
  const safeDenominator = Number(denominator) || 0

  if (!safeDenominator) {
    return '0%'
  }

  return `${Number((((Number(numerator) || 0) / safeDenominator) * 100).toFixed(1))}%`
}

function truncateText(text, maxLength = 6) {
  const charList = Array.from(normalizeText(text))

  if (charList.length <= maxLength) {
    return charList.join('')
  }

  return `${charList.slice(0, maxLength).join('')}…`
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
    || message.indexOf('already exists') !== -1
}

async function ensureCollection(collectionName) {
  try {
    await db.createCollection(collectionName)
  } catch (error) {
    if (isCollectionAlreadyExistError(error)) {
      return
    }

    throw error
  }
}

async function getAllRecords(collectionName, whereData) {
  const list = []
  let skip = 0
  const pageSize = 100

  while (true) {
    try {
      let query = db.collection(collectionName)

      if (whereData && Object.keys(whereData).length) {
        query = query.where(whereData)
      }

      const res = await query.skip(skip).limit(pageSize).get()
      const data = res.data || []
      list.push(...data)

      if (data.length < pageSize) {
        break
      }

      skip += data.length
    } catch (error) {
      if (isCollectionNotExistError(error)) {
        return []
      }

      throw error
    }
  }

  return list
}

function buildPermissionInfo(userRecord) {
  return {
    dataPermission: typeof (userRecord && userRecord.dataPermission) === 'boolean'
      ? userRecord.dataPermission
      : false
  }
}

function getUniqueUserCount(list, fieldName = 'openid') {
  const userMap = {}

  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const value = normalizeText(item && item[fieldName])

    if (value) {
      userMap[value] = true
    }
  })

  return Object.keys(userMap).length
}

function filterEventList(list, eventType) {
  return (Array.isArray(list) ? list : []).filter((item) => {
    return normalizeText(item && item.eventType) === eventType
  })
}

function getActivitySortTimestamp(activity) {
  return toTimestamp(activity && activity.startAt)
    || toTimestamp(activity && activity.deadlineAt)
    || toTimestamp(activity && activity.updatedAt)
    || toTimestamp(activity && activity.createdAt)
    || 0
}

function getActivityStatusText(status) {
  const safeStatus = normalizeText(status)

  if (safeStatus === 'archived') {
    return '已归档'
  }

  if (safeStatus === 'closed') {
    return '已截止'
  }

  if (safeStatus === 'draft') {
    return '草稿'
  }

  return '进行中'
}

function normalizeActivityList(activityList = []) {
  return (Array.isArray(activityList) ? activityList : [])
    .filter((item) => {
      return ['published', 'closed', 'archived'].includes(normalizeText(item && item.status))
    })
}

function buildActivityStats(activityList, eventList, playLogList) {
  const eventMap = {}
  const playLogMap = {}

  ;(eventList || []).forEach((item) => {
    const activityId = normalizeText(item && item.activityId)

    if (!activityId) {
      return
    }

    if (!eventMap[activityId]) {
      eventMap[activityId] = []
    }

    eventMap[activityId].push(item)
  })

  ;(playLogList || []).forEach((item) => {
    const activityId = normalizeText(item && item.activityId)

    if (!activityId) {
      return
    }

    if (!playLogMap[activityId]) {
      playLogMap[activityId] = []
    }

    playLogMap[activityId].push(item)
  })

  return normalizeActivityList(activityList)
    .slice()
    .sort((a, b) => getActivitySortTimestamp(b) - getActivitySortTimestamp(a))
    .map((activity) => {
      const activityId = normalizeText(activity && activity._id)
      const currentEventList = eventMap[activityId] || []
      const currentExposureList = filterEventList(currentEventList, 'exposure')
      const currentDetailClickList = filterEventList(currentEventList, 'detail_click')
      const currentPlayLogList = playLogMap[activityId] || []
      const filledCharCount = Number(activity && activity.filledCount) || 0
      const playUserCount = getUniqueUserCount(currentPlayLogList)

      return {
        activityId,
        title: normalizeText(activity && activity.title) || '未命名活动',
        shortTitle: truncateText(activity && activity.title, 6) || '未命名',
        timeText: formatActivityTimeRange(activity && activity.startAt, activity && activity.deadlineAt),
        statusText: getActivityStatusText(activity && activity.status),
        sortTimestamp: getActivitySortTimestamp(activity),
        exposureUserCount: getUniqueUserCount(currentExposureList),
        detailClickUserCount: getUniqueUserCount(currentDetailClickList),
        playUserCount,
        playCount: currentPlayLogList.length,
        filledCharCount,
        clickRateText: formatRateText(getUniqueUserCount(currentDetailClickList), getUniqueUserCount(currentExposureList)),
        playRateText: formatRateText(playUserCount, getUniqueUserCount(currentDetailClickList))
      }
    })
}

function buildSummary(activityStats, eventList, playLogList) {
  const exposureUserCount = getUniqueUserCount(filterEventList(eventList, 'exposure'))
  const detailClickUserCount = getUniqueUserCount(filterEventList(eventList, 'detail_click'))
  const playUserCount = getUniqueUserCount(playLogList)
  const totalCharCount = (activityStats || []).reduce((sum, item) => {
    return sum + (Number(item && item.filledCharCount) || 0)
  }, 0)

  return {
    totalActivityCount: Array.isArray(activityStats) ? activityStats.length : 0,
    exposureUserCount,
    detailClickUserCount,
    playUserCount,
    totalCharCount,
    detailRateText: formatRateText(detailClickUserCount, exposureUserCount),
    playRateText: formatRateText(playUserCount, detailClickUserCount)
  }
}

function buildSummaryFunnelStages(summary) {
  const safeSummary = summary || {}

  return [
    {
      key: 'exposureUserCount',
      label: '曝光量',
      value: Number(safeSummary.exposureUserCount) || 0
    },
    {
      key: 'detailClickUserCount',
      label: '点击详情页量',
      value: Number(safeSummary.detailClickUserCount) || 0
    },
    {
      key: 'playUserCount',
      label: '游玩人数',
      value: Number(safeSummary.playUserCount) || 0
    }
  ]
}

function getLatestAnalyticsTimestamp(activityList, eventList, playLogList) {
  let latestTimestamp = Date.now()

  ;(activityList || []).forEach((item) => {
    latestTimestamp = Math.max(latestTimestamp, getActivitySortTimestamp(item))
  })

  ;(eventList || []).forEach((item) => {
    latestTimestamp = Math.max(latestTimestamp, toTimestamp(item && item.createdAt))
  })

  ;(playLogList || []).forEach((item) => {
    latestTimestamp = Math.max(latestTimestamp, toTimestamp(item && item.createdAt))
  })

  return latestTimestamp || Date.now()
}

function buildCycleAnalytics(activityStats, summary) {
  const chronologicalList = (Array.isArray(activityStats) ? activityStats : [])
    .slice()
    .sort((a, b) => (Number(a && a.sortTimestamp) || 0) - (Number(b && b.sortTimestamp) || 0))

  return {
    dimension: 'cycle',
    labels: chronologicalList.map((item) => item.shortTitle || '未命名'),
    seriesMap: {
      exposureUserCount: chronologicalList.map((item) => Number(item.exposureUserCount) || 0),
      detailClickUserCount: chronologicalList.map((item) => Number(item.detailClickUserCount) || 0),
      playUserCount: chronologicalList.map((item) => Number(item.playUserCount) || 0),
      charCount: chronologicalList.map((item) => Number(item.filledCharCount) || 0)
    },
    funnelStages: buildSummaryFunnelStages(summary)
  }
}

function buildBuckets(dimension, anchorTimestamp) {
  const anchorDate = anchorTimestamp ? new Date(anchorTimestamp) : new Date()
  const safeAnchor = Number.isNaN(anchorDate.getTime()) ? new Date() : anchorDate
  const buckets = []

  if (dimension === 'week') {
    const anchorDay = startOfDay(safeAnchor)

    for (let i = 6; i >= 0; i -= 1) {
      const currentDay = addDays(anchorDay, -i)

      buckets.push({
        key: formatDateKey(currentDay),
        label: `${padNumber(currentDay.getMonth() + 1)}-${padNumber(currentDay.getDate())}`
      })
    }

    return buckets
  }

  if (dimension === 'month') {
    const anchorMonth = startOfMonth(safeAnchor)
    const nextMonth = addMonths(anchorMonth, 1)
    const totalDays = Math.round((nextMonth.getTime() - anchorMonth.getTime()) / (24 * 60 * 60 * 1000))

    for (let i = 0; i < totalDays; i += 1) {
      const currentDay = addDays(anchorMonth, i)

      buckets.push({
        key: formatDateKey(currentDay),
        label: padNumber(currentDay.getDate())
      })
    }

    return buckets
  }

  if (dimension === 'year') {
    const anchorYear = startOfYear(safeAnchor)

    for (let i = 0; i < 12; i += 1) {
      const currentMonth = addMonths(anchorYear, i)

      buckets.push({
        key: formatMonthKey(currentMonth),
        label: `${padNumber(currentMonth.getMonth() + 1)}月`
      })
    }
  }

  return buckets
}

function getBucketKey(value, dimension) {
  const safeDate = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(safeDate.getTime())) {
    return ''
  }

  if (dimension === 'year') {
    return formatMonthKey(safeDate)
  }

  return formatDateKey(safeDate)
}

function buildEmptyUniqueMapList(length) {
  return Array.from({ length }, () => ({}))
}

function countUniqueMapList(mapList) {
  return (mapList || []).map((item) => Object.keys(item || {}).length)
}

function buildTimeAnalytics(dimension, activityList, eventList, playLogList) {
  const latestTimestamp = getLatestAnalyticsTimestamp(activityList, eventList, playLogList)
  const buckets = buildBuckets(dimension, latestTimestamp)
  const bucketIndexMap = {}

  buckets.forEach((item, index) => {
    bucketIndexMap[item.key] = index
  })

  const exposureUserMapList = buildEmptyUniqueMapList(buckets.length)
  const detailClickUserMapList = buildEmptyUniqueMapList(buckets.length)
  const playUserMapList = buildEmptyUniqueMapList(buckets.length)
  const charCountList = new Array(buckets.length).fill(0)

  ;(eventList || []).forEach((item) => {
    const bucketKey = getBucketKey(item && item.createdAt, dimension)
    const bucketIndex = bucketIndexMap[bucketKey]
    const openid = normalizeText(item && item.openid)

    if (bucketIndex === undefined || !openid) {
      return
    }

    if (normalizeText(item && item.eventType) === 'exposure') {
      exposureUserMapList[bucketIndex][openid] = true
    }

    if (normalizeText(item && item.eventType) === 'detail_click') {
      detailClickUserMapList[bucketIndex][openid] = true
    }
  })

  ;(playLogList || []).forEach((item) => {
    const bucketKey = getBucketKey(item && item.createdAt, dimension)
    const bucketIndex = bucketIndexMap[bucketKey]
    const openid = normalizeText(item && item.openid)

    if (bucketIndex === undefined) {
      return
    }

    if (openid) {
      playUserMapList[bucketIndex][openid] = true
    }

    charCountList[bucketIndex] += Math.max(0, Number(item && item.createdCharCount) || Number(item && item.charCount) || 0)
  })

  const bucketKeySet = {}

  buckets.forEach((item) => {
    bucketKeySet[item.key] = true
  })

  const exposureList = filterEventList(eventList, 'exposure').filter((item) => bucketKeySet[getBucketKey(item && item.createdAt, dimension)])
  const detailClickList = filterEventList(eventList, 'detail_click').filter((item) => bucketKeySet[getBucketKey(item && item.createdAt, dimension)])
  const playList = (playLogList || []).filter((item) => bucketKeySet[getBucketKey(item && item.createdAt, dimension)])

  return {
    dimension,
    labels: buckets.map((item) => item.label),
    seriesMap: {
      exposureUserCount: countUniqueMapList(exposureUserMapList),
      detailClickUserCount: countUniqueMapList(detailClickUserMapList),
      playUserCount: countUniqueMapList(playUserMapList),
      charCount: charCountList
    },
    funnelStages: [
      {
        key: 'exposureUserCount',
        label: '曝光量',
        value: getUniqueUserCount(exposureList)
      },
      {
        key: 'detailClickUserCount',
        label: '点击详情页量',
        value: getUniqueUserCount(detailClickList)
      },
      {
        key: 'playUserCount',
        label: '游玩人数',
        value: getUniqueUserCount(playList)
      }
    ]
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const dimension = normalizeDimension(normalizeText(event.dimension))

  try {
    await ensureCollection(ACTIVITY_COLLECTION)
    await ensureCollection(EVENT_COLLECTION)
    await ensureCollection(PLAY_LOG_COLLECTION)

    const [userList, activityList, eventList, playLogList] = await Promise.all([
      getAllRecords('users', { openid }),
      getAllRecords(ACTIVITY_COLLECTION),
      getAllRecords(EVENT_COLLECTION),
      getAllRecords(PLAY_LOG_COLLECTION)
    ])

    const userRecord = (userList || [])[0] || null
    const permissionInfo = buildPermissionInfo(userRecord)

    if (!permissionInfo.dataPermission) {
      return {
        success: false,
        message: '当前账号无权限查看诗词摊煎饼数据'
      }
    }

    const activityStats = buildActivityStats(activityList, eventList, playLogList)
    const summary = buildSummary(activityStats, eventList, playLogList)
    const analytics = dimension === 'cycle'
      ? buildCycleAnalytics(activityStats, summary)
      : buildTimeAnalytics(dimension, activityList, eventList, playLogList)

    return {
      success: true,
      summary,
      funnelStages: buildSummaryFunnelStages(summary),
      activityStats,
      analytics: {
        dimension: analytics.dimension,
        labels: analytics.labels || [],
        seriesMap: SERIES_KEYS.reduce((result, key) => {
          result[key] = analytics.seriesMap && Array.isArray(analytics.seriesMap[key])
            ? analytics.seriesMap[key]
            : []
          return result
        }, {}),
        funnelStages: analytics.funnelStages || []
      }
    }
  } catch (error) {
    return {
      success: false,
      message: '诗词摊煎饼数据加载失败',
      error: error.message || error
    }
  }
}
