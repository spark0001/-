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

async function getUsersByOpenids(openidList) {
  const safeOpenids = Array.isArray(openidList)
    ? openidList.map((item) => normalizeText(item)).filter(Boolean)
    : []

  if (!safeOpenids.length) {
    return []
  }

  try {
    const res = await db.collection('users')
      .where({
        openid: _.in(safeOpenids)
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

function getPriorityUserRecord(userList, openid) {
  return (userList || [])
    .filter((item) => normalizeText(item && item.openid) === openid)
    .sort((a, b) => {
      const statusScoreA = normalizeText(a && a.status) === 'approved' ? 2 : (normalizeText(a && a.status) === 'pending' ? 1 : 0)
      const statusScoreB = normalizeText(b && b.status) === 'approved' ? 2 : (normalizeText(b && b.status) === 'pending' ? 1 : 0)

      if (statusScoreB !== statusScoreA) {
        return statusScoreB - statusScoreA
      }

      return toTimestamp(b && (b.updatedAt || b.createdAt)) - toTimestamp(a && (a.updatedAt || a.createdAt))
    })[0] || null
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

function buildParticipantList(round, answers, userList) {
  const participantOpenids = Array.isArray(round && round.participantOpenids) ? round.participantOpenids : []
  const answerOpenids = (answers || []).map((item) => normalizeText(item && item.openid)).filter(Boolean)
  const orderedOpenids = []

  participantOpenids.concat(answerOpenids).forEach((item) => {
    if (item && orderedOpenids.indexOf(item) === -1) {
      orderedOpenids.push(item)
    }
  })

  while (orderedOpenids.length < 2) {
    orderedOpenids.push(`placeholder-${orderedOpenids.length}`)
  }

  return orderedOpenids.slice(0, 2).map((openid, index) => {
    const userRecord = openid.indexOf('placeholder-') === 0 ? null : getPriorityUserRecord(userList, openid)
    const mode = normalizeText(round && round.mode).toUpperCase()
    const fallbackText = mode === 'B'
      ? (index === 0 ? '上' : '下')
      : (index === 0 ? '甲' : '乙')

    return {
      slotKey: `participant-${index}`,
      avatarUrl: normalizeText(userRecord && userRecord.avatarUrl),
      avatarText: fallbackText
    }
  })
}

function isBlockedAnswer(answer) {
  return normalizeText(answer && answer.reviewStatus) === 'blocked'
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const roundId = normalizeText(event.roundId)

  if (!roundId) {
    return {
      success: false,
      message: '缺少轮次信息'
    }
  }

  try {
    const round = await getRound(roundId)

    if (!round) {
      return {
        success: false,
        message: '当前轮次不存在'
      }
    }

    const mode = normalizeText(round.mode).toUpperCase()
    const answers = await getRoundAnswers(roundId)
    const sortedAnswers = (answers || [])
      .slice()
      .sort((a, b) => toTimestamp(a && a.createdAt) - toTimestamp(b && b.createdAt))
    const myAnswer = sortedAnswers.find((item) => normalizeText(item && item.openid) === openid)

    if (!myAnswer) {
      return {
        success: false,
        message: '当前轮次还没有你的作品'
      }
    }

    const partnerAnswer = sortedAnswers.find((item) => normalizeText(item && item.openid) !== openid)
    const completed = normalizeText(round.status) === 'completed' || sortedAnswers.length >= 2
    const userList = await getUsersByOpenids(
      (Array.isArray(round.participantOpenids) ? round.participantOpenids : []).concat(
        sortedAnswers.map((item) => item && item.openid)
      )
    )
    const participants = buildParticipantList(round, sortedAnswers, userList)
    const participantOpenids = Array.isArray(round.participantOpenids) ? round.participantOpenids : []
    const myRoleIndex = participantOpenids.indexOf(openid)
    const isUpperLine = myRoleIndex <= 0
    const myBlocked = isBlockedAnswer(myAnswer)
    const partnerBlocked = isBlockedAnswer(partnerAnswer)
    const hasBlockedAnswer = myBlocked || partnerBlocked

    return {
      success: true,
      detail: {
        roundId,
        mode,
        modeText: MODE_TEXT_MAP[mode] || '双盲作诗',
        promptTitle: normalizeText(round.promptTitle) || '双盲作诗',
        promptText: normalizeText(round.promptText),
        theme: normalizeText(round.theme),
        imageryText: '',
        myTitle: mode === 'B' ? (isUpperLine ? '我的上句' : '我的下句') : '我的作品',
        myContent: myBlocked ? '该作品已被屏蔽' : normalizeText(myAnswer.content),
        partnerTitle: mode === 'B'
          ? (isUpperLine ? '另一位写作者的下句' : '另一位写作者的上句')
          : (mode === 'C' ? '另一份同题作品' : '另一位写作者的作品'),
        partnerContent: partnerBlocked ? '该作品已被屏蔽' : normalizeText(partnerAnswer && partnerAnswer.content),
        resultContent: hasBlockedAnswer
          ? '本轮作品含有已屏蔽内容，暂不展示完整结果。'
          : (completed
          ? (normalizeText(round.mergedContent) || buildMergedContent(mode, round, sortedAnswers))
          : '另一位写作者尚未完成，等对方提交后会在这里展示完整结果。'),
        statusText: hasBlockedAnswer
          ? '该轮作品含有已屏蔽内容'
          : (completed ? '本轮创作已完成' : '还在等待另一位写作者'),
        createdAtText: formatDateTime(myAnswer.createdAt || round.updatedAt || round.createdAt),
        participants
      }
    }
  } catch (error) {
    return {
      success: false,
      message: '加载创作结果失败',
      error: error.message || error
    }
  }
}
