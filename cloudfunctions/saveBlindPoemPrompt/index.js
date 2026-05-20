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

function parseImagery(value) {
  return normalizeText(value)
    .split(/[\n,，/]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const promptId = normalizeText(event.promptId)
  const mode = normalizeText(event.mode).toUpperCase()
  const title = normalizeText(event.title)
  const promptText = normalizeText(event.promptText)
  const theme = normalizeText(event.theme)
  const imagery = parseImagery(event.imageryText)
  const sort = Number(event.sort) || 0
  const status = normalizeText(event.status) === 'disabled' ? 'disabled' : 'enabled'

  if (!ALLOWED_MODES[mode]) {
    return {
      success: false,
      message: '当前模式不支持'
    }
  }

  if (!promptText) {
    return {
      success: false,
      message: '请先填写题面说明'
    }
  }

  if (mode === 'C' && !theme) {
    return {
      success: false,
      message: '模式C请填写主题'
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

    await ensureCollection('blind_poem_prompts')

    const now = new Date()
    const payload = {
      mode,
      title: title || (mode === 'C' ? '同题异写' : '双盲作诗题面'),
      promptText,
      theme: mode === 'C' ? theme : '',
      imagery,
      status,
      sort,
      updatedAt: now
    }

    if (promptId) {
      await db.collection('blind_poem_prompts').doc(promptId).update({
        data: payload
      })
    } else {
      await db.collection('blind_poem_prompts').add({
        data: {
          ...payload,
          createdAt: now
        }
      })
    }

    return {
      success: true
    }
  } catch (error) {
    return {
      success: false,
      message: '题面保存失败',
      error: error.message || error
    }
  }
}
