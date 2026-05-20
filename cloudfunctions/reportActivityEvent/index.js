const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ALLOWED_EVENT_TYPES = {
  exposure: true,
  detail_click: true,
  attendance: true
}

const DEDUPED_EVENT_TYPES = {
  exposure: true,
  detail_click: true,
  attendance: true
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeActivityIds(event) {
  const activityIds = Array.isArray(event.activityIds) ? event.activityIds : []
  const mergedIds = activityIds.concat(event.activityId || event.id || '')
  const map = {}

  mergedIds.forEach((item) => {
    const id = normalizeText(item)

    if (id) {
      map[id] = true
    }
  })

  return Object.keys(map)
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const eventType = normalizeText(event.eventType)
  const activityIds = normalizeActivityIds(event)

  if (!ALLOWED_EVENT_TYPES[eventType]) {
    return {
      success: false,
      message: '不支持的活动事件类型'
    }
  }

  if (!activityIds.length) {
    return {
      success: false,
      message: '缺少活动ID'
    }
  }

  try {
    let successCount = 0

    for (const activityId of activityIds) {
      try {
        if (DEDUPED_EVENT_TYPES[eventType]) {
          const existedRes = await db.collection('activity_events').where({
            activityId,
            openid,
            eventType
          }).limit(1).get()

          if ((existedRes.data || []).length) {
            successCount += 1
            continue
          }
        }

        await db.collection('activity_events').add({
          data: {
            activityId,
            openid,
            eventType,
            createdAt: new Date()
          }
        })

        successCount += 1
      } catch (singleError) {
        console.error('report single activity event error:', singleError)
      }
    }

    if (!successCount) {
      return {
        success: false,
        message: '记录活动事件失败'
      }
    }

    return {
      success: true,
      count: successCount
    }
  } catch (error) {
    return {
      success: false,
      message: '记录活动事件失败',
      error: error.message || error
    }
  }
}
