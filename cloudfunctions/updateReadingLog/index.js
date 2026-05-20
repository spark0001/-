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

function resolveReadingContentTitle(contentTitle, insight, excerpt) {
  const explicitTitle = normalizeText(contentTitle)
  const safeInsight = normalizeText(insight)
  const safeExcerpt = normalizeText(excerpt)

  if (explicitTitle) {
    return explicitTitle
  }

  if (safeInsight) {
    return '感悟'
  }

  if (safeExcerpt) {
    return '摘抄'
  }

  return ''
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const recordId = normalizeText(event.recordId)
  const bookTitle = normalizeText(event.bookTitle)
  const contentTitle = normalizeText(event.contentTitle)
  const author = normalizeText(event.author)
  const pagesOrChapter = normalizeText(event.pagesOrChapter)
  const insight = normalizeText(event.insight)
  const excerpt = normalizeText(event.excerpt)
  const activityId = normalizeText(event.activityId)
  const activityTitle = normalizeText(event.activityTitle)
  const images = Array.isArray(event.images)
    ? event.images.map((item) => normalizeText(item)).filter(Boolean)
    : []
  const duration = Number(event.duration)

  if (!recordId) {
    return {
      success: false,
      message: '缺少要编辑的阅读记录'
    }
  }

  if (!bookTitle) {
    return {
      success: false,
      message: '书名不能为空'
    }
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      success: false,
      message: '阅读时长必须大于0'
    }
  }

  if (!insight && !excerpt) {
    return {
      success: false,
      message: '感悟和摘抄请至少填写一项'
    }
  }

  try {
    const recordRes = await db.collection('reading_logs').doc(recordId).get().catch(() => ({ data: null }))
    const record = recordRes.data || null

    if (!record || normalizeText(record.openid) !== openid) {
      return {
        success: false,
        message: '阅读记录不存在或无权编辑'
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
          message: '奖励领取活动不能关联阅读打卡'
        }
      }
    }

    const finalContentTitle = resolveReadingContentTitle(contentTitle, insight, excerpt)

    await db.collection('reading_logs').doc(recordId).update({
      data: {
        bookTitle,
        title: finalContentTitle,
        contentTitle: finalContentTitle,
        author,
        duration,
        pagesOrChapter,
        insight,
        excerpt,
        images,
        activityId,
        activityTitle: activityId ? activityTitle : '',
        updatedAt: new Date()
      }
    })

    return {
      success: true,
      message: '阅读打卡修改成功',
      readingLogId: recordId,
      createdAt: record.createdAt || null,
      dayKey: normalizeText(record.dayKey)
    }
  } catch (error) {
    return {
      success: false,
      message: '阅读打卡修改失败',
      error: error.message || error
    }
  }
}
