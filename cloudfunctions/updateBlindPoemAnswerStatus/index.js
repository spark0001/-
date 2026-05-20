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

async function getRecords(collectionName, whereData) {
  try {
    let query = db.collection(collectionName)

    if (whereData && Object.keys(whereData).length) {
      query = query.where(whereData)
    }

    const res = await query.get()
    return res.data || []
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  }
}

function canManageBlindPoem(userRecord) {
  return !!(userRecord && (userRecord.superAdmin || (userRecord.role === 'admin' && userRecord.status === 'approved')))
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const answerId = normalizeText(event.answerId)
  const reviewStatusInput = normalizeText(event.reviewStatus)
  const hasReviewStatus = reviewStatusInput === 'normal' || reviewStatusInput === 'blocked'
  const hasFeaturedFlag = typeof event.isFeatured === 'boolean'

  if (!answerId) {
    return {
      success: false,
      message: '缺少作品记录'
    }
  }

  if (!hasReviewStatus && !hasFeaturedFlag) {
    return {
      success: false,
      message: '缺少状态更新参数'
    }
  }

  try {
    const userRecord = (await getRecords('users', { openid }))[0] || null

    if (!canManageBlindPoem(userRecord)) {
      return {
        success: false,
        message: '当前账号没有双盲作诗管理权限'
      }
    }

    const answerRes = await db.collection('blind_poem_answers').doc(answerId).get().catch(() => ({ data: null }))
    const answer = answerRes.data || null

    if (!answer) {
      return {
        success: false,
        message: '当前作品不存在'
      }
    }

    const nextReviewStatus = hasReviewStatus
      ? reviewStatusInput
      : (normalizeText(answer.reviewStatus) === 'blocked' ? 'blocked' : 'normal')
    const nextIsFeatured = nextReviewStatus === 'blocked'
      ? false
      : (hasFeaturedFlag ? !!event.isFeatured : !!answer.isFeatured)
    const now = new Date()

    await db.collection('blind_poem_answers').doc(answerId).update({
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
      reviewStatus: nextReviewStatus,
      isFeatured: nextIsFeatured
    }
  } catch (error) {
    return {
      success: false,
      message: '作品状态更新失败',
      error: error.message || error
    }
  }
}
