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
  isCollectionNotExistError
} = require('./shared/db')
const {
  buildFinalSnapshotData,
  resolveUserCellKeyList,
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
const RESERVE_DURATION_MS = 8000

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

function getActiveReservationState(board = {}, nowTimestamp = Date.now()) {
  const sourceReservationMap = board && board.reservationMap && typeof board.reservationMap === 'object'
    ? board.reservationMap
    : {}
  const reservationMap = {}
  const userReservationMap = {}
  let changed = false

  Object.keys(sourceReservationMap).forEach((cellKey) => {
    const item = sourceReservationMap[cellKey] && typeof sourceReservationMap[cellKey] === 'object'
      ? sourceReservationMap[cellKey]
      : null
    const openid = normalizeText(item && item.openid)
    const expiresAtTimestamp = toTimestamp(item && item.expiresAt)

    if (!openid || !expiresAtTimestamp || expiresAtTimestamp <= nowTimestamp) {
      changed = true
      return
    }

    reservationMap[cellKey] = {
      openid,
      nickname: normalizeText(item && item.nickname),
      expiresAt: new Date(expiresAtTimestamp)
    }
    userReservationMap[openid] = cellKey
  })

  const sourceUserReservationMap = board && board.userReservationMap && typeof board.userReservationMap === 'object'
    ? board.userReservationMap
    : {}

  Object.keys(sourceUserReservationMap).forEach((openid) => {
    const safeOpenid = normalizeText(openid)
    const cellKey = normalizeText(sourceUserReservationMap[openid])

    if (!safeOpenid || userReservationMap[safeOpenid] === cellKey) {
      return
    }

    changed = true
  })

  return {
    reservationMap,
    userReservationMap,
    changed
  }
}

function buildReservedCellMap(reservationMap = {}, currentOpenid = '') {
  return Object.keys(reservationMap || {}).reduce((result, cellKey) => {
    const item = reservationMap[cellKey]

    result[cellKey] = {
      nickname: normalizeText(item && item.nickname),
      reservedByMe: normalizeText(item && item.openid) === normalizeText(currentOpenid),
      expiresAtText: formatDateTime(item && item.expiresAt)
    }
    return result
  }, {})
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

function canWriteToActivity(activity) {
  const safeActivity = activity && typeof activity === 'object' ? activity : {}
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

function buildWriteHint(activity) {
  const safeActivity = activity && typeof activity === 'object' ? activity : {}
  const status = normalizeText(safeActivity.status)
  const startValue = getActivityStartValue(safeActivity)
  const deadlineValue = getActivityDeadlineValue(safeActivity)
  const startTimestamp = toTimestamp(startValue)
  const deadlineTimestamp = toTimestamp(deadlineValue)
  const now = Date.now()

  if (status === 'archived') {
    return '活动已归档，这张画板会保留为固定快照。'
  }

  if (status === 'closed' || (deadlineTimestamp && deadlineTimestamp <= now)) {
    return '活动已截止，画板已经冻结为固定快照。'
  }

  if (startTimestamp && startTimestamp > now) {
    return `活动将在 ${formatDateTime(startValue)} 开始，可先查看当前画板范围。`
  }

  return '点任意空格写 1 个字；点自己写过的格子可以改字，清空后可删除。'
}

function formatActivityTimeRange(startAt, deadlineAt) {
  const startText = formatDateTime(startAt)
  const deadlineText = formatDateTime(deadlineAt)

  if (startText && deadlineText) {
    return `${startText} - ${deadlineText}`
  }

  return deadlineText || startText || '时间待定'
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

exports.main = async (event = {}) => {
  try {
    await ensureCollection(db, ACTIVITY_COLLECTION)
    await ensureCollection(db, BOARD_COLLECTION)

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const activityId = normalizeText(event.activityId)

    if (!activityId) {
      return {
        success: false,
        message: '缺少活动信息'
      }
    }

    const activityRes = await db.collection(ACTIVITY_COLLECTION).doc(activityId).get()
    const finalizedActivity = await ensureActivityFinalized(activityRes.data || null)

    if (!finalizedActivity) {
      return {
        success: false,
        message: '活动不存在'
      }
    }

    const board = await getBoardById(finalizedActivity.boardId)
    const boardCellsMap = board && board.cellsMap && typeof board.cellsMap === 'object'
      ? board.cellsMap
      : {}
    const userCellKeysMap = board && board.userCellKeysMap && typeof board.userCellKeysMap === 'object'
      ? board.userCellKeysMap
      : {}
    const reservationState = getActiveReservationState(board, Date.now())

    const isFrozenActivity = ['closed', 'archived'].includes(normalizeText(finalizedActivity.status))
    const cellsMap = isFrozenActivity && finalizedActivity.finalBoard
      ? finalizedActivity.finalBoard
      : boardCellsMap
    const displayBounds = isFrozenActivity && finalizedActivity.finalBounds
      ? buildDisplayBounds(finalizedActivity.finalBounds, finalizedActivity.finalBounds.rowCount || INITIAL_VIEW_SIZE, 0)
      : buildDisplayBounds(resolveLiveBounds(finalizedActivity) || computeFilledBounds(cellsMap))
    const myCellKeyList = resolveUserCellKeyList(cellsMap, userCellKeysMap, openid)
    const canWrite = canWriteToActivity(finalizedActivity)
    const reservedCellMap = isFrozenActivity
      ? {}
      : buildReservedCellMap(reservationState.reservationMap, openid)

    const startValue = getActivityStartValue(finalizedActivity)
    const deadlineValue = getActivityDeadlineValue(finalizedActivity)

    return {
      success: true,
      activity: {
        activityId: finalizedActivity._id || '',
        title: normalizeText(finalizedActivity.title) || '未命名活动',
        theme: normalizeText(finalizedActivity.theme),
        description: normalizeText(finalizedActivity.description),
        status: normalizeText(finalizedActivity.status) || 'draft',
        statusText: getActivityStatusText(finalizedActivity.status, startValue, deadlineValue),
        activityTimeText: formatActivityTimeRange(startValue, deadlineValue),
        remainingTimeText: buildRemainingTimeText(startValue, deadlineValue),
        startAtText: formatDateTime(startValue),
        deadlineAtText: formatDateTime(deadlineValue),
        filledCount: Number(finalizedActivity.filledCount) || countFilledCells(cellsMap),
        userCount: Number(finalizedActivity.userCount) || countUserCount(userCellKeysMap),
        canWrite,
        writeHint: buildWriteHint(finalizedActivity)
      },
      cellsMap,
      reservedCellMap,
      displayBounds,
      myCellKeyList,
      myReservedCellKey: normalizeText(reservationState.userReservationMap[openid]),
      myCharCount: myCellKeyList.length,
      totalChars: Number(finalizedActivity.filledCount) || countFilledCells(cellsMap),
      reserveDurationMs: RESERVE_DURATION_MS
    }
  } catch (error) {
    console.error('getPoemPancakeActivityDetail error:', error)
    return {
      success: false,
      message: error.message || '活动详情加载失败'
    }
  }
}
