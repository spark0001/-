const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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

async function getExistingEvent(openid, eventType) {
  try {
    const res = await db.collection('blind_poem_events').where({
      eventKey: 'blind_poem',
      openid,
      eventType
    }).limit(1).get()

    return (res.data || [])[0] || null
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const eventType = normalizeText(event.eventType)

  if (!ALLOWED_EVENT_TYPES[eventType]) {
    return {
      success: false,
      message: '事件类型不合法'
    }
  }

  try {
    const existingEvent = await getExistingEvent(openid, eventType)

    if (existingEvent) {
      return {
        success: true,
        deduped: true
      }
    }

    await ensureCollection('blind_poem_events')

    await db.collection('blind_poem_events').add({
      data: {
        eventKey: 'blind_poem',
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
      message: '双盲作诗事件上报失败',
      error: error.message || error
    }
  }
}
