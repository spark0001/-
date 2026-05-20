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

const DEFAULT_MODE_STATUS = {
  A: true,
  B: true,
  C: true
}

const DEFAULT_PROMPTS = [
  {
    mode: 'A',
    title: '双句合诗',
    promptText: '请写一句你此刻想到的短诗，不必押韵，也不必解释。',
    theme: '',
    imagery: [],
    sort: 10
  },
  {
    mode: 'A',
    title: '一句短诗',
    promptText: '请用一句话写下你今天最想留下的诗意瞬间。',
    theme: '',
    imagery: [],
    sort: 20
  },
  {
    mode: 'A',
    title: '夜色里的一句',
    promptText: '请写一句适合落在夜色里的短诗。',
    theme: '',
    imagery: [],
    sort: 30
  },
  {
    mode: 'B',
    title: '上下句互写',
    promptText: '请写一句适合与陌生人拼成上下句的短诗，尽量保留留白感。',
    theme: '',
    imagery: [],
    sort: 10
  },
  {
    mode: 'B',
    title: '半阙留白',
    promptText: '请写一句能够与另一位写作者遥相呼应的诗句，系统会将其拼成上下句。',
    theme: '',
    imagery: [],
    sort: 20
  },
  {
    mode: 'C',
    title: '同题异写',
    promptText: '请围绕“春夜”写一小段短诗或诗句。创作时你看不到对方内容，结果页会并列展示两份作品。',
    theme: '春夜',
    imagery: [],
    sort: 10
  },
  {
    mode: 'C',
    title: '同题异写',
    promptText: '请围绕“离别”写一小段短诗或诗句。创作时你看不到对方内容，结果页会并列展示两份作品。',
    theme: '离别',
    imagery: [],
    sort: 20
  },
  {
    mode: 'C',
    title: '同题异写',
    promptText: '请围绕“校园晚风”写一小段短诗或诗句。创作时你看不到对方内容，结果页会并列展示两份作品。',
    theme: '校园晚风',
    imagery: [],
    sort: 30
  }
]

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

function pickRandomItem(list) {
  const safeList = Array.isArray(list) ? list : []

  if (!safeList.length) {
    return null
  }

  return safeList[Math.floor(Math.random() * safeList.length)]
}

function normalizePromptItem(item) {
  return {
    ...item,
    _id: normalizeText(item && item._id),
    mode: normalizeText(item && item.mode).toUpperCase(),
    title: normalizeText(item && item.title),
    theme: normalizeText(item && item.theme),
    promptText: normalizeText(item && item.promptText),
    imagery: Array.isArray(item && item.imagery) ? item.imagery.filter(Boolean) : [],
    status: normalizeText(item && item.status) === 'disabled' ? 'disabled' : 'enabled',
    sort: Number(item && item.sort) || 0
  }
}

async function ensureDefaultModeSettings() {
  const settingsList = await getAllRecords('blind_poem_settings', {
    settingKey: 'mode_status'
  })

  if (settingsList.length) {
    return settingsList[0]
  }

  const now = new Date()
  const addRes = await db.collection('blind_poem_settings').add({
    data: {
      settingKey: 'mode_status',
      modeStatus: DEFAULT_MODE_STATUS,
      createdAt: now,
      updatedAt: now
    }
  })

  return {
    _id: addRes._id || '',
    settingKey: 'mode_status',
    modeStatus: DEFAULT_MODE_STATUS,
    createdAt: now,
    updatedAt: now
  }
}

