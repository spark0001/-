const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const JOIN_CLUB_PASSPHRASE = '我要加入读书会'

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

function normalizeText(value) {
  return String(value || '').trim()
}

function hasApplicationReviewPermission(userRecord) {
  if (!userRecord) {
    return false
  }

  if (userRecord.superAdmin === true) {
    return true
  }

  if (userRecord.status !== 'approved') {
    return false
  }

  if (typeof userRecord.applicationReviewPermission === 'boolean') {
    return userRecord.applicationReviewPermission
  }

  return userRecord.role === 'admin'
}

async function assertApplicationReviewPermission(openid) {
  const userRes = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()

  const userRecord = (userRes.data && userRes.data[0]) || null

  if (!hasApplicationReviewPermission(userRecord)) {
    throw new Error('当前账号没有成员申请审核权限')
  }

  return userRecord
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    await assertApplicationReviewPermission(openid)

    const res = await db.collection('applications')
      .where({
        status: 'pending'
      })
      .orderBy('createdAt', 'asc')
      .get()
    const reviewableList = (res.data || []).filter((item) => {
      return item && (
        item.canEnterReview === true ||
        normalizeText(item.applyPassphrase) === JOIN_CLUB_PASSPHRASE
      )
    })

    return {
      success: true,
      list: reviewableList.map((item) => {
        return {
          _id: item._id,
          openid: item.openid || '',
          name: item.name || '',
          gradeMajor: item.gradeMajor || '',
          reason: item.reason || '',
          contact: item.contact || '',
          status: item.status || 'pending',
          createdAt: toTimestamp(item.createdAt)
        }
      })
    }
  } catch (error) {
    return {
      success: false,
      message: error.message || '获取待审核申请失败',
      error: error.message || error
    }
  }
}
