const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const MODE_TEXT_MAP = {
  A: '模式A',
  B: '模式B',
  C: '模式C'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

async function getAllRecords(collectionName, whereData) {
  const list = []
  let skip = 0
  const pageSize = 100

  while (true) {
    try {
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
    } catch (error) {
      if (isCollectionNotExistError(error)) {
        return []
      }

      throw error
    }
  }

  return list
}

function buildPermissionInfo(userRecord) {
  return {
    dataPermission: typeof (userRecord && userRecord.dataPermission) === 'boolean'
      ? userRecord.dataPermission
      : false
  }
}

function getUniqueUserCount(list, fieldName = 'openid') {
  const userMap = {}

  ;(list || []).forEach((item) => {
    const value = normalizeText(item && item[fieldName])

    if (value) {
      userMap[value] = true
    }
  })

  return Object.keys(userMap).length
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const userRecord = (await getAllRecords('users', { openid }))[0] || null
    const permissionInfo = buildPermissionInfo(userRecord)

    if (!permissionInfo.dataPermission) {
      return {
        success: false,
        message: '当前账号无权限查看双盲作诗数据'
      }
    }

    const [eventList, answerList] = await Promise.all([
      getAllRecords('blind_poem_events'),
      getAllRecords('blind_poem_answers')
    ])
    const exposureList = (eventList || []).filter((item) => normalizeText(item && item.eventType) === 'exposure')
    const detailClickList = (eventList || []).filter((item) => normalizeText(item && item.eventType) === 'detail_click')
    const exposureUserCount = getUniqueUserCount(exposureList)
    const detailClickUserCount = getUniqueUserCount(detailClickList)
    const participantUserCount = getUniqueUserCount(answerList)
    const participationCount = (answerList || []).length
    const modeStats = ['A', 'B', 'C'].map((mode) => {
      const modeAnswers = (answerList || []).filter((item) => normalizeText(item && item.mode).toUpperCase() === mode)

      return {
        mode,
        modeText: MODE_TEXT_MAP[mode],
        participantUserCount: getUniqueUserCount(modeAnswers),
        participationCount: modeAnswers.length
      }
    })

    return {
      success: true,
      stats: {
        exposureUserCount,
        detailClickUserCount,
        participantUserCount,
        participationCount
      },
      funnelStages: [
        {
          key: 'exposureUserCount',
          label: '曝光量',
          value: exposureUserCount
        },
        {
          key: 'detailClickUserCount',
          label: '点击详情页量',
          value: detailClickUserCount
        },
        {
          key: 'participantUserCount',
          label: '参与人数',
          value: participantUserCount
        }
      ],
      modeStats
    }
  } catch (error) {
    return {
      success: false,
      message: '双盲作诗数据加载失败',
      error: error.message || error
    }
  }
}
