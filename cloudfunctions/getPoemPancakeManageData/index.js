const cloud = require('wx-server-sdk')
const {
  normalizeText,
  toTimestamp,
  formatDateTime,
  getActivityStartValue,
  getActivityDeadlineValue
} = require('./shared/poemPancakeTime')
const {
  ensureCollection,
  getAllRecords,
  getFirstRecord,
  isCollectionNotExistError
} = require('./shared/db')
const {
  buildFinalSnapshotData,
  persistActivityFinalSnapshot
} = require('./shared/poemPancakeBoard')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ACTIVITY_COLLECTION = 'poem_pancake_activities'
const BOARD_COLLECTION = 'poem_pancake_boards'
const INITIAL_VIEW_SIZE = 15
const EXPAND_PADDING = 2

function canManagePoemPancake(userRecord) {
  return !!(userRecord && (userRecord.superAdmin || (userRecord.role === 'admin' && userRecord.status === 'approved')))
}

async function getManagerUserRecord(openid) {
  return getFirstRecord(db, 'users', { openid })
}

function parseCellKey(cellKey) {
  const match = /^r(-?\d+)c(-?\d+)$/.exec(normalizeText(cellKey))

  if (!match) {
    return null
  }

  return {
    rowIndex: Number(match[1]),
    colIndex: Number(match[2])
  }
}

function computeFilledBounds(cellsMap = {}) {
  const keyList = Object.keys(cellsMap || {})

  if (!keyList.length) {
    return null
  }

  return keyList.reduce((result, key) => {
    const parsed = parseCellKey(key)

    if (!parsed) {
      return result
    }

    if (!result) {
      return {
        minRow: parsed.rowIndex,
        maxRow: parsed.rowIndex,
        minCol: parsed.colIndex,
        maxCol: parsed.colIndex
      }
    }

    result.minRow = Math.min(result.minRow, parsed.rowIndex)
    result.maxRow = Math.max(result.maxRow, parsed.rowIndex)
    result.minCol = Math.min(result.minCol, parsed.colIndex)
    result.maxCol = Math.max(result.maxCol, parsed.colIndex)
    return result
  }, null)
}

function buildDisplayBounds(bounds = null, minSize = INITIAL_VIEW_SIZE, padding = EXPAND_PADDING) {
  if (!bounds) {
    const min = -Math.floor(minSize / 2)
    const max = min + minSize - 1

    return {
      minRow: min,
      maxRow: max,
      minCol: min,
      maxCol: max,
      rowCount: minSize,
      colCount: minSize
    }
  }

  let minRow = Number(bounds.minRow)
  let maxRow = Number(bounds.maxRow)
  let minCol = Number(bounds.minCol)
  let maxCol = Number(bounds.maxCol)

  minRow -= padding
  maxRow += padding
  minCol -= padding
  maxCol += padding

  if ((maxRow - minRow + 1) < minSize) {
    const gap = minSize - (maxRow - minRow + 1)
    minRow -= Math.floor(gap / 2)
    maxRow += gap - Math.floor(gap / 2)
  }

  if ((maxCol - minCol + 1) < minSize) {
    const gap = minSize - (maxCol - minCol + 1)
    minCol -= Math.floor(gap / 2)
    maxCol += gap - Math.floor(gap / 2)
  }

  return {
    minRow,
    maxRow,
    minCol,
    maxCol,
    rowCount: maxRow - minRow + 1,
    colCount: maxCol - minCol + 1
  }
}

function countFilledCells(cellsMap = {}) {
  return Object.keys(cellsMap || {}).length
}

function countUserCount(userCellKeysMap = {}) {
  return Object.keys(userCellKeysMap || {}).filter((openid) => {
    return Array.isArray(userCellKeysMap[openid]) && userCellKeysMap[openid].length
  }).length
}

function buildRemainingTimeText(startAt, deadlineAt) {
  const startTimestamp = toTimestamp(startAt)
  const deadlineTimestamp = toTimestamp(deadlineAt)
  const now = Date.now()

  if (startTimestamp && startTimestamp > now) {
    const diff = startTimestamp - now
    const day = 24 * 60 * 60 * 1000
    const hour = 60 * 60 * 1000
    const minute = 60 * 1000

    if (diff >= day) {
      return `距开始 ${Math.ceil(diff / day)} 天`
    }

    if (diff >= hour) {
      return `距开始 ${Math.ceil(diff / hour)} 小时`
    }

    return `距开始 ${Math.max(1, Math.ceil(diff / minute))} 分钟`
  }

  if (!deadlineTimestamp) {
    return '截止时间待定'
  }

  const diff = deadlineTimestamp - now

  if (diff <= 0) {
    return '已截止'
  }

  const day = 24 * 60 * 60 * 1000
  const hour = 60 * 60 * 1000
  const minute = 60 * 1000

  if (diff >= day) {
    return `剩余 ${Math.ceil(diff / day)} 天`
  }

  if (diff >= hour) {
    return `剩余 ${Math.ceil(diff / hour)} 小时`
  }

  return `剩余 ${Math.max(1, Math.ceil(diff / minute))} 分钟`
}

function getActivityStatusText(status, startAt, deadlineAt) {
  const safeStatus = normalizeText(status)

  if (safeStatus === 'closed') {
    return '已截止'
  }

  if (safeStatus === 'draft') {
    return '草稿'
  }

  if (safeStatus === 'archived') {
    return '已归档'
  }

  const startTimestamp = toTimestamp(startAt)
  const deadlineTimestamp = toTimestamp(deadlineAt)
  const now = Date.now()

  if (startTimestamp && startTimestamp > now) {
    return '未开始'
  }

  return deadlineTimestamp && deadlineTimestamp <= now
    ? '已截止'
    : '进行中'
}

