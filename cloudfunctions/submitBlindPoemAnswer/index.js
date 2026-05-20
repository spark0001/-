const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ALLOWED_MODES = {
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

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
    || message.indexOf('already exists') !== -1
}

async function ensureCollection(collectionName) {
  try {
    await db.createCollection(collectionName)
  } catch (error) {
    if (isCollectionAlreadyExistError(error)) {
      return
    }

    throw error
  }
}

async function getRound(roundId) {
  try {
    const res = await db.collection('blind_poem_rounds').doc(roundId).get()
    return res.data || null
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

async function getRoundAnswers(roundId) {
  try {
    const res = await db.collection('blind_poem_answers')
      .where({
        roundId
      })
      .limit(20)
      .get()

    return res.data || []
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  }
}

function buildMergedContent(mode, round, answers) {
  const answerMap = {}

  ;(answers || []).forEach((item) => {
    const safeOpenid = normalizeText(item && item.openid)

    if (safeOpenid) {
      answerMap[safeOpenid] = normalizeText(item && item.content)
    }
  })

  const participantOpenids = Array.isArray(round && round.participantOpenids) ? round.participantOpenids : []
  const first = normalizeText(answerMap[participantOpenids[0]]) || normalizeText(answers[0] && answers[0].content)
  const second = normalizeText(answerMap[participantOpenids[1]]) || normalizeText(answers[1] && answers[1].content)

  if (mode === 'A') {
    return [first, second].filter(Boolean).join('\n')
  }

  if (mode === 'B') {
    return `上句：${first}\n下句：${second}`
  }

  if (mode === 'C') {
    return `同题：${normalizeText(round && round.theme) || '未命名主题'}\n\n作品一：${first}\n\n作品二：${second}`
  }

  return [first, second].filter(Boolean).join('\n')
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const roundId = normalizeText(event.roundId)
  const mode = normalizeText(event.mode).toUpperCase()
  const content = normalizeText(event.content)
  const now = new Date()

  if (!roundId) {
    return {
      success: false,
      message: '缺少轮次信息'
    }
  }

  if (!ALLOWED_MODES[mode]) {
    return {
      success: false,
      message: '当前模式不支持'
    }
  }

  if (!content) {
    return {
      success: false,
      message: '请先写下你的作品'
    }
  }

  try {
    await ensureCollection('blind_poem_rounds')
    await ensureCollection('blind_poem_answers')

    const round = await getRound(roundId)

    if (!round) {
      return {
        success: false,
        message: '当前轮次不存在'
      }
    }

    if (normalizeText(round.mode).toUpperCase() !== mode) {
      return {
        success: false,
        message: '轮次模式不匹配'
      }
    }

    let answers = await getRoundAnswers(roundId)
    const existingAnswer = answers.find((item) => normalizeText(item && item.openid) === openid)

    if (existingAnswer) {
      await db.collection('blind_poem_answers').doc(existingAnswer._id).update({
        data: {
          content,
          updatedAt: now
        }
      })
    } else {
      await db.collection('blind_poem_answers').add({
        data: {
          roundId,
          promptId: normalizeText(round.promptId),
          openid,
          mode,
          content,
          reviewStatus: 'normal',
          isFeatured: false,
          createdAt: now,
          updatedAt: now
        }
      })
    }

    answers = await getRoundAnswers(roundId)
    const participantOpenidsMap = {}

    ;(Array.isArray(round.participantOpenids) ? round.participantOpenids : []).forEach((item) => {
      const safeOpenid = normalizeText(item)

      if (safeOpenid) {
        participantOpenidsMap[safeOpenid] = true
      }
    })

    ;(answers || []).forEach((item) => {
      const safeOpenid = normalizeText(item && item.openid)

      if (safeOpenid) {
        participantOpenidsMap[safeOpenid] = true
      }
    })

    const participantOpenids = Object.keys(participantOpenidsMap)
    const participantCount = Object.keys((answers || []).reduce((acc, item) => {
      const safeOpenid = normalizeText(item && item.openid)

      if (safeOpenid) {
        acc[safeOpenid] = true
      }

      return acc
    }, {})).length
    const completed = participantCount >= 2

    await db.collection('blind_poem_rounds').doc(roundId).update({
      data: {
        participantOpenids,
        participantCount,
        status: completed ? 'completed' : 'waiting',
        resultStatus: completed ? 'completed' : 'pending',
        mergedContent: completed ? buildMergedContent(mode, round, answers) : '',
        updatedAt: now
      }
    })

    return {
      success: true,
      roundId,
      status: completed ? 'completed' : 'waiting'
    }
  } catch (error) {
    return {
      success: false,
      message: '提交作品失败',
      error: error.message || error
    }
  }
}
