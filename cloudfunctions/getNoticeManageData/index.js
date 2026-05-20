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

async function getUserRecord(openid) {
  const res = await db.collection('users')
    .where({
      openid
    })
    .limit(1)
    .get()

  return (res.data || [])[0] || null
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

async function getNoticeList() {
  try {
    const res = await db.collection('notices')
      .orderBy('updatedAt', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()

    return res.data || []
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  }
}

exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext()
    const userRecord = await getUserRecord(OPENID)

    if (!userRecord || userRecord.superAdmin !== true) {
      return {
        success: false,
        message: '当前账号没有公告管理权限'
      }
    }

    const [noticeRecord, noticeList] = await Promise.all([
      getLatestNoticeRecord(),
      getNoticeList()
    ])
    const latestNoticeDocId = normalizeText(noticeRecord && noticeRecord._id)

    return {
      success: true,
      notice: noticeRecord ? {
        noticeId: normalizeText(noticeRecord.noticeId || noticeRecord._id),
        title: noticeRecord.title || '',
        content: noticeRecord.content || '',
        updatedAt: toTimestamp(noticeRecord.updatedAt),
        isActive: noticeRecord.isActive !== false,
        isLatest: true
      } : null,
      noticeList: noticeList.map((item) => ({
        noticeId: normalizeText(item.noticeId || item._id),
        title: item.title || '',
        content: item.content || '',
        updatedAt: toTimestamp(item.updatedAt),
        isActive: item.isActive !== false,
        isLatest: normalizeText(item && item._id) === latestNoticeDocId
      }))
    }
  } catch (error) {
    return {
      success: false,
      message: '获取公告管理数据失败',
      error: error.message || error
    }
  }
}
