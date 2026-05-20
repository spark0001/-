const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

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

function sortByCreatedAtDesc(list) {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => {
    return (toTimestamp(b && b.createdAt) || 0) - (toTimestamp(a && a.createdAt) || 0)
  })
}

function getPriorityUserRecord(userList) {
  return (Array.isArray(userList) ? userList : [])
    .slice()
    .sort((a, b) => {
      const statusScoreA = a && a.status === 'approved' ? 2 : (a && a.status === 'pending' ? 1 : 0)
      const statusScoreB = b && b.status === 'approved' ? 2 : (b && b.status === 'pending' ? 1 : 0)

      if (statusScoreB !== statusScoreA) {
        return statusScoreB - statusScoreA
      }

      const updatedAtA = toTimestamp(a && a.updatedAt) || 0
      const updatedAtB = toTimestamp(b && b.updatedAt) || 0

      if (updatedAtB !== updatedAtA) {
        return updatedAtB - updatedAtA
      }

      return (toTimestamp(b && b.createdAt) || 0) - (toTimestamp(a && a.createdAt) || 0)
    })[0] || null
}

function resolveUserProfileField(userRecord, latestApplication, fieldName) {
  const userValue = normalizeText(userRecord && userRecord[fieldName])
  const applicationValue = normalizeText(latestApplication && latestApplication[fieldName])

  return userValue || applicationValue
}

async function getAllRecords(collectionName, whereData) {
  const pageSize = 50
  let skip = 0
  let records = []

  while (true) {
    let query = db.collection(collectionName)

    if (whereData && Object.keys(whereData).length) {
      query = query.where(whereData)
    }

    const res = await query
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
    const [userList, applicationList, visitorApplicationList] = await Promise.all([
      getAllRecords('users', { openid }),
      getAllRecords('applications', { openid }),
      getAllRecords('visitor_applications', { openid }).catch(() => [])
    ])

    const latestMemberApplication = sortByCreatedAtDesc(applicationList)[0] || null
    const latestVisitorApplication = sortByCreatedAtDesc(visitorApplicationList)[0] || null
    const latestApplication = latestMemberApplication || latestVisitorApplication || null
    const userRecord = getPriorityUserRecord(userList)

    return {
      success: true,
      userInfo: {
        hasUserRecord: !!userRecord,
        status: normalizeText(userRecord && userRecord.status),
        name: resolveUserProfileField(userRecord, latestApplication, 'name'),
        contact: resolveUserProfileField(userRecord, latestApplication, 'contact'),
        gradeMajor: resolveUserProfileField(userRecord, latestApplication, 'gradeMajor'),
        birthday: normalizeText(userRecord && userRecord.birthday),
        signature: normalizeText(userRecord && userRecord.signature),
        profileSupplementPrompted: !!(userRecord && userRecord.profileSupplementPrompted === true)
      },
      applicationInfo: latestApplication ? {
        hasApplication: true,
        applicationType: latestMemberApplication ? 'member' : 'visitor',
        status: normalizeText(latestApplication.status),
        name: normalizeText(latestApplication.name),
        gradeMajor: normalizeText(latestApplication.gradeMajor),
        reason: normalizeText(latestApplication.reason),
        contact: normalizeText(latestApplication.contact),
        reviewedBy: normalizeText(latestApplication.reviewedBy),
        reviewedAt: toTimestamp(latestApplication.reviewedAt),
        createdAt: toTimestamp(latestApplication.createdAt)
      } : {
        hasApplication: false,
        applicationType: '',
        status: '',
        name: '',
        gradeMajor: '',
        reason: '',
        contact: '',
        reviewedBy: '',
        reviewedAt: null,
        createdAt: null
      }
    }
  } catch (error) {
    console.error('getAccessStatus error:', error)
    return {
      success: false,
      message: '账号状态获取失败',
      error: error.message || error
    }
  }
}
