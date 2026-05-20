const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const EVENT_COLLECTION = 'poem_pancake_events'
const ALLOWED_EVENT_TYPES = {
  exposure: true,
  detail_click: true
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

function normalizeActivityIds(event) {
  const activityIds = Array.isArray(event.activityIds) ? event.activityIds : []
  const mergedIds = activityIds.concat(event.activityId || event.id || '')
  const activityMap = {}

  mergedIds.forEach((item) => {
    const activityId = normalizeText(item)

    if (activityId) {
      activityMap[activityId] = true
    }
  })

  return Object.keys(activityMap)
}

async function hasExistingEvent(activityId, openid, eventType) {
  try {
    const res = await db.collection(EVENT_COLLECTION).where({
      activityId,
      openid,
      eventType
    }).limit(1).get()

    return !!((res.data || [])[0])
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return false
    }

    throw error
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const eventType = normalizeText(event.eventType)
  const activityIds = normalizeActivityIds(event)

  if (!ALLOWED_EVENT_TYPES[eventType]) {
    return {
      success: false,
      message: '事件类型不合法'
    }
  }

  if (!activityIds.length) {
    return {
      success: false,
      message: '缺少活动信息'
    }
  }

  try {
    await ensureCollection(EVENT_COLLECTION)

    let successCount = 0

    for (const activityId of activityIds) {
      try {
        const existed = await hasExistingEvent(activityId, openid, eventType)

        if (existed) {
          successCount += 1
          continue
        }

        await db.collection(EVENT_COLLECTION).add({
          data: {
            eventKey: 'poem_pancake',
            activityId,
            openid,
            eventType,
            createdAt: new Date()
          }
        })

        successCount += 1
      } catch (singleError) {
        console.error('report single poem pancake event error:', singleError)
      }
    }

    if (!successCount) {
      return {
        success: false,
        message: '诗词摊煎饼事件记录失败'
      }
    }

    return {
      success: true,
      count: successCount
    }
  } catch (error) {
    return {
      success: false,
      message: '诗词摊煎饼事件记录失败',
      error: error.message || error
    }
  }
}
