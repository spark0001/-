const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const avatarUrl = normalizeText(event.avatarUrl)

  if (!avatarUrl) {
    return {
      success: false,
      message: '头像地址不能为空'
    }
  }

  try {
    const userRes = await db.collection('users')
      .where({ openid })
      .limit(1)
      .get()

    const userRecord = (userRes.data && userRes.data[0]) || null

    if (!userRecord) {
      return {
        success: false,
        message: '当前账号暂未建立用户资料'
      }
    }

    await db.collection('users').doc(userRecord._id).update({
      data: {
        avatarUrl,
        updatedAt: new Date()
      }
    })

    return {
      success: true,
      message: '头像已更新',
      avatarUrl
    }
  } catch (error) {
    return {
      success: false,
      message: '头像更新失败',
      error: error.message || error
    }
  }
}
