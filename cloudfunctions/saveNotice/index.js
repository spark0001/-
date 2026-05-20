const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const NOTICE_META_COLLECTION = 'notice_meta'
const LATEST_NOTICE_STATE_DOC_ID = 'latest_notice_state'

function normalizeText(value) {
  return String(value || '').trim()
}

function isTransactionConflictError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('TransactionConflict') !== -1
    || message.indexOf('DATABASE_TRANSACTION_CONFLICT') !== -1
    || message.indexOf('resource system error') !== -1
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function runTransactionWithRetry(executor, maxRetryCount = 3) {
  let lastError = null

  for (let attempt = 0; attempt < maxRetryCount; attempt += 1) {
    try {
      return await db.runTransaction(executor)
    } catch (error) {
      lastError = error

      if (!isTransactionConflictError(error) || attempt === (maxRetryCount - 1)) {
        throw error
      }

      await wait(80 * (attempt + 1))
    }
  }

  throw lastError || new Error('事务执行失败')
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.add:fail -502005') !== -1
}

function isDocumentNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_RECORD_NOT_EXIST') !== -1
    || message.indexOf('cannot find document with _id') !== -1
    || message.indexOf('document.get:fail') !== -1
}

async function ensureCollection(collectionName) {
  if (!db || typeof db.createCollection !== 'function') {
    return
  }

  try {
    await db.createCollection(collectionName)
  } catch (error) {
    if (!isCollectionAlreadyExistError(error)) {
      throw error
    }
  }
}

async function getDocumentOrNull(source, collectionName, docId) {
  if (!docId) {
    return null
  }

  try {
    const res = await source.collection(collectionName).doc(docId).get()
    return res.data || null
  } catch (error) {
    if (isDocumentNotExistError(error) || isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

async function getUserRecord(openid) {
  const res = await db.collection('users')
    .where({
      openid
    })
    .limit(1)
    .get()

  return (res.data || [])[0] || null
}

function buildNoticeId() {
  return `notice-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const userRecord = await getUserRecord(OPENID)

    if (!userRecord || userRecord.superAdmin !== true) {
      return {
        success: false,
        message: '当前账号没有公告管理权限'
      }
    }

    const title = normalizeText(event.title)
    const content = normalizeText(event.content)
    const isActive = event.isActive !== false

    if (!title) {
      return {
        success: false,
        message: '请填写公告标题'
      }
    }

    if (!content) {
      return {
        success: false,
        message: '请填写公告正文'
      }
    }

    const now = new Date()
    const noticeId = buildNoticeId()
    const data = {
      _id: noticeId,
      noticeId,
      title,
      content,
      isActive,
      isLatest: true,
      updatedAt: now,
      createdAt: now,
      updatedBy: OPENID
    }

    await Promise.all([
      ensureCollection('notices'),
      ensureCollection(NOTICE_META_COLLECTION)
    ])

    await runTransactionWithRetry(async (transaction) => {
      const stateRecord = await getDocumentOrNull(transaction, NOTICE_META_COLLECTION, LATEST_NOTICE_STATE_DOC_ID)
      const previousLatestDocId = normalizeText(stateRecord && stateRecord.latestNoticeDocId)

      if (previousLatestDocId && previousLatestDocId !== noticeId) {
        const previousLatestRecord = await getDocumentOrNull(transaction, 'notices', previousLatestDocId)

        if (previousLatestRecord) {
          await transaction.collection('notices').doc(previousLatestDocId).update({
            data: {
              isLatest: false
            }
          })
        }
      }

      await transaction.collection('notices').add({
        data
      })

      await transaction.collection(NOTICE_META_COLLECTION).doc(LATEST_NOTICE_STATE_DOC_ID).set({
        data: {
          latestNoticeId: noticeId,
          latestNoticeDocId: noticeId,
          reconcileToken: '',
          createdAt: stateRecord && stateRecord.createdAt ? stateRecord.createdAt : now,
          updatedAt: now,
          updatedBy: OPENID
        }
      })
    })

    return {
      success: true,
      message: '公告保存成功'
    }
  } catch (error) {
    return {
      success: false,
      message: '保存公告失败',
      error: error.message || error
    }
  }
}
