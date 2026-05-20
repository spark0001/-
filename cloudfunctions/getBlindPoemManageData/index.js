const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

const MODE_TEXT_MAP = {
  A: '模式A',
  B: '模式B',
  C: '模式C'
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
    mode: 'B',
    title: '上下句互写',
    promptText: '请写一句适合与陌生人拼成上下句的诗句，系统会分配你的句位。',
    theme: '',
    imagery: [],
    sort: 10
  },
  {
    mode: 'B',
    title: '半阙留白',
    promptText: '请写一句能够与另一位写作者遥相呼应的诗句。',
    theme: '',
    imagery: [],
    sort: 20
  },
  {
    mode: 'C',
    title: '同题异写',
    promptText: '请围绕“春夜”写一小段短诗或诗句。',
    theme: '春夜',
    imagery: [],
    sort: 10
  },
  {
    mode: 'C',
    title: '同题异写',
    promptText: '请围绕“离别”写一小段短诗或诗句。',
    theme: '离别',
    imagery: [],
    sort: 20
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

function canManageBlindPoem(userRecord) {
  return !!(userRecord && (userRecord.superAdmin || (userRecord.role === 'admin' && userRecord.status === 'approved')))
}

async function getManagerUserRecord(openid) {
  const userList = await getAllRecords('users', {
    openid
  })

  return (userList || [])[0] || null
}

async function ensureDefaultModeSettings() {
  const list = await getAllRecords('blind_poem_settings', {
    settingKey: 'mode_status'
  })

  if (list.length) {
    return list[0]
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

function buildPromptSummary(round) {
  const mode = normalizeText(round && round.mode).toUpperCase()

  if (mode === 'C') {
    return normalizeText(round && round.theme)
      ? `同题：${normalizeText(round.theme)}`
      : normalizeText(round && round.promptText)
  }

  return normalizeText(round && (round.promptTitle || round.promptText))
}

async function getRoundsByIds(roundIds) {
  const safeIds = Array.isArray(roundIds) ? roundIds.filter(Boolean) : []

  if (!safeIds.length) {
    return []
  }

  try {
    const list = []

    for (let index = 0; index < safeIds.length; index += 100) {
      const currentIds = safeIds.slice(index, index + 100)
      const res = await db.collection('blind_poem_rounds').where({
        _id: _.in(currentIds)
      }).get()

      list.push(...(res.data || []))
    }

    return list
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return []
    }

    throw error
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const userRecord = await getManagerUserRecord(openid)

    if (!canManageBlindPoem(userRecord)) {
      return {
        success: false,
        message: '当前账号没有双盲作诗管理权限'
      }
    }

    await ensureCollection('blind_poem_prompts')
    await ensureCollection('blind_poem_settings')
    await ensureCollection('blind_poem_answers')

    const [settingRecord, promptList, answerList] = await Promise.all([
      ensureDefaultModeSettings(),
      ensureDefaultPrompts(),
      getAllRecords('blind_poem_answers')
    ])
    const latestAnswerList = (answerList || [])
      .slice()
      .sort((a, b) => toTimestamp(b && (b.updatedAt || b.createdAt)) - toTimestamp(a && (a.updatedAt || a.createdAt)))
    const roundIds = latestAnswerList.map((item) => normalizeText(item && item.roundId)).filter(Boolean)
    const roundList = await getRoundsByIds(roundIds)
    const roundMap = roundList.reduce((acc, item) => {
      if (item && item._id) {
        acc[item._id] = item
      }

      return acc
    }, {})

    return {
      success: true,
      modeStatus: getModeStatusMap(settingRecord),
      promptList: (promptList || []).map((item) => {
        const imagery = Array.isArray(item && item.imagery) ? item.imagery.filter(Boolean) : []
        const mode = normalizeText(item && item.mode).toUpperCase()

        return {
          promptId: item && item._id ? item._id : '',
          mode,
          modeText: MODE_TEXT_MAP[mode] || '未知模式',
          title: normalizeText(item && item.title),
          promptText: normalizeText(item && item.promptText),
          theme: normalizeText(item && item.theme),
          imageryText: imagery.join(' / '),
          status: normalizeText(item && item.status) === 'disabled' ? 'disabled' : 'enabled',
          statusText: normalizeText(item && item.status) === 'disabled' ? '已停用' : '已启用',
          sort: Number(item && item.sort) || 0
        }
      }).sort((a, b) => {
        if (a.mode !== b.mode) {
          return a.mode.localeCompare(b.mode)
        }

        if (a.sort !== b.sort) {
          return a.sort - b.sort
        }

        return a.title.localeCompare(b.title)
      }),
      answerList: latestAnswerList.map((item) => {
        const round = roundMap[normalizeText(item && item.roundId)] || {}
        const mode = normalizeText(item && item.mode).toUpperCase()
        const reviewStatus = normalizeText(item && item.reviewStatus) === 'blocked' ? 'blocked' : 'normal'
        const openidText = normalizeText(item && item.openid)

        return {
          answerId: item && item._id ? item._id : '',
          roundId: normalizeText(item && item.roundId),
          mode,
          modeText: MODE_TEXT_MAP[mode] || '未知模式',
          promptSummary: buildPromptSummary(round) || '未命名题面',
          content: normalizeText(item && item.content),
          createdAtText: formatDateTime(item && (item.updatedAt || item.createdAt)),
          authorText: openidText ? `用户 ${openidText.slice(-6)}` : '匿名用户',
          reviewStatus,
          reviewStatusText: reviewStatus === 'blocked' ? '已屏蔽' : '正常展示',
          isFeatured: !!item.isFeatured
        }
      })
    }
  } catch (error) {
    return {
      success: false,
      message: '双盲作诗后台数据加载失败',
      error: error.message || error
    }
  }
}
