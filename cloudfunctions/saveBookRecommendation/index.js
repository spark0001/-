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

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
    || message.indexOf('already exists') !== -1
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

function normalizeArticleUrl(url) {
  const safeUrl = normalizeText(url)

  if (!/^https?:\/\//i.test(safeUrl)) {
    return safeUrl
  }

  if (safeUrl.indexOf('mp.weixin.qq.com/') === -1) {
    return safeUrl
  }

  if (safeUrl.indexOf('#wechat_redirect') !== -1) {
    return safeUrl
  }

  return `${safeUrl}#wechat_redirect`
}

async function getUserRecord(openid) {
  const userRes = await db.collection('users')
    .where({ openid })
    .field({
      role: true,
      status: true,
      superAdmin: true,
      bookRecommendationPermission: true
    })
    .limit(1)
    .get()

  return (userRes.data && userRes.data[0]) || null
}

async function assertBookRecommendationPermission(openid) {
  const userRecord = await getUserRecord(openid)

  if (!hasBookRecommendationManagePermission(userRecord)) {
    throw new Error('当前账号没有图书推荐管理权限')
  }

  return userRecord
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const recommendationId = normalizeText(event.recommendationId || event._id)
  const title = normalizeText(event.title)
  const summary = normalizeText(event.summary)
  const coverUrl = normalizeText(event.coverUrl)
  const articleUrl = normalizeArticleUrl(event.articleUrl)

  if (!title) {
    return {
      success: false,
      message: '请填写推荐标题'
    }
  }

  if (!summary) {
    return {
      success: false,
      message: '请填写推荐简介'
    }
  }

  if (!/^https?:\/\//i.test(articleUrl)) {
    return {
      success: false,
      message: '请填写有效的公众号文章链接'
    }
  }

  try {
    await assertBookRecommendationPermission(wxContext.OPENID)

    const payload = {
      title,
      summary,
      coverUrl,
      articleUrl,
      updatedBy: wxContext.OPENID,
      updatedAt: new Date()
    }

    await ensureCollection('book_recommendations')

    if (recommendationId) {
      await db.collection('book_recommendations').doc(recommendationId).update({
        data: payload
      })

      return {
        success: true,
        recommendationId
      }
    }

    const addRes = await db.collection('book_recommendations').add({
      data: {
        ...payload,
        createdAt: new Date()
      }
    })

    return {
      success: true,
      recommendationId: addRes._id || ''
    }
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      try {
        await ensureCollection('book_recommendations')

        if (recommendationId) {
          await db.collection('book_recommendations').doc(recommendationId).update({
            data: {
              title,
              summary,
              coverUrl,
              articleUrl,
              updatedBy: wxContext.OPENID,
              updatedAt: new Date()
            }
          })

          return {
            success: true,
            recommendationId
          }
        }

        const addRes = await db.collection('book_recommendations').add({
          data: {
            title,
            summary,
            coverUrl,
            articleUrl,
            updatedBy: wxContext.OPENID,
            updatedAt: new Date(),
            createdAt: new Date()
          }
        })

        return {
          success: true,
          recommendationId: addRes._id || ''
        }
      } catch (retryError) {
        return {
          success: false,
          message: '保存图书推荐失败',
          error: retryError.message || retryError
        }
      }
    }

    return {
      success: false,
      message: '保存图书推荐失败',
      error: error.message || error
    }
  }
}