async function ensureDefaultPrompts() {
  const promptList = await getAllRecords('blind_poem_prompts')

  if (promptList.length) {
    return promptList
  }

  const now = new Date()

  for (let index = 0; index < DEFAULT_PROMPTS.length; index += 1) {
    const item = DEFAULT_PROMPTS[index]

    await db.collection('blind_poem_prompts').add({
      data: {
        mode: item.mode,
        title: item.title,
        theme: item.theme,
        promptText: item.promptText,
        imagery: item.imagery,
        status: 'enabled',
        sort: item.sort,
        createdAt: now,
        updatedAt: now
      }
    })
  }

  return getAllRecords('blind_poem_prompts')
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

function buildRoundPayload(prompt) {
  const safePrompt = normalizePromptItem(prompt)

  return {
    mode: safePrompt.mode,
    promptId: safePrompt._id,
    promptTitle: safePrompt.title || '双盲作诗',
    promptText: safePrompt.promptText,
    theme: safePrompt.theme,
    imagery: safePrompt.imagery,
    status: 'waiting',
    resultStatus: 'pending',
    participantCount: 0,
    participantOpenids: [],
    mergedContent: ''
  }
}

function buildComposeRound(round, openid) {
  const participantOpenids = Array.isArray(round && round.participantOpenids) ? round.participantOpenids : []
  const roleIndex = participantOpenids.indexOf(openid)
  const mode = normalizeText(round && round.mode).toUpperCase()
  let roleText = ''
  let composePromptText = normalizeText(round && round.promptText)

  if (mode === 'B') {
    if (roleIndex <= 0) {
      roleText = '你负责本轮上句'
      composePromptText = `${composePromptText} 请写上句。`
    } else {
      roleText = '你负责本轮下句'
      composePromptText = `${composePromptText} 请写下句。`
    }
  }

  return {
    ...round,
    roleText,
    composePromptText
  }
}

async function getWaitingRounds(mode) {
  const list = await getAllRecords('blind_poem_rounds', {
    mode,
    status: 'waiting'
  })

  return (list || [])
    .slice()
    .sort((a, b) => toTimestamp(b && b.createdAt) - toTimestamp(a && a.createdAt))
    .slice(0, 30)
}

function normalizeRound(round) {
  return {
    ...round,
    participantOpenids: Array.isArray(round && round.participantOpenids) ? round.participantOpenids : [],
    imagery: Array.isArray(round && round.imagery) ? round.imagery : []
  }
}

async function getUsedPromptIdMap(openid, mode) {
  const answerList = await getAllRecords('blind_poem_answers', {
    openid,
    mode
  })

  return (answerList || []).reduce((acc, item) => {
    const promptId = normalizeText(item && item.promptId)

    if (promptId) {
      acc[promptId] = true
    }

    return acc
  }, {})
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const mode = normalizeText(event.mode).toUpperCase()
  const now = new Date()

  if (!ALLOWED_MODES[mode]) {
    return {
      success: false,
      message: '当前模式不支持'
    }
  }

  try {
    await ensureCollection('blind_poem_rounds')
    await ensureCollection('blind_poem_answers')
    await ensureCollection('blind_poem_prompts')
    await ensureCollection('blind_poem_settings')

    const [modeSettingRecord, promptList, waitingRounds] = await Promise.all([
      ensureDefaultModeSettings(),
      ensureDefaultPrompts(),
      getWaitingRounds(mode)
    ])

    const normalizedWaitingRounds = (waitingRounds || [])
      .map((item) => normalizeRound(item))
      .filter((item) => toTimestamp(item.createdAt) >= Date.now() - 7 * 24 * 60 * 60 * 1000)
    const existingRound = normalizedWaitingRounds.find((item) => item.participantOpenids.indexOf(openid) !== -1)

    if (existingRound) {
      return {
        success: true,
        round: buildComposeRound(existingRound, openid)
      }
    }

    const modeStatus = getModeStatusMap(modeSettingRecord)

    if (!modeStatus[mode]) {
      return {
        success: false,
        message: '当前模式已停用'
      }
    }

    const joinableRound = normalizedWaitingRounds.find((item) => item.participantOpenids.length < 2)

    if (joinableRound) {
      const participantOpenids = joinableRound.participantOpenids.concat(openid)

      await db.collection('blind_poem_rounds').doc(joinableRound._id).update({
        data: {
          participantOpenids,
          participantCount: participantOpenids.length,
          updatedAt: now
        }
      })

      return {
        success: true,
        round: buildComposeRound({
          ...joinableRound,
          participantOpenids,
          participantCount: participantOpenids.length,
          updatedAt: now
        }, openid)
      }
    }

    const enabledPrompts = (promptList || [])
      .map((item) => normalizePromptItem(item))
      .filter((item) => item.mode === mode && item.status === 'enabled')
      .sort((a, b) => {
        if (a.sort !== b.sort) {
          return a.sort - b.sort
        }

        return toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)
      })

    if (!enabledPrompts.length) {
      return {
        success: false,
        message: '当前模式暂无可用题面'
      }
    }

    const usedPromptIdMap = await getUsedPromptIdMap(openid, mode)
    const unusedPrompts = enabledPrompts.filter((item) => !usedPromptIdMap[item._id])
    const selectedPrompt = pickRandomItem(unusedPrompts.length ? unusedPrompts : enabledPrompts)
    const payload = buildRoundPayload(selectedPrompt)
    const participantOpenids = [openid]
    const addRes = await db.collection('blind_poem_rounds').add({
      data: {
        ...payload,
        participantOpenids,
        participantCount: participantOpenids.length,
        createdAt: now,
        updatedAt: now
      }
    })

    return {
      success: true,
      round: buildComposeRound({
        _id: addRes._id || '',
        ...payload,
        participantOpenids,
        participantCount: participantOpenids.length,
        createdAt: now,
        updatedAt: now
      }, openid)
    }
  } catch (error) {
    return {
      success: false,
      message: '准备创作轮次失败',
      error: error.message || error
    }
  }
}
