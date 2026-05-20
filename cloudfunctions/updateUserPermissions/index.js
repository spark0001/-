const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ALLOWED_ROLES = {
  guest: true,
  member: true,
  admin: true
}

function normalizeText(value) {
  return String(value || '').trim()
}

function hasAnyManagePermission(permissionInfo) {
  const safePermissionInfo = permissionInfo || {}

  return safePermissionInfo.superAdmin === true
    || safePermissionInfo.applicationReviewPermission === true
    || safePermissionInfo.dataPermission === true
    || safePermissionInfo.activityPermission === true
    || safePermissionInfo.rewardPermission === true
    || safePermissionInfo.bookRecommendationPermission === true
    || safePermissionInfo.posterManagePermission === true
}

async function assertSuperAdmin(openid) {
  const userRes = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()

  const userRecord = (userRes.data && userRes.data[0]) || null

  if (!userRecord || userRecord.superAdmin !== true) {
    throw new Error('当前账号没有超级管理员权限')
  }

  return userRecord
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const targetOpenid = normalizeText(event.targetOpenid)
  const role = normalizeText(event.role)
  const superAdmin = event.superAdmin === true
  const applicationReviewPermission = event.applicationReviewPermission === true
  const dataPermission = event.dataPermission === true
  const activityPermission = event.activityPermission === true
  const rewardPermission = event.rewardPermission === true
  const bookRecommendationPermission = event.bookRecommendationPermission === true
  const posterManagePermission = event.posterManagePermission === true

  if (!targetOpenid) {
    return {
      success: false,
      message: '缺少目标用户'
    }
  }

  if (!ALLOWED_ROLES[role]) {
    return {
      success: false,
      message: '角色设置不合法'
    }
  }

  try {
    await assertSuperAdmin(openid)

    const userRes = await db.collection('users')
      .where({
        openid: targetOpenid
      })
      .limit(1)
      .get()

    const targetUser = (userRes.data && userRes.data[0]) || null

    if (!targetUser) {
      return {
        success: false,
        message: '目标用户不存在'
      }
    }

    const permissionInfo = {
      superAdmin,
      applicationReviewPermission,
      dataPermission,
      activityPermission,
      rewardPermission,
      bookRecommendationPermission,
      posterManagePermission
    }
    const nextRole = hasAnyManagePermission(permissionInfo) ? 'admin' : role

    await db.collection('users').doc(targetUser._id).update({
      data: {
        role: nextRole,
        superAdmin,
        applicationReviewPermission,
        dataPermission,
        activityPermission,
        rewardPermission,
        bookRecommendationPermission,
        posterManagePermission,
        updatedAt: new Date()
      }
    })

    return {
      success: true,
      message: '权限更新成功'
    }
  } catch (error) {
    return {
      success: false,
      message: error.message || '更新权限失败',
      error: error.message || error
    }
  }
}
