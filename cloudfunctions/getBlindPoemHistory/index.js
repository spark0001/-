const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const MODE_TEXT_MAP = {
  A: '模式A：双人各写一句',
  B: '模式B：上下句互写',
  C: '模式C：同题异写'
}

const DEFAULT_MODE_STATUS = {
  A: true,
  B: true,
  C: true
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toTimestamp(value) {
  if (!value) {
    return 0
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 0
  }

  return date.getTime()
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}`
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

async function getAllAnswersByOpenid(openid) {
  const list = []
  let skip = 0
  const pageSize = 100

  while (true) {
    try {
      const res = await db.collection('blind_poem_answers')
        .where({
          openid
        })
        .orderBy('createdAt', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()
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

async function getAllAnswers(whereData) {
  const list = []
  let skip = 0
  const pageSize = 100

  while (true) {
    try {
      let query = db.collection('blind_poem_answers')

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

async function getRoundsByIds(roundIds) {
  const safeIds = Array.isArray(roundIds) ? roundIds.filter(Boolean) : []

  if (!safeIds.length) {
    return []
  }

  try {
    const res = await db.collection('blind_poem_rounds')
      .where({
        _id: _.in(safeIds)
      })
      .get()

    return res.data || []
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  }
}

async function getModeSettingRecord() {
  try {
    const res = await db.collection('blind_poem_settings')
      .where({
        settingKey: 'mode_status'
      })
      .limit(1)
      .get()

    return (res.data || [])[0] || null
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

function getModeStatusMap(settingRecord) {
  const modeStatus = settingRecord && settingRecord.modeStatus && typeof settingRecord.modeStatus === 'object'
    ? settingRecord.modeStatus
    : {}

  return {
    A: modeStatus.A !== false,
    B: modeStatus.B !== false,
    C: modeStatus.C !== false
  }
}

function buildPromptSummary(round) {
  const mode = normalizeText(round && round.mode).toUpperCase()

  if (mode === 'C') {
    return normalizeText(round && round.theme) ? `同题：${normalizeText(round.theme)}` : normalizeText(round && round.promptText)
  }

  if (mode === 'B') {
    return normalizeText(round && round.promptTitle) || normalizeText(round && round.promptText)
  }

  return normalizeText(round && round.promptText)
}

async function getTotalParticipationCount() {
  try {
    const res = await db.collection('blind_poem_answers')
      .where({
        mode: _.in(['A', 'B', 'C'])
      })
      .count()

    return Number(res && res.total) || 0
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return 0
    }

    throw error
  }
}

function isBlockedAnswer(answer) {
  return normalizeText(answer && answer.reviewStatus) === 'blocked'
}

async function getFeaturedList() {
  const featuredAnswers = (await getAllAnswers({
    isFeatured: true
  }))
    .filter((item) => !isBlockedAnswer(item))
    .sort((a, b) => {
      return toTimestamp(b && (b.featuredAt || b.updatedAt || b.createdAt))
        - toTimestamp(a && (a.featuredAt || a.updatedAt || a.createdAt))
    })
    .slice(0, 12)
  const roundIds = featuredAnswers.map((item) => normalizeText(item && item.roundId)).filter(Boolean)
  const roundList = await getRoundsByIds(roundIds)
  const roundMap = roundList.reduce((acc, item) => {
    if (item && item._id) {
      acc[item._id] = item
    }

    return acc
  }, {})

  return featuredAnswers.map((item) => {
    const round = roundMap[normalizeText(item && item.roundId)] || {}
    const mode = normalizeText(item && item.mode).toUpperCase()

    return {
      answerId: item && item._id ? item._id : '',
      roundId: normalizeText(item && item.roundId),
      modeText: MODE_TEXT_MAP[mode] || '双盲作诗',
      promptText: buildPromptSummary(round),
      content: normalizeText(item && item.content),
      createdAtText: formatDateTime(item && (item.updatedAt || item.createdAt))
    }
  }).slice(0, 3)
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const [answerList, totalParticipationCount, modeSettingRecord, featuredList] = await Promise.all([
      getAllAnswersByOpenid(openid),
      getTotalParticipationCount(),
      getModeSettingRecord(),
      getFeaturedList()
    ])
    const latestAnswerMap = {}

    answerList.forEach((item) => {
      const roundId = normalizeText(item && item.roundId)

      if (!roundId) {
        return
      }

      if (!latestAnswerMap[roundId] || toTimestamp(item.createdAt) > toTimestamp(latestAnswerMap[roundId].createdAt)) {
        latestAnswerMap[roundId] = item
      }
    })

    const roundIds = Object.keys(latestAnswerMap)
    const roundList = await getRoundsByIds(roundIds)
    const roundMap = roundList.reduce((acc, item) => {
      if (item && item._id) {
        acc[item._id] = item
      }

      return acc
    }, {})
    const allRoundAnswers = roundIds.length
      ? await getAllAnswers({
        roundId: _.in(roundIds)
      })
      : []
    const roundAnswerMap = allRoundAnswers.reduce((acc, item) => {
      const roundId = normalizeText(item && item.roundId)

      if (!roundId) {
        return acc
      }

      if (!acc[roundId]) {
        acc[roundId] = []
      }

      acc[roundId].push(item)
      return acc
    }, {})

    const list = roundIds.map((roundId) => {
      const answer = latestAnswerMap[roundId]
      const round = roundMap[roundId] || {}
      const mode = normalizeText(round.mode || answer.mode).toUpperCase()
      const roundAnswers = roundAnswerMap[roundId] || []
      const hasBlockedAnswer = roundAnswers.some((item) => isBlockedAnswer(item))
      const resultSummary = hasBlockedAnswer
        ? '该轮作品含有已屏蔽内容'
        : (normalizeText(round.mergedContent) || '另一位写作者尚未完成')

      return {
        roundId,
        mode,
        modeText: MODE_TEXT_MAP[mode] || '双盲作诗',
        promptText: buildPromptSummary(round),
        myContent: isBlockedAnswer(answer) ? '该作品已被屏蔽' : normalizeText(answer && answer.content),
        resultSummary,
        statusText: normalizeText(round.status) === 'completed' ? '已完成' : '等待对方完成',
        createdAtText: formatDateTime(answer && (answer.updatedAt || answer.createdAt))
      }
    }).sort((a, b) => {
      const answerA = latestAnswerMap[a.roundId]
      const answerB = latestAnswerMap[b.roundId]
      return toTimestamp(answerB && (answerB.updatedAt || answerB.createdAt))
        - toTimestamp(answerA && (answerA.updatedAt || answerA.createdAt))
    })

    return {
      success: true,
      list,
      featuredList,
      totalParticipationCount,
      availableModes: ['A', 'B', 'C'].filter((mode) => getModeStatusMap(modeSettingRecord || { modeStatus: DEFAULT_MODE_STATUS })[mode])
    }
  } catch (error) {
    return {
      success: false,
      message: '加载历史记录失败',
      error: error.message || error
    }
  }
}
