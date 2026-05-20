const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

function hasBookRecommendationManagePermission(userRecord) {
  return !!(
    userRecord
    && userRecord.bookRecommendationPermission === true
    && (
      userRecord.superAdmin === true
      || (userRecord.role === 'admin' && userRecord.status === 'approved')
    )
  )
}

async function getUserRecord(openid) {
  const userRes = await db.collection('users')
    .where({ openid })
    .field({
      role: true,
      status: true,
      superAdmin: true,
      bookRecommendationPermission: true
    })
    .limit(1)
    .get()

  return (userRes.data && userRes.data[0]) || null
}

async function assertBookRecommendationPermission(openid) {
  const userRecord = await getUserRecord(openid)

  if (!hasBookRecommendationManagePermission(userRecord)) {
    throw new Error('当前账号没有图书推荐管理权限')
  }

  return userRecord
}

async function getLatestRecommendation() {
  try {
    const res = await db.collection('book_recommendations')
      .orderBy('updatedAt', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()

    return (res.data && res.data[0]) || null
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

async function getRecommendationList() {
  try {
    const pageSize = 100
    let skip = 0
    let list = []

    while (true) {
      const res = await db.collection('book_recommendations')
        .orderBy('updatedAt', 'desc')
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const currentBatch = res.data || []

      list = list.concat(currentBatch)

      if (currentBatch.length < pageSize) {
        break
      }

      skip += currentBatch.length
    }

    return list
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  }
}

async function getRecommendationEvents(recommendationId) {
  if (!recommendationId) {
    return []
  }

  try {
    const pageSize = 100
    let skip = 0
    let list = []

    while (true) {
      const res = await db.collection('book_recommendation_events')
        .where({
          recommendationId
        })
        .skip(skip)
        .limit(pageSize)
        .get()

      const currentBatch = res.data || []

      list = list.concat(currentBatch)

      if (currentBatch.length < pageSize) {
        break
      }

      skip += currentBatch.length
    }

    return list
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  }
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

exports.main = async () => {
  const wxContext = cloud.getWXContext()

  try {
    await assertBookRecommendationPermission(wxContext.OPENID)

    const recommendation = await getLatestRecommendation()
    const recommendationList = await getRecommendationList()
    const eventList = await getRecommendationEvents(recommendation && recommendation._id)
    const exposureCount = getUniqueUserCount(eventList, 'exposure')
    const clickCount = getUniqueUserCount(eventList, 'click')

    return {
      success: true,
      recommendation: recommendation ? {
        _id: recommendation._id,
        title: recommendation.title || '',
        summary: recommendation.summary || '',
        coverUrl: recommendation.coverUrl || '',
        articleUrl: recommendation.articleUrl || '',
        updatedAt: toTimestamp(recommendation.updatedAt),
        createdAt: toTimestamp(recommendation.createdAt)
      } : null,
      currentRecommendationId: recommendation && recommendation._id ? recommendation._id : '',
      recommendationList: (recommendationList || []).map((item) => ({
        _id: item._id,
        title: item.title || '',
        summary: item.summary || '',
        coverUrl: item.coverUrl || '',
        articleUrl: item.articleUrl || '',
        updatedAt: toTimestamp(item.updatedAt),
        createdAt: toTimestamp(item.createdAt)
      })),
      stats: {
        exposureCount,
        clickCount
      }
    }
  } catch (error) {
    return {
      success: false,
      message: error.message || '获取图书推荐管理数据失败',
      error: error.message || error
    }
  }
}
