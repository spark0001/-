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

function toTimestamp(value) {
  if (!value) {
    return 0
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 0
  }

  return date.getTime()
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

function isDocumentNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_RECORD_NOT_EXIST') !== -1
    || message.indexOf('cannot find document with _id') !== -1
    || message.indexOf('document.get:fail') !== -1
}

async function getDocumentOrNull(collectionName, docId) {
  if (!docId) {
    return null
  }

  try {
    const res = await db.collection(collectionName).doc(docId).get()
    return res.data || null
  } catch (error) {
    if (isDocumentNotExistError(error) || isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

async function getLegacyLatestNoticeRecord() {
  const _ = db.command

  try {
    const latestRes = await db.collection('notices')
      .where({
        isLatest: true
      })
      .orderBy('updatedAt', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()

    const latestRecord = (latestRes.data || [])[0] || null

    if (latestRecord) {
      return latestRecord
    }

    const fallbackRes = await db.collection('notices')
      .where({
        isLatest: _.exists(false)
      })
      .orderBy('updatedAt', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()

    return (fallbackRes.data || [])[0] || null
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

async function getLatestNoticeRecord() {
  const stateRecord = await getDocumentOrNull(NOTICE_META_COLLECTION, LATEST_NOTICE_STATE_DOC_ID)
  const latestNoticeDocId = normalizeText(stateRecord && stateRecord.latestNoticeDocId)

  if (latestNoticeDocId) {
    const latestNoticeRecord = await getDocumentOrNull('notices', latestNoticeDocId)

    if (latestNoticeRecord) {
      return latestNoticeRecord
    }
  }

  return getLegacyLatestNoticeRecord()
}

async function hasReadNotice(openid, noticeId) {
  if (!openid || !noticeId) {
    return false
  }

  try {
    const res = await db.collection('notice_reads')
      .where({
        openid,
        noticeId
      })
      .limit(1)
      .get()

    return !!((res.data || [])[0])
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return false
    }

    throw error
  }
}

exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext()
    const noticeRecord = await getLatestNoticeRecord()

    if (!noticeRecord || noticeRecord.isActive === false) {
      return {
        success: true,
        notice: null,
        hasRead: false
      }
    }

    const noticeId = normalizeText(noticeRecord.noticeId || noticeRecord._id)
    const hasRead = await hasReadNotice(OPENID, noticeId)

    return {
      success: true,
      notice: {
        noticeId,
        title: noticeRecord.title || '',
        content: noticeRecord.content || '',
        updatedAt: toTimestamp(noticeRecord.updatedAt),
        isActive: noticeRecord.isActive !== false,
        isLatest: true
      },
      hasRead
    }
  } catch (error) {
    return {
      success: false,
      message: '获取公告失败',
      error: error.message || error
    }
  }
}
