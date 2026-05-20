const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const VALID_DIMENSIONS = ['day', 'week', 'month', 'year']
const SERIES_KEYS = [
  'exposureUserCount',
  'detailClickUserCount',
  'registerUserCount',
  'attendanceUserCount',
  'readingLogCount',
  'lifeShareCount'
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeDimension(value) {
  return VALID_DIMENSIONS.includes(value) ? value : 'day'
}

function padNumber(value) {
  return String(value).padStart(2, '0')
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

function cloneDate(value) {
  return new Date(value.getTime())
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function addDays(value, days) {
  const nextDate = cloneDate(value)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function addMonths(value, months) {
  const nextDate = new Date(value.getFullYear(), value.getMonth() + months, 1)
  return nextDate
}

function addYears(value, years) {
  return new Date(value.getFullYear() + years, 0, 1)
}

function startOfMonth(value) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function startOfYear(value) {
  return new Date(value.getFullYear(), 0, 1)
}

function getWeekStartDate(value) {
  const currentDay = startOfDay(value)
  const day = currentDay.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(currentDay, diff)
}

function formatDateKey(value) {
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}-${padNumber(value.getDate())}`
}

function formatMonthKey(value) {
  return `${value.getFullYear()}-${padNumber(value.getMonth() + 1)}`
}

function formatYearKey(value) {
  return String(value.getFullYear())
}

function formatHourKey(value) {
  return `${formatDateKey(value)} ${padNumber(value.getHours())}:00`
}

function getBucketKey(value, dimension) {
  const safeDate = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(safeDate.getTime())) {
    return ''
  }

  if (dimension === 'week') {
    return formatDateKey(safeDate)
  }

  if (dimension === 'month') {
    return formatDateKey(safeDate)
  }

  if (dimension === 'year') {
    return formatMonthKey(safeDate)
  }

  if (dimension === 'day') {
    return formatHourKey(safeDate)
  }

  return formatDateKey(safeDate)
}

function buildBuckets(dimension, anchorTimestamp) {
  const anchorDate = anchorTimestamp ? new Date(anchorTimestamp) : new Date()
  const safeAnchor = Number.isNaN(anchorDate.getTime()) ? new Date() : anchorDate
  const buckets = []

  if (dimension === 'day') {
    const anchorDay = startOfDay(safeAnchor)

    for (let hour = 0; hour < 24; hour += 1) {
      const currentHour = new Date(
        anchorDay.getFullYear(),
        anchorDay.getMonth(),
        anchorDay.getDate(),
        hour,
        0,
        0,
        0
      )

      buckets.push({
        key: formatHourKey(currentHour),
        label: `${padNumber(hour)}:00`
      })
    }

    return buckets
  }

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

    return buckets
  }

  return buckets
}

function buildPermissionInfo(userRecord) {
  return {
    dataPermission: typeof (userRecord && userRecord.dataPermission) === 'boolean'
      ? userRecord.dataPermission
      : false
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

function getUniqueUserCount(eventList, eventType) {
  const userMap = {}

  ;(eventList || []).forEach((item) => {
    if (item && item.eventType === eventType && item.openid) {
      userMap[item.openid] = true
    }
  })

  return Object.keys(userMap).length
}

function getAttendanceUserCount(readingLogList, lifeShareList) {
  const userMap = {}

  ;(readingLogList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (openid) {
      userMap[openid] = true
    }
  })

  ;(lifeShareList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (openid) {
      userMap[openid] = true
    }
  })

  return Object.keys(userMap).length
}

function getLatestAnalyticsTimestamp(activity, eventList, readingLogList, lifeShareList) {
  let latestTimestamp = toTimestamp(activity && activity.createdAt) || Date.now()

  ;(Array.isArray(activity && activity.registrations) ? activity.registrations : []).forEach((item) => {
    latestTimestamp = Math.max(latestTimestamp, toTimestamp(item && item.createdAt) || 0)
  })

  ;(eventList || []).forEach((item) => {
    latestTimestamp = Math.max(latestTimestamp, toTimestamp(item && item.createdAt) || 0)
  })

  ;(readingLogList || []).forEach((item) => {
    latestTimestamp = Math.max(latestTimestamp, toTimestamp(item && item.createdAt) || 0)
  })

  ;(lifeShareList || []).forEach((item) => {
    latestTimestamp = Math.max(latestTimestamp, toTimestamp(item && item.createdAt) || 0)
  })

  return latestTimestamp
}

function buildEmptyUniqueMapList(length) {
  return Array.from({ length }, () => ({}))
}

function countUniqueMapList(mapList) {
  return (mapList || []).map((item) => Object.keys(item || {}).length)
}

function buildSeriesMap(buckets, activity, eventList, readingLogList, lifeShareList, dimension) {
  const bucketIndexMap = {}

  buckets.forEach((item, index) => {
    bucketIndexMap[item.key] = index
  })

  const exposureUserMapList = buildEmptyUniqueMapList(buckets.length)
  const detailClickUserMapList = buildEmptyUniqueMapList(buckets.length)
  const registerUserMapList = buildEmptyUniqueMapList(buckets.length)
  const attendanceUserMapList = buildEmptyUniqueMapList(buckets.length)
  const readingLogCountList = new Array(buckets.length).fill(0)
  const lifeShareCountList = new Array(buckets.length).fill(0)

  ;(eventList || []).forEach((item) => {
    const bucketKey = getBucketKey(item && item.createdAt, dimension)
    const bucketIndex = bucketIndexMap[bucketKey]
    const openid = normalizeText(item && item.openid)

    if (bucketIndex === undefined || !openid) {
      return
    }

    if (item.eventType === 'exposure') {
      exposureUserMapList[bucketIndex][openid] = true
    }

    if (item.eventType === 'detail_click') {
      detailClickUserMapList[bucketIndex][openid] = true
    }
  })

  ;(Array.isArray(activity && activity.registrations) ? activity.registrations : []).forEach((item) => {
    const bucketKey = getBucketKey(item && item.createdAt, dimension)
    const bucketIndex = bucketIndexMap[bucketKey]
    const openid = normalizeText(item && item.openid)

    if (bucketIndex === undefined || !openid) {
      return
    }

    registerUserMapList[bucketIndex][openid] = true
  })

  ;(readingLogList || []).forEach((item) => {
    const bucketKey = getBucketKey(item && item.createdAt, dimension)
    const bucketIndex = bucketIndexMap[bucketKey]
    const openid = normalizeText(item && item.openid)

    if (bucketIndex === undefined) {
      return
    }

    readingLogCountList[bucketIndex] += 1

    if (openid) {
      attendanceUserMapList[bucketIndex][openid] = true
    }
  })

  ;(lifeShareList || []).forEach((item) => {
    const bucketKey = getBucketKey(item && item.createdAt, dimension)
    const bucketIndex = bucketIndexMap[bucketKey]
    const openid = normalizeText(item && item.openid)

    if (bucketIndex === undefined) {
      return
    }

    lifeShareCountList[bucketIndex] += 1

    if (openid) {
      attendanceUserMapList[bucketIndex][openid] = true
    }
  })

  return {
    exposureUserCount: countUniqueMapList(exposureUserMapList),
    detailClickUserCount: countUniqueMapList(detailClickUserMapList),
    registerUserCount: countUniqueMapList(registerUserMapList),
    attendanceUserCount: countUniqueMapList(attendanceUserMapList),
    readingLogCount: readingLogCountList,
    lifeShareCount: lifeShareCountList
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const activityId = normalizeText(event.activityId || event.id)
  const dimension = normalizeDimension(normalizeText(event.dimension))

  if (!activityId) {
    return {
      success: false,
      message: '缺少活动ID'
    }
  }

  try {
    const [userRes, activityRes, eventList, readingLogList, lifeShareList] = await Promise.all([
      db.collection('users').where({ openid }).limit(1).get(),
      db.collection('activities').doc(activityId).get(),
      getAllRecords('activity_events', { activityId }).catch(() => []),
      getAllRecords('reading_logs', { activityId }).catch(() => []),
      getAllRecords('life_shares', { activityId }).catch(() => [])
    ])

    const userRecord = (userRes.data && userRes.data[0]) || null
    const permissionInfo = buildPermissionInfo(userRecord)
    const activity = activityRes.data

    if (!permissionInfo.dataPermission) {
      return {
        success: false,
        message: '当前账号无权限查看数据分析'
      }
    }

    if (!activity) {
      return {
        success: false,
        message: '活动不存在'
      }
    }

    const latestTimestamp = getLatestAnalyticsTimestamp(activity, eventList, readingLogList, lifeShareList)
    const bucketAnchorTimestamp = dimension === 'day' ? Date.now() : latestTimestamp
    const buckets = buildBuckets(dimension, bucketAnchorTimestamp)
    const seriesMap = buildSeriesMap(buckets, activity, eventList, readingLogList, lifeShareList, dimension)
    const registrations = Array.isArray(activity.registrations) ? activity.registrations : []
    const funnelStages = [
      {
        key: 'exposureUserCount',
        label: '曝光人数',
        value: getUniqueUserCount(eventList, 'exposure')
      },
      {
        key: 'detailClickUserCount',
        label: '详情点击人数',
        value: getUniqueUserCount(eventList, 'detail_click')
      },
      {
        key: 'registerUserCount',
        label: '报名人数',
        value: Number(activity.registrationCount) || registrations.length
      },
      {
        key: 'attendanceUserCount',
        label: '实际参与人数',
        value: getAttendanceUserCount(readingLogList, lifeShareList)
      }
    ]

    return {
      success: true,
      activity: {
        _id: activity._id,
        title: activity.title || '未命名活动'
      },
      analytics: {
        dimension,
        labels: buckets.map((item) => item.label),
        seriesMap: SERIES_KEYS.reduce((result, key) => {
          result[key] = seriesMap[key] || new Array(buckets.length).fill(0)
          return result
        }, {}),
        funnelStages
      }
    }
  } catch (error) {
    return {
      success: false,
      message: '获取活动分析数据失败',
      error: error.message || error
    }
  }
}
