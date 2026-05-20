const cloud = require('wx-server-sdk')
const {
  normalizeText,
  toTimestamp,
  getActivityStartValue,
  getActivityDeadlineValue
} = require('./shared/poemPancakeTime')
const {
  ensureCollection,
  runTransactionWithRetry
} = require('./shared/db')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ACTIVITY_COLLECTION = 'poem_pancake_activities'
const BOARD_COLLECTION = 'poem_pancake_boards'
const INITIAL_VIEW_SIZE = 15
const EXPAND_PADDING = 2
const RESERVE_DURATION_MS = 8000

function buildCellKey(rowIndex, colIndex) {
  return `r${Number(rowIndex) || 0}c${Number(colIndex) || 0}`
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

function isWithinBounds(rowIndex, colIndex, bounds) {
  const safeBounds = bounds && typeof bounds === 'object' ? bounds : null

  if (!safeBounds) {
    return false
  }

  return Number(rowIndex) >= Number(safeBounds.minRow)
    && Number(rowIndex) <= Number(safeBounds.maxRow)
    && Number(colIndex) >= Number(safeBounds.minCol)
    && Number(colIndex) <= Number(safeBounds.maxCol)
}

function getActiveReservationState(board = {}, nowTimestamp = Date.now()) {
  const sourceReservationMap = board && board.reservationMap && typeof board.reservationMap === 'object'
    ? board.reservationMap
    : {}
  const reservationMap = {}
  const userReservationMap = {}

  Object.keys(sourceReservationMap).forEach((cellKey) => {
    const item = sourceReservationMap[cellKey] && typeof sourceReservationMap[cellKey] === 'object'
      ? sourceReservationMap[cellKey]
      : null
    const openid = normalizeText(item && item.openid)
    const expiresAtTimestamp = toTimestamp(item && item.expiresAt)

    if (!openid || !expiresAtTimestamp || expiresAtTimestamp <= nowTimestamp) {
      return
    }

    reservationMap[cellKey] = {
      openid,
      nickname: normalizeText(item && item.nickname),
      expiresAt: new Date(expiresAtTimestamp)
    }
    userReservationMap[openid] = cellKey
  })

  return {
    reservationMap,
    userReservationMap
  }
}

function buildReservedCellMap(reservationMap = {}, currentOpenid = '') {
  return Object.keys(reservationMap || {}).reduce((result, cellKey) => {
    const item = reservationMap[cellKey]

    result[cellKey] = {
      nickname: normalizeText(item && item.nickname),
      reservedByMe: normalizeText(item && item.openid) === normalizeText(currentOpenid)
    }
    return result
  }, {})
}

async function getUserNickname(openid) {
  try {
    const res = await db.collection('users').where({
      openid
    }).limit(1).get()
    const user = (res.data || [])[0] || {}
    return normalizeText(user.nickName || user.name) || '读书会成员'
  } catch (error) {
    return '读书会成员'
  }
}

exports.main = async (event = {}) => {
  try {
    await ensureCollection(db, ACTIVITY_COLLECTION)
    await ensureCollection(db, BOARD_COLLECTION)

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const activityId = normalizeText(event.activityId)
    const rowIndex = Number(event.rowIndex)
    const colIndex = Number(event.colIndex)

    if (!activityId) {
      return {
        success: false,
        message: '缺少活动信息'
      }
    }

    if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) {
      return {
        success: false,
        message: '字位坐标无效'
      }
    }

    const nickname = await getUserNickname(openid)
    const cellKey = buildCellKey(rowIndex, colIndex)
    const nowTimestamp = Date.now()
    const expiresAt = new Date(nowTimestamp + RESERVE_DURATION_MS)
    const result = await runTransactionWithRetry(db, async (transaction) => {
      const activityRes = await transaction.collection(ACTIVITY_COLLECTION).doc(activityId).get()
      const activity = activityRes.data || null

      if (!activity) {
        throw new Error('活动不存在')
      }

      if (normalizeText(activity.status) !== 'published') {
        throw new Error('当前活动暂时不能落字')
      }

      if (toTimestamp(getActivityStartValue(activity)) && toTimestamp(getActivityStartValue(activity)) > nowTimestamp) {
        throw new Error('活动还未开始，请稍后再来落字')
      }

      if (toTimestamp(getActivityDeadlineValue(activity)) && toTimestamp(getActivityDeadlineValue(activity)) <= nowTimestamp) {
        throw new Error('活动已截止')
      }

      const boardRes = await transaction.collection(BOARD_COLLECTION).doc(activity.boardId).get()
      const board = boardRes.data || null

      if (!board) {
        throw new Error('活动画板不存在')
      }

      const cellsMap = board.cellsMap && typeof board.cellsMap === 'object'
        ? board.cellsMap
        : {}
      const existingCell = cellsMap[cellKey] && typeof cellsMap[cellKey] === 'object'
        ? cellsMap[cellKey]
        : null

      if (existingCell && normalizeText(existingCell.openid) && normalizeText(existingCell.openid) !== openid) {
        throw new Error('这个位置已经有人写过了')
      }

      const currentDisplayBounds = buildDisplayBounds(computeFilledBounds(cellsMap))

      if (!isWithinBounds(rowIndex, colIndex, currentDisplayBounds)) {
        throw new Error('请在当前画板可见范围内落字')
      }

      const activeState = getActiveReservationState(board, nowTimestamp)
      const reservationMap = {
        ...activeState.reservationMap
      }
      const userReservationMap = {
        ...activeState.userReservationMap
      }
      const existingReservation = reservationMap[cellKey]

      if (existingReservation && normalizeText(existingReservation.openid) !== openid) {
        return {
          success: false,
          message: '这个位置正在占位中',
          reservedCellMap: buildReservedCellMap(reservationMap, openid),
          myReservedCellKey: normalizeText(userReservationMap[openid])
        }
      }

      const currentReservedCellKey = normalizeText(userReservationMap[openid])

      if (currentReservedCellKey && currentReservedCellKey !== cellKey) {
        delete reservationMap[currentReservedCellKey]
        delete userReservationMap[openid]
      }

      reservationMap[cellKey] = {
        openid,
        nickname,
        expiresAt
      }
      userReservationMap[openid] = cellKey

      await transaction.collection(BOARD_COLLECTION).doc(activity.boardId).update({
        data: {
          reservationMap,
          userReservationMap,
          updatedAt: new Date()
        }
      })

      return {
        success: true,
        message: '',
        reservedCellMap: buildReservedCellMap(reservationMap, openid),
        myReservedCellKey: cellKey,
        reserveExpiresAt: expiresAt
      }
    })

    return result
  } catch (error) {
    console.error('reservePoemPancakeCell error:', error)
    return {
      success: false,
      message: error.message || '占位失败'
    }
  }
}
