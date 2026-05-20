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

exports.main = async () => {
  try {
    const recommendation = await getLatestRecommendation()

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
      } : null
    }
  } catch (error) {
    return {
      success: false,
      message: '获取图书推荐失败',
      error: error.message || error
    }
  }
}
