const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
    || message.indexOf('collection.add:fail -502005') !== -1
}

async function ensureCollection(collectionName) {
  try {
    await db.createCollection(collectionName)
  } catch (error) {
    if (!isCollectionAlreadyExistError(error)) {
      throw error
    }
  }
}

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const noticeId = normalizeText(event.noticeId)

    if (!noticeId) {
      return {
        success: false,
        message: 'noticeId 缺失'
      }
    }

    let existedRecord = null

    try {
      const existedRes = await db.collection('notice_reads')
        .where({
          openid: OPENID,
          noticeId
        })
        .limit(1)
        .get()

      existedRecord = (existedRes.data || [])[0] || null
    } catch (error) {
      if (!isCollectionNotExistError(error)) {
        throw error
      }
    }

    if (existedRecord) {
      return {
        success: true,
        message: '公告已读状态已记录'
      }
    }

    const data = {
      openid: OPENID,
      noticeId,
      readAt: new Date()
    }

    try {
      await db.collection('notice_reads').add({
        data
      })
    } catch (error) {
      if (!isCollectionNotExistError(error)) {
        throw error
      }

      await ensureCollection('notice_reads')
      await db.collection('notice_reads').add({
        data
      })
    }

    return {
      success: true,
      message: '公告已读状态记录成功'
    }
  } catch (error) {
    return {
      success: false,
      message: '记录公告已读失败',
      error: error.message || error
    }
  }
}
