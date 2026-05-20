const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000

function normalizeLimit(value, defaultValue) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue
  }

  return Math.min(parsed, 100)
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

function buildTimeText(item) {
  if (item.timeType === 'singlePoint' && item.startDate && item.startTime) {
    return `${item.startDate} ${item.startTime}`
  }

  if (item.timeType === 'singleDayRange' && item.startDate && item.startTime && item.endTime) {
    return `${item.startDate} ${item.startTime} - ${item.endTime}`
  }

  if (item.startDate && item.endDate) {
    return item.hasExactTime
      ? `${item.startDate} ${item.startTime} ~ ${item.endDate} ${item.endTime}`
      : `${item.startDate} ~ ${item.endDate}`
  }

  if (item.timeText) {
    return item.timeText
  }

  if (item.activityTime) {
    return item.activityTime
  }

  return ''
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

function getActivityTimeRange(item) {
  const timeType = item && item.timeType ? item.timeType : 'singlePoint'
  const startDate = item && item.startDate ? item.startDate : ''
  const endDate = item && item.endDate ? item.endDate : startDate
  const startTime = item && item.startTime ? item.startTime : ''
  const endTime = item && item.endTime ? item.endTime : ''
  const hasExactTime = !!(item && item.hasExactTime)

  if (timeType === 'singlePoint' && startDate && startTime) {
    const timestamp = getTimestamp(startDate, startTime)

    if (!Number.isNaN(timestamp)) {
      return {
        startTimestamp: timestamp,
        endTimestamp: timestamp
      }
    }
  }

  if (timeType === 'singleDayRange' && startDate && startTime && endTime) {
    const startTimestamp = getTimestamp(startDate, startTime)
    const endTimestamp = getTimestamp(startDate, endTime)

    if (!Number.isNaN(startTimestamp) && !Number.isNaN(endTimestamp)) {
      return {
        startTimestamp,
        endTimestamp
      }
    }
  }

  if (timeType === 'dateRange' && startDate && endDate) {
    const rangeStartTime = hasExactTime ? (startTime || '00:00') : '00:00'
    const rangeEndTime = hasExactTime ? (endTime || '23:59') : '23:59'
    const startTimestamp = getTimestamp(startDate, rangeStartTime)
    const endTimestamp = getTimestamp(endDate, rangeEndTime)

    if (!Number.isNaN(startTimestamp) && !Number.isNaN(endTimestamp)) {
      return {
        startTimestamp,
        endTimestamp
      }
    }
  }

  return {
    startTimestamp: Number(item && item.sortTime) || 0,
    endTimestamp: Number(item && item.endSortTime) || Number(item && item.sortTime) || 0
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

function normalizeTemplateType(value) {
  if (value === 'template2' || value === 'template3') {
    return value
  }

  return 'template1'
}

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function getPublishAt(item) {
  return Number(item && item.publishAt) || 0
}

function isScheduledActivity(item, currentTimestamp = Date.now()) {
  const publishAt = getPublishAt(item)

  return !!(publishAt && publishAt > currentTimestamp)
}

function formatPublishTimeText(timestamp) {
  const publishAt = Number(timestamp) || 0

  if (!publishAt) {
    return ''
  }

  const date = new Date(publishAt + CHINA_TIME_OFFSET)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}`
}

function normalizeTemplateData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const limit = normalizeLimit(event.limit, 5)
  const includePast = !!event.includePast
  const withPermission = !!event.withPermission
  const currentTimestamp = Date.now()

  try {
    const [userRes, activityList] = await Promise.all([
      withPermission
        ? db.collection('users').where({ openid }).limit(1).get()
        : Promise.resolve({ data: [] }),
      getAllRecords('activities', {
        status: 'published'
      })
    ])

    const permissionInfo = withPermission
      ? buildPermissionInfo((userRes.data && userRes.data[0]) || null)
      : null
    const canViewScheduled = !!(permissionInfo && permissionInfo.activityPermission)

    const sortedActivityList = (activityList || [])
      .map((item) => {
        const timeRange = getActivityTimeRange(item)

        return {
          ...item,
          _dynamicSortTime: timeRange.startTimestamp,
          _dynamicEndSortTime: timeRange.endTimestamp,
          _dynamicIsScheduled: isScheduledActivity(item, currentTimestamp)
        }
      })
      .sort((a, b) => {
        return includePast
          ? ((Number(b._dynamicSortTime) || 0) - (Number(a._dynamicSortTime) || 0))
          : ((Number(a._dynamicSortTime) || 0) - (Number(b._dynamicSortTime) || 0))
      })

    const visibleActivityList = sortedActivityList.filter((item) => {
      return canViewScheduled || !item._dynamicIsScheduled
    })

    let listSource = includePast
      ? visibleActivityList.slice(0, limit)
      : visibleActivityList.filter((item) => {
        return (Number(item._dynamicSortTime) || 0) >= currentTimestamp
      }).slice(0, limit)

    if (!includePast && !listSource.length) {
      listSource = visibleActivityList
        .slice()
        .sort((a, b) => {
          return (Number(b._dynamicSortTime) || 0) - (Number(a._dynamicSortTime) || 0)
        })
        .slice(0, limit)
    }

    const list = listSource.map((item) => {
      const registrations = Array.isArray(item.registrations) ? item.registrations : []
      const displayConfig = item.displayConfig && typeof item.displayConfig === 'object'
        ? item.displayConfig
        : {}
      const timeRange = getActivityTimeRange(item)
      const publishAt = getPublishAt(item)
      const isScheduled = !!item._dynamicIsScheduled

      return {
        _id: item._id,
        templateType: normalizeTemplateType(displayConfig.templateType),
        title: item.title || '',
        timeType: item.timeType || 'singlePoint',
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        startTime: item.startTime || '',
        endTime: item.endTime || '',
        hasExactTime: !!item.hasExactTime,
        timeText: buildTimeText(item),
        activityTime: buildTimeText(item),
        location: item.location || '',
        description: item.description || '',
        theme: item.theme || '',
        officialAccountUrl: item.officialAccountUrl || '',
        activityMode: normalizeActivityMode(item.activityMode),
        activityType: normalizeActivityType(item.activityType),
        isReadingIncentiveActivity: !!(
          item.isReadingIncentiveActivity === true
          || item.isCurrentReadingIncentive === true
        ),
        isCurrentReadingIncentive: item.isCurrentReadingIncentive === true,
        rewardMonthKey: item.rewardMonthKey || '',
        rewardLabel: item.rewardLabel || '',
        coverUrl: item.coverUrl || '',
        displayConfig: {
          templateType: normalizeTemplateType(displayConfig.templateType),
          templateData: normalizeTemplateData(displayConfig.templateData)
        },
        status: item.status || 'published',
        publishAt,
        publishTimeText: formatPublishTimeText(publishAt),
        isScheduled,
        publishStatusText: isScheduled ? '预约' : '已发布',
        isRegistered: registrations.some((registration) => registration && registration.openid === openid),
        sortTime: Number(timeRange.startTimestamp) || 0,
        endSortTime: Number(timeRange.endTimestamp) || Number(timeRange.startTimestamp) || 0,
        registrationCount: Number(item.registrationCount) || registrations.length
      }
    })

    return {
      success: true,
      list,
      currentUserPermission: permissionInfo
    }
  } catch (error) {
    return {
      success: false,
      message: '获取活动列表失败',
      error: error.message || error
    }
  }
}
