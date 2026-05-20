const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ACTIVITY_COLLECTION = 'poem_pancake_activities'
const BOARD_COLLECTION = 'poem_pancake_boards'

function normalizeText(value) {
  return String(value || '').trim()
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
    || message.indexOf('already exists') !== -1
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
  const list = []
  let skip = 0
  const pageSize = 100

  while (true) {
    let query = db.collection(collectionName)

    if (whereData && Object.keys(whereData).length) {
      query = query.where(whereData)
    }

    const res = await query.skip(skip).limit(pageSize).get()
    const data = res.data || []
    list.push(...data)

    if (data.length < pageSize) {
      break
    }

    skip += data.length
  }

  return list
}

function canManagePoemPancake(userRecord) {
  return !!(userRecord && (userRecord.superAdmin || (userRecord.role === 'admin' && userRecord.status === 'approved')))
}

async function getManagerUserRecord(openid) {
  const userList = await getAllRecords('users', {
    openid
  })

  return (userList || [])[0] || null
}

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const userRecord = await getManagerUserRecord(openid)

    if (!canManagePoemPancake(userRecord)) {
      return {
        success: false,
        message: '当前账号没有诗词摊煎饼管理权限'
      }
    }

    await ensureCollection(ACTIVITY_COLLECTION)
    await ensureCollection(BOARD_COLLECTION)

    const activityId = normalizeText(event.activityId)

    if (!activityId) {
      return {
        success: false,
        message: '缺少活动信息'
      }
    }

    const activityRes = await db.collection(ACTIVITY_COLLECTION).doc(activityId).get()
    const activity = activityRes.data || null

    if (!activity) {
      return {
        success: false,
        message: '活动不存在'
      }
    }

    if (normalizeText(activity.status) !== 'draft') {
      return {
        success: false,
        message: '仅草稿活动支持删除'
      }
    }

    if ((Number(activity.filledCount) || 0) > 0 || (Number(activity.userCount) || 0) > 0) {
      return {
        success: false,
        message: '已有成员参与的活动不能删除，请改用归档'
      }
    }

    if (normalizeText(activity.boardId)) {
      await db.collection(BOARD_COLLECTION).doc(activity.boardId).remove().catch(() => null)
    }

    await db.collection(ACTIVITY_COLLECTION).doc(activityId).remove()

    return {
      success: true,
      activityId
    }
  } catch (error) {
    console.error('deletePoemPancakeActivity error:', error)
    return {
      success: false,
      message: error.message || '删除失败'
    }
  }
}
