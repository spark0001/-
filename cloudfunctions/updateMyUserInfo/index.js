const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function isValidBirthday(value) {
  if (!value) {
    return true
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const name = normalizeText(event.name)
  const contact = normalizeText(event.contact)
  const gradeMajor = normalizeText(event.gradeMajor)
  const birthday = normalizeText(event.birthday)
  const signature = normalizeText(event.signature)
  const markProfileSupplementPrompted = event.markProfileSupplementPrompted === true

  if (!markProfileSupplementPrompted) {
    if (!name) {
      return {
        success: false,
        message: '姓名不能为空'
      }
    }

    if (!gradeMajor) {
      return {
        success: false,
        message: '年级/专业不能为空'
      }
    }

    if (!isValidBirthday(birthday)) {
      return {
        success: false,
        message: '生日格式不正确'
      }
    }
  }

  try {
    const userRes = await db.collection('users')
      .where({ openid })
      .limit(1)
      .get()

    const userRecord = (userRes.data && userRes.data[0]) || null

    if (!userRecord || userRecord.status !== 'approved') {
      return {
        success: false,
        message: '仅已通过审核的用户可修改正式资料'
      }
    }

    const now = new Date()
    const updateData = markProfileSupplementPrompted
      ? {
        profileSupplementPrompted: true,
        profileSupplementPromptedAt: now,
        updatedAt: now
      }
      : {
        name,
        contact,
        gradeMajor,
        birthday,
        signature,
        profileSupplementPrompted: true,
        updatedAt: now
      }

    await db.collection('users').doc(userRecord._id).update({
      data: updateData
    })

    return {
      success: true,
      message: markProfileSupplementPrompted ? '已记录资料补充提醒状态' : '用户信息已更新'
    }
  } catch (error) {
    return {
      success: false,
      message: '更新用户信息失败',
      error: error.message || error
    }
  }
}