function formatActivityTimeRange(startAt, deadlineAt) {
  const startText = formatDateTime(startAt)
  const deadlineText = formatDateTime(deadlineAt)

  if (startText && deadlineText) {
    return `${startText} - ${deadlineText}`
  }

  return deadlineText || startText || '时间待定'
}

function isActivityRunning(activity) {
  const safeActivity = activity || {}
  const now = Date.now()
  const startTimestamp = toTimestamp(getActivityStartValue(safeActivity))
  const deadlineTimestamp = toTimestamp(getActivityDeadlineValue(safeActivity))

  if (normalizeText(safeActivity.status) !== 'published') {
    return false
  }

  if (startTimestamp && startTimestamp > now) {
    return false
  }

  if (deadlineTimestamp && deadlineTimestamp <= now) {
    return false
  }

  return true
}

function resolveLiveBounds(activity) {
  if (
    Number.isFinite(Number(activity && activity.minFilledRow))
    && Number.isFinite(Number(activity && activity.maxFilledRow))
    && Number.isFinite(Number(activity && activity.minFilledCol))
    && Number.isFinite(Number(activity && activity.maxFilledCol))
  ) {
    return {
      minRow: Number(activity.minFilledRow),
      maxRow: Number(activity.maxFilledRow),
      minCol: Number(activity.minFilledCol),
      maxCol: Number(activity.maxFilledCol)
    }
  }

  return null
}

async function getBoardById(boardId) {
  if (!boardId) {
    return null
  }

  try {
    const res = await db.collection(BOARD_COLLECTION).doc(boardId).get()
    return res.data || null
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

async function ensureActivityFinalized(activity) {
  const safeActivity = activity && typeof activity === 'object' ? activity : null

  if (!safeActivity || safeActivity.status !== 'published' || toTimestamp(getActivityDeadlineValue(safeActivity)) > Date.now()) {
    return safeActivity
  }

  const board = await getBoardById(safeActivity.boardId)
  const cellsMap = board && board.cellsMap && typeof board.cellsMap === 'object'
    ? board.cellsMap
    : {}
  const userCellKeysMap = board && board.userCellKeysMap && typeof board.userCellKeysMap === 'object'
    ? board.userCellKeysMap
    : {}
  const snapshotData = buildFinalSnapshotData(cellsMap, userCellKeysMap)

  await persistActivityFinalSnapshot(db, ACTIVITY_COLLECTION, safeActivity._id, snapshotData)

  return {
    ...safeActivity,
    ...snapshotData
  }
}

function buildActivityCard(activity) {
  const safeActivity = activity || {}
  const activityStatus = normalizeText(safeActivity.status)
  const startValue = getActivityStartValue(safeActivity)
  const deadlineValue = getActivityDeadlineValue(safeActivity)
  const displayBounds = ['closed', 'archived'].includes(activityStatus) && safeActivity.finalBounds
    ? buildDisplayBounds(safeActivity.finalBounds, safeActivity.finalBounds.rowCount || INITIAL_VIEW_SIZE, 0)
    : buildDisplayBounds(resolveLiveBounds(safeActivity))

  return {
    activityId: safeActivity._id || '',
    title: normalizeText(safeActivity.title) || '未命名活动',
    theme: normalizeText(safeActivity.theme),
    description: normalizeText(safeActivity.description),
    status: activityStatus || 'draft',
    statusText: getActivityStatusText(safeActivity.status, startValue, deadlineValue),
    activityTimeText: formatActivityTimeRange(startValue, deadlineValue),
    remainingTimeText: buildRemainingTimeText(startValue, deadlineValue),
    startAtText: formatDateTime(startValue),
    deadlineAtText: formatDateTime(deadlineValue),
    filledCount: Number(safeActivity.filledCount) || 0,
    userCount: Number(safeActivity.userCount) || 0,
    snapshotSizeText: `${displayBounds.rowCount}x${displayBounds.colCount}`,
    updatedAt: toTimestamp(safeActivity.updatedAt || safeActivity.createdAt)
  }
}

exports.main = async () => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const userRecord = await getManagerUserRecord(openid)

    if (!canManagePoemPancake(userRecord)) {
      return {
        success: false,
        message: '当前账号没有诗词摊煎饼管理权限'
      }
    }

    await ensureCollection(db, ACTIVITY_COLLECTION)
    await ensureCollection(db, BOARD_COLLECTION)

    const activityList = await getAllRecords(db, ACTIVITY_COLLECTION)
    const normalizedList = []

    for (let index = 0; index < activityList.length; index += 1) {
      const item = await ensureActivityFinalized(activityList[index])
      normalizedList.push(item)
    }

    const list = normalizedList
      .sort((a, b) => {
        const statusOrderMap = {
          published: 0,
          draft: 1,
          closed: 2,
          archived: 3
        }
        const statusDiff = (statusOrderMap[normalizeText(a && a.status)] || 9) - (statusOrderMap[normalizeText(b && b.status)] || 9)

        if (statusDiff !== 0) {
          return statusDiff
        }

        return toTimestamp(b && (b.updatedAt || b.createdAt)) - toTimestamp(a && (a.updatedAt || a.createdAt))
      })
      .map((item) => buildActivityCard(item))

    return {
      success: true,
      list,
      stats: {
        totalActivities: list.length,
        ongoingActivities: normalizedList.filter((item) => isActivityRunning(item)).length,
        totalChars: list.reduce((sum, item) => sum + (Number(item && item.filledCount) || 0), 0)
      }
    }
  } catch (error) {
    console.error('getPoemPancakeManageData error:', error)
    return {
      success: false,
      message: error.message || '管理数据加载失败'
    }
  }
}
