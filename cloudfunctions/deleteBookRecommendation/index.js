const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function hasBookRecommendationManagePermission(userRecord) {
  return !!(
    userRecord
    && userRecord.bookRecommendationPermission === true
    && (
      userRecord.superAdmin === true
      || (userRecord.role === 'admin' && userRecord.status === 'approved')
    )
  )
}

async function getUserRecord(openid) {
  const userRes = await db.collection('users')
    .where({ openid })
    .field({
      role: true,
      status: true,
      superAdmin: true,
      bookRecommendationPermission: true
    })
    .limit(1)
    .get()

  return (userRes.data && userRes.data[0]) || null
}

async function assertBookRecommendationPermission(openid) {
  const userRecord = await getUserRecord(openid)

  if (!hasBookRecommendationManagePermission(userRecord)) {
    throw new Error('当前账号没有图书推荐管理权限')
  }

  return userRecord
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const recommendationId = normalizeText(event.recommendationId || event._id)

  if (!recommendationId) {
    return {
      success: false,
      message: '缺少推荐记录ID'
    }
  }

  try {
    await assertBookRecommendationPermission(wxContext.OPENID)
    await db.collection('book_recommendations').doc(recommendationId).remove()

    return {
      success: true
    }
  } catch (error) {
    return {
      success: false,
      message: '删除图书推荐失败',
      error: error.message || error
    }
  }
}
