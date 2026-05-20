const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
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

    const noticeId = normalizeText(event.noticeId)
    const isActive = event.isActive === true

    if (!noticeId) {
      return {
        success: false,
        message: 'noticeId 缺失'
      }
    }

    const targetRes = await db.collection('notices')
      .where({
        noticeId
      })
      .limit(1)
      .get()

    const targetRecord = (targetRes.data || [])[0] || null

    if (!targetRecord) {
      return {
        success: false,
        message: '公告不存在'
      }
    }

    await db.collection('notices').doc(targetRecord._id).update({
      data: {
        isActive,
        updatedAt: new Date()
      }
    })

    return {
      success: true,
      message: isActive ? '公告已启用' : '公告已停用'
    }
  } catch (error) {
    return {
      success: false,
      message: '更新公告状态失败',
      error: error.message || error
    }
  }
}
