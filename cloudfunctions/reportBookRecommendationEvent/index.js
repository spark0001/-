const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ALLOWED_EVENT_TYPES = {
  exposure: true,
  click: true
}

function normalizeText(value) {
  return String(value || '').trim()
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

async function getRecommendation(recommendationId) {
  try {
    const res = await db.collection('book_recommendations').doc(recommendationId).get()
    return res.data || null
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

async function getExistingEvent(recommendationId, openid, eventType) {
  try {
    const res = await db.collection('book_recommendation_events')
      .where({
        recommendationId,
        openid,
        eventType
      })
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

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const recommendationId = normalizeText(event.recommendationId)
  const eventType = normalizeText(event.eventType)
  const openid = wxContext.OPENID

  if (!recommendationId) {
    return {
      success: false,
      message: '缺少推荐内容'
    }
  }

  if (!ALLOWED_EVENT_TYPES[eventType]) {
    return {
      success: false,
      message: '事件类型不合法'
    }
  }

  try {
    const recommendation = await getRecommendation(recommendationId)

    if (!recommendation) {
      return {
        success: false,
        message: '推荐内容不存在'
      }
    }

    const existingEvent = await getExistingEvent(recommendationId, openid, eventType)

    if (existingEvent) {
      return {
        success: true,
        deduped: true
      }
    }

    await ensureCollection('book_recommendation_events')

    await db.collection('book_recommendation_events').add({
      data: {
        recommendationId,
        openid,
        eventType,
        createdAt: new Date()
      }
    })

    return {
      success: true,
      deduped: false
    }
  } catch (error) {
    return {
      success: false,
      message: '上报图书推荐事件失败',
      error: error.message || error
    }
  }
}
