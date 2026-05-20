const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const recordId = normalizeText(event.recordId)
  const title = normalizeText(event.title)
  const content = normalizeText(event.content)
  const activityId = normalizeText(event.activityId)
  const activityTitle = normalizeText(event.activityTitle)
  const images = Array.isArray(event.images)
    ? event.images.map((item) => normalizeText(item)).filter(Boolean)
    : []

  if (!recordId) {
    return {
      success: false,
      message: '缺少要编辑的生活分享'
    }
  }

  if (!content) {
    return {
      success: false,
      message: '分享内容不能为空'
    }
  }

  try {
    const recordRes = await db.collection('life_shares').doc(recordId).get().catch(() => ({ data: null }))
    const record = recordRes.data || null

    if (!record || normalizeText(record.openid) !== openid) {
      return {
        success: false,
        message: '生活分享不存在或无权编辑'
      }
    }

    if (activityId) {
      const activityRes = await db.collection('activities').doc(activityId).get().catch(() => ({ data: null }))
      const activity = activityRes.data || null

      if (!activity) {
        return {
          success: false,
          message: '关联活动不存在'
        }
      }

      if (normalizeActivityType(activity.activityType) === 'rewardClaim') {
        return {
          success: false,
          message: '奖励领取活动不能关联生活分享'
        }
      }
    }

    await db.collection('life_shares').doc(recordId).update({
      data: {
        title,
        content,
        images,
        activityId,
        activityTitle: activityId ? activityTitle : '',
        updatedAt: new Date()
      }
    })

    return {
      success: true,
      message: '生活分享修改成功',
      lifeShareId: recordId,
      createdAt: record.createdAt || null
    }
  } catch (error) {
    return {
      success: false,
      message: '生活分享修改失败',
      error: error.message || error
    }
  }
}
