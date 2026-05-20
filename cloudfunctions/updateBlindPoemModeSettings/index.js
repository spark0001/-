const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ALLOWED_MODES = {
  A: true,
  B: true,
  C: true
}

const DEFAULT_MODE_STATUS = {
  A: true,
  B: true,
  C: true
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
    || message.indexOf('already exists') !== -1
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
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

async function getAllRecords(collectionName, whereData) {
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

async function getManagerUserRecord(openid) {
  const userList = await getAllRecords('users', {
    openid
  })

  return (userList || [])[0] || null
}

async function ensureModeSettingRecord() {
  const list = await getAllRecords('blind_poem_settings', {
    settingKey: 'mode_status'
  })

  if (list.length) {
    return list[0]
  }

  const now = new Date()
  const addRes = await db.collection('blind_poem_settings').add({
    data: {
      settingKey: 'mode_status',
      modeStatus: DEFAULT_MODE_STATUS,
      createdAt: now,
      updatedAt: now
    }
  })

  return {
    _id: addRes._id || '',
    settingKey: 'mode_status',
    modeStatus: DEFAULT_MODE_STATUS
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const mode = normalizeText(event.mode).toUpperCase()
  const enabled = event.enabled !== false

  if (!ALLOWED_MODES[mode]) {
    return {
      success: false,
      message: '当前模式不支持'
    }
  }

  try {
    const userRecord = await getManagerUserRecord(openid)

    if (!canManageBlindPoem(userRecord)) {
      return {
        success: false,
        message: '当前账号没有双盲作诗管理权限'
      }
    }

    await ensureCollection('blind_poem_settings')

    const record = await ensureModeSettingRecord()
    const modeStatus = record && record.modeStatus && typeof record.modeStatus === 'object'
      ? record.modeStatus
      : DEFAULT_MODE_STATUS
    const nextModeStatus = {
      A: modeStatus.A !== false,
      B: modeStatus.B !== false,
      C: modeStatus.C !== false,
      [mode]: enabled
    }

    await db.collection('blind_poem_settings').doc(record._id).update({
      data: {
        modeStatus: nextModeStatus,
        updatedAt: new Date()
      }
    })

    return {
      success: true,
      modeStatus: nextModeStatus
    }
  } catch (error) {
    return {
      success: false,
      message: '模式状态保存失败',
      error: error.message || error
    }
  }
}
