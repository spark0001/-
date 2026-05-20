const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
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

function formatDateTime(timestamp) {
  if (!timestamp) {
    return '时间未知'
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}`
}

function formatRateText(clickUserCount, exposureUserCount) {
  const safeExposure = Number(exposureUserCount) || 0
  const safeClick = Number(clickUserCount) || 0

  if (!safeExposure) {
    return '0%'
  }

  const rate = safeClick / safeExposure * 100
  return `${rate.toFixed(rate < 10 ? 2 : 1)}%`
}

function getUniqueUserCount(eventList, eventType) {
  const userMap = {}

  ;(eventList || []).forEach((item) => {
    if (normalizeText(item && item.eventType) !== eventType) {
      return
    }

    const openid = normalizeText(item && item.openid)

    if (openid) {
      userMap[openid] = true
    }
  })

  return Object.keys(userMap).length
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const userRecord = (await getAllRecords('users', { openid }))[0] || null
    const permissionInfo = buildPermissionInfo(userRecord)

    if (!permissionInfo.dataPermission) {
      return {
        success: false,
        message: '当前账号无权限查看图书推荐数据'
      }
    }

    const [recommendationList, eventList] = await Promise.all([
      getAllRecords('book_recommendations'),
      getAllRecords('book_recommendation_events')
    ])

    const sortedRecommendationList = (recommendationList || []).sort((left, right) => {
      const rightTime = toTimestamp(right && (right.updatedAt || right.createdAt))
      const leftTime = toTimestamp(left && (left.updatedAt || left.createdAt))
      return rightTime - leftTime
    })

    const recommendationCards = sortedRecommendationList.map((item, index) => {
      const recommendationId = normalizeText(item && item._id)
      const currentEventList = (eventList || []).filter((eventItem) => {
        return normalizeText(eventItem && eventItem.recommendationId) === recommendationId
      })
      const updatedAt = toTimestamp(item && item.updatedAt)
      const createdAt = toTimestamp(item && item.createdAt)
      const displayTimestamp = updatedAt || createdAt
      const exposureUserCount = getUniqueUserCount(currentEventList, 'exposure')
      const clickUserCount = getUniqueUserCount(currentEventList, 'click')

      return {
        recommendationId,
        title: normalizeText(item && item.title) || '未命名推荐',
        summary: normalizeText(item && item.summary) || '暂无推荐简介',
        coverUrl: normalizeText(item && item.coverUrl),
        updatedAt,
        createdAt,
        timeText: `更新时间：${formatDateTime(displayTimestamp)}`,
        exposureUserCount,
        clickUserCount,
        clickRateText: formatRateText(clickUserCount, exposureUserCount),
        isCurrent: index === 0
      }
    })

    return {
      success: true,
      recommendationCards
    }
  } catch (error) {
    return {
      success: false,
      message: '图书推荐数据加载失败',
      error: error.message || error
    }
  }
}
