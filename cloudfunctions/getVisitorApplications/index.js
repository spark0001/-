const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

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

async function assertSuperAdminPermission(openid) {
  const userRes = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()

  const userRecord = (userRes.data && userRes.data[0]) || null

  if (!userRecord || userRecord.superAdmin !== true) {
    throw new Error('当前账号没有外来访客申请查看权限')
  }

  return userRecord
}

function getStatusText(status) {
  if (status === 'approved') {
    return '已通过'
  }

  if (status === 'rejected') {
    return '已拒绝'
  }

  return '待处理'
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    await assertSuperAdminPermission(openid)

    const res = await db.collection('visitor_applications')
      .orderBy('createdAt', 'desc')
      .get()
      .catch((error) => {
        const message = String((error && (error.message || error.errMsg || error.error || error.code || error)) || '')

        if (message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1) {
          return { data: [] }
        }

        throw error
      })

    return {
      success: true,
      list: (res.data || []).map((item) => {
        return {
          _id: item._id || '',
          openid: item.openid || '',
          name: item.name || '',
          gradeMajor: item.gradeMajor || '',
          reason: item.reason || '',
          contact: item.contact || '',
          status: item.status || 'pending',
          statusText: getStatusText(item.status),
          canApprove: item.status !== 'approved',
          createdAt: toTimestamp(item.createdAt)
        }
      })
    }
  } catch (error) {
    return {
      success: false,
      message: error.message || '获取外来访客申请失败',
      error: error.message || error
    }
  }
}
