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

async function getRecommendationList() {
  try {
    const pageSize = 100
    let skip = 0
    let list = []

    while (true) {
      const res = await db.collection('book_recommendations')
        .field({
          title: true,
          summary: true,
          coverUrl: true,
          articleUrl: true,
          updatedAt: true,
          createdAt: true
        })
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

async function getUserRecord(openid) {
  if (!openid) {
    return null
  }

  try {
    const res = await db.collection('users')
      .where({
        openid
      })
      .field({
        role: true,
        status: true,
        superAdmin: true,
        bookRecommendationPermission: true
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

exports.main = async () => {
  try {
    const wxContext = cloud.getWXContext()
    const [recommendationList, userRecord] = await Promise.all([
      getRecommendationList(),
      getUserRecord(wxContext.OPENID)
    ])
    const currentRecommendation = recommendationList[0] || null
    const canManage = hasBookRecommendationManagePermission(userRecord)

    return {
      success: true,
      canManage,
      currentRecommendationId: currentRecommendation && currentRecommendation._id ? currentRecommendation._id : '',
      list: (recommendationList || []).map((item) => ({
        _id: item._id,
        title: item.title || '',
        summary: item.summary || '',
        coverUrl: item.coverUrl || '',
        articleUrl: item.articleUrl || '',
        updatedAt: toTimestamp(item.updatedAt),
        createdAt: toTimestamp(item.createdAt)
      }))
    }
  } catch (error) {
    return {
      success: false,
      message: '获取图书推荐列表失败',
      error: error.message || error
    }
  }
}
