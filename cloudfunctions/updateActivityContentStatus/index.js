const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function canManageActivityContent(userRecord) {
  return !!(
    userRecord
    && userRecord.status === 'approved'
    && (userRecord.superAdmin === true || userRecord.activityPermission === true)
  )
}

function resolveCollectionName(recordType) {
  if (recordType === 'life') {
    return 'life_shares'
  }

  if (recordType === 'reward') {
    return 'reward_shares'
  }

  return 'reading_logs'
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const recordId = normalizeText(event.recordId)
  const recordType = normalizeText(event.recordType || 'reading')
  const activityId = normalizeText(event.activityId)
  const reviewStatusInput = normalizeText(event.reviewStatus)
  const hasReviewStatus = reviewStatusInput === 'normal' || reviewStatusInput === 'blocked'
  const hasFeaturedFlag = typeof event.isFeatured === 'boolean'

  if (!recordId) {
    return {
      success: false,
      message: '缺少内容记录'
    }
  }

  if (!hasReviewStatus && !hasFeaturedFlag) {
    return {
      success: false,
      message: '缺少状态更新参数'
    }
  }

  try {
    const userRes = await db.collection('users').where({ openid }).limit(1).get()
    const userRecord = (userRes.data || [])[0] || null

    if (!canManageActivityContent(userRecord)) {
      return {
        success: false,
        message: '当前账号没有活动内容管理权限'
      }
    }

    const collectionName = resolveCollectionName(recordType)
    const recordRes = await db.collection(collectionName).doc(recordId).get().catch(() => ({ data: null }))
    const record = recordRes.data || null

    if (!record) {
      return {
        success: false,
        message: '当前内容不存在'
      }
    }

    if (activityId && normalizeText(record.activityId) !== activityId) {
      return {
        success: false,
        message: '当前内容不属于该活动'
      }
    }

    const currentReviewStatus = normalizeText(record.reviewStatus) === 'blocked' ? 'blocked' : 'normal'
    const nextReviewStatus = hasReviewStatus ? reviewStatusInput : currentReviewStatus
    const nextIsFeatured = nextReviewStatus === 'blocked'
      ? false
      : (hasFeaturedFlag ? !!event.isFeatured : !!record.isFeatured)
    const now = new Date()

    await db.collection(collectionName).doc(recordId).update({
      data: {
        reviewStatus: nextReviewStatus,
        isFeatured: nextIsFeatured,
        reviewedAt: now,
        reviewedBy: openid,
        featuredAt: nextIsFeatured ? now : null
      }
    })

    return {
      success: true,
      recordId,
      recordType,
      reviewStatus: nextReviewStatus,
      isFeatured: nextIsFeatured
    }
  } catch (error) {
    return {
      success: false,
      message: '内容状态更新失败',
      error: error.message || error
    }
  }
}
