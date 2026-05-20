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

function getRewardPermission(userRecord) {
  if (typeof (userRecord && userRecord.rewardPermission) === 'boolean') {
    return userRecord.rewardPermission
  }

  if (userRecord && userRecord.superAdmin === true) {
    return true
  }

  return typeof (userRecord && userRecord.activityPermission) === 'boolean'
    ? userRecord.activityPermission
    : false
}

function getBookRecommendationPermission(userRecord) {
  return typeof (userRecord && userRecord.bookRecommendationPermission) === 'boolean'
    ? userRecord.bookRecommendationPermission
    : false
}

function getApplicationReviewPermission(userRecord) {
  if (typeof (userRecord && userRecord.applicationReviewPermission) === 'boolean') {
    return userRecord.applicationReviewPermission
  }

  return !!(userRecord && userRecord.role === 'admin' && userRecord.status === 'approved')
}

function hasAnyManagePermission(userRecord, permissionInfo) {
  const safePermissionInfo = permissionInfo || {}

  return safePermissionInfo.superAdmin === true
    || safePermissionInfo.applicationReviewPermission === true
    || safePermissionInfo.dataPermission === true
    || safePermissionInfo.activityPermission === true
    || safePermissionInfo.rewardPermission === true
    || safePermissionInfo.bookRecommendationPermission === true
    || safePermissionInfo.posterManagePermission === true
    || !!(userRecord && userRecord.role === 'admin')
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

async function getAllRecords(collectionName) {
  const pageSize = 100
  let skip = 0
  let records = []

  while (true) {
    const res = await db.collection(collectionName)
      .skip(skip)
      .limit(pageSize)
      .get()

    const currentBatch = res.data || []

    records = records.concat(currentBatch)

    if (currentBatch.length < pageSize) {
      break
    }

    skip += currentBatch.length
  }

  return records
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    await assertSuperAdmin(openid)

    const [userList, applicationList] = await Promise.all([
      getAllRecords('users'),
      getAllRecords('applications')
    ])

    const latestApplicationMap = {}

    ;(applicationList || []).forEach((item) => {
      const current = latestApplicationMap[item.openid]

      if (!current || (toTimestamp(item.createdAt) || 0) > (toTimestamp(current.createdAt) || 0)) {
        latestApplicationMap[item.openid] = item
      }
    })

    const list = (userList || [])
      .slice()
      .sort((a, b) => {
        return (toTimestamp(b.createdAt) || 0) - (toTimestamp(a.createdAt) || 0)
      })
      .map((item) => {
        const latestApplication = latestApplicationMap[item.openid] || null
        const superAdmin = item.superAdmin === true
        const applicationReviewPermission = getApplicationReviewPermission(item)
        const dataPermission = item.dataPermission === true
        const activityPermission = item.activityPermission === true
        const rewardPermission = getRewardPermission(item)
        const bookRecommendationPermission = getBookRecommendationPermission(item)
        const posterManagePermission = item.posterManagePermission === true
        const permissionInfo = {
          superAdmin,
          applicationReviewPermission,
          dataPermission,
          activityPermission,
          rewardPermission,
          bookRecommendationPermission,
          posterManagePermission
        }
        const resolvedRole = hasAnyManagePermission(item, permissionInfo) ? 'admin' : (item.role || 'guest')

        return {
          _id: item._id,
          openid: item.openid || '',
          nickName: item.nickName || '',
          avatarUrl: item.avatarUrl || '',
          applyName: latestApplication ? latestApplication.name || '' : '',
          role: resolvedRole,
          status: item.status || '',
          superAdmin,
          applicationReviewPermission,
          dataPermission,
          activityPermission,
          rewardPermission,
          bookRecommendationPermission,
          posterManagePermission,
          createdAt: toTimestamp(item.createdAt),
          updatedAt: toTimestamp(item.updatedAt)
        }
      })
      .filter((item) => {
        return item.status === 'approved' && (item.role === 'member' || item.role === 'admin')
      })

    return {
      success: true,
      list
    }
  } catch (error) {
    return {
      success: false,
      message: error.message || '获取用户权限列表失败',
      error: error.message || error
    }
  }
}
