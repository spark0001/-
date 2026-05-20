const cloud = require('wx-server-sdk')
const {
  normalizeText,
  toTimestamp,
  getActivityStartValue,
  getActivityDeadlineValue
} = require('./shared/poemPancakeTime')
const {
  ensureCollection,
  getFirstRecord,
  isCollectionNotExistError,
  runTransactionWithRetry
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
const PLAY_LOG_COLLECTION = 'poem_pancake_play_logs'
const INITIAL_VIEW_SIZE = 15
const EXPAND_PADDING = 2
const RESERVE_DURATION_MS = 8000

async function getUserNickname(openid) {
  try {
    const user = await getFirstRecord(db, 'users', { openid }) || {}
    return normalizeText(user.nickName || user.name) || '读书会成员'
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return '读书会成员'
    }

    throw error
  }
}

function buildCellKey(rowIndex, colIndex) {
  return `r${Number(rowIndex) || 0}c${Number(colIndex) || 0}`
}

function isValidPoemCharacter(value) {
  const safeValue = normalizeText(value)

  return /^[\u3400-\u9FFF\uF900-\uFAFFA-Za-z0-9，。！？；：、“”‘’（）《》〈〉【】〔〕—…,.!?;:()\-·]$/.test(safeValue)
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

function countFilledCells(cellsMap = {}) {
  return Object.keys(cellsMap || {}).length
}

function countUserCount(userCellKeysMap = {}) {
  return Object.keys(userCellKeysMap || {}).filter((openid) => {
    return Array.isArray(userCellKeysMap[openid]) && userCellKeysMap[openid].length
  }).length
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

async function finalizeActivity(activity, board) {
  const safeActivity = activity && typeof activity === 'object' ? activity : null
  const safeBoard = board && typeof board === 'object' ? board : null

  if (!safeActivity || !safeBoard) {
    return
  }

  const cellsMap = safeBoard.cellsMap && typeof safeBoard.cellsMap === 'object'
    ? safeBoard.cellsMap
    : {}
  const snapshotData = buildFinalSnapshotData(cellsMap, safeBoard.userCellKeysMap || {})

  await persistActivityFinalSnapshot(db, ACTIVITY_COLLECTION, safeActivity._id, snapshotData)
}

exports.main = async (event = {}) => {
  try {
    await ensureCollection(db, ACTIVITY_COLLECTION)
    await ensureCollection(db, BOARD_COLLECTION)
    await ensureCollection(db, PLAY_LOG_COLLECTION)

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const activityId = normalizeText(event.activityId)
    const rowIndex = Number(event.rowIndex)
    const colIndex = Number(event.colIndex)
    const actionType = normalizeText(event.actionType) === 'delete' ? 'delete' : 'upsert'
    const normalizedContent = normalizeText(event.content)
    const charList = Array.from(normalizedContent)

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

    if (actionType !== 'delete' && charList.length !== 1) {
      return {
        success: false,
        message: '每次只能填写 1 个字'
      }
    }

    if (actionType !== 'delete' && !isValidPoemCharacter(charList[0])) {
      return {
        success: false,
        message: '请填写一个常规可展示字符'
      }
    }

    const activityRes = await db.collection(ACTIVITY_COLLECTION).doc(activityId).get()
    const activity = activityRes.data || null

    if (!activity) {
      return {
        success: false,
        message: '活动不存在'
      }
    }

    const boardRes = await db.collection(BOARD_COLLECTION).doc(activity.boardId).get()
    const board = boardRes.data || null

    if (!board) {
      return {
        success: false,
        message: '活动画板不存在'
      }
    }

    if (activity.status !== 'published') {
      return {
        success: false,
        message: '当前活动不可再提交'
      }
    }

    if (toTimestamp(getActivityStartValue(activity)) && toTimestamp(getActivityStartValue(activity)) > Date.now()) {
      return {
        success: false,
        message: '活动还未开始，请稍后再来落字'
      }
    }

    if (toTimestamp(getActivityDeadlineValue(activity)) && toTimestamp(getActivityDeadlineValue(activity)) <= Date.now()) {
      await finalizeActivity(activity, board)
      return {
        success: false,
        message: '活动已截止'
      }
    }

    const cellKey = buildCellKey(rowIndex, colIndex)
    const nickname = await getUserNickname(openid)
    const result = await runTransactionWithRetry(db, async (transaction) => {
      const nowTimestamp = Date.now()
      const freshActivityRes = await transaction.collection(ACTIVITY_COLLECTION).doc(activityId).get()
      const freshActivity = freshActivityRes.data || null

      if (!freshActivity) {
        throw new Error('活动不存在')
      }

      if (freshActivity.status !== 'published') {
        throw new Error('当前活动不可再提交')
      }

      if (toTimestamp(getActivityStartValue(freshActivity)) && toTimestamp(getActivityStartValue(freshActivity)) > Date.now()) {
        throw new Error('活动还未开始，请稍后再来落字')
      }

      if (toTimestamp(getActivityDeadlineValue(freshActivity)) && toTimestamp(getActivityDeadlineValue(freshActivity)) <= Date.now()) {
        throw new Error('活动已截止')
      }

      const freshBoardRes = await transaction.collection(BOARD_COLLECTION).doc(freshActivity.boardId).get()
      const freshBoard = freshBoardRes.data || null

      if (!freshBoard) {
        throw new Error('活动画板不存在')
      }

      const cellsMap = freshBoard.cellsMap && typeof freshBoard.cellsMap === 'object'
        ? { ...freshBoard.cellsMap }
        : {}
      const userCellKeysMap = freshBoard.userCellKeysMap && typeof freshBoard.userCellKeysMap === 'object'
        ? { ...freshBoard.userCellKeysMap }
        : {}
      const activeReservationState = getActiveReservationState(freshBoard, nowTimestamp)
      const reservationMap = {
        ...activeReservationState.reservationMap
      }
      const userReservationMap = {
        ...activeReservationState.userReservationMap
      }
      const currentDisplayBounds = buildDisplayBounds(computeFilledBounds(cellsMap))
      const existingCell = cellsMap[cellKey]
      const previousContent = normalizeText(existingCell && existingCell.content)
      const isNewCell = !existingCell
      const shouldDelete = actionType === 'delete'
      const shouldPersistChange = shouldDelete
        ? !!existingCell
        : (isNewCell || previousContent !== charList[0])

      if (!isWithinBounds(rowIndex, colIndex, currentDisplayBounds)) {
        throw new Error('请在当前画板可见范围内落字')
      }

      if (existingCell && normalizeText(existingCell.openid) && normalizeText(existingCell.openid) !== openid) {
        throw new Error('这个位置已经有人写过了')
      }

      if (shouldDelete && (!existingCell || normalizeText(existingCell.openid) !== openid)) {
        throw new Error('只能删除自己写过的字')
      }

      const cellReservation = reservationMap[cellKey]
      const reservedByOther = cellReservation && normalizeText(cellReservation.openid) !== openid

      if (reservedByOther) {
        throw new Error('这个位置正在占位中')
      }

      if (!existingCell || !normalizeText(existingCell.openid) || normalizeText(existingCell.openid) === openid) {
        if (!cellReservation || normalizeText(cellReservation.openid) !== openid) {
          throw new Error(`占位已超时，请重新点一下格子（${RESERVE_DURATION_MS}ms 占位）`)
        }
      }

      const currentUserKeyList = Array.isArray(userCellKeysMap[openid])
        ? userCellKeysMap[openid].slice()
        : []

      if (!shouldPersistChange) {
        return {
          actionType: shouldDelete ? 'delete' : (isNewCell ? 'create' : 'update'),
          filledCount: countFilledCells(cellsMap),
          userCount: countUserCount(userCellKeysMap)
        }
      }

      if (shouldDelete) {
        delete cellsMap[cellKey]
        const ownCellIndex = currentUserKeyList.indexOf(cellKey)

        if (ownCellIndex >= 0) {
          currentUserKeyList.splice(ownCellIndex, 1)
        }

        if (currentUserKeyList.length) {
          userCellKeysMap[openid] = currentUserKeyList
        } else {
          delete userCellKeysMap[openid]
        }
      } else {
        if (currentUserKeyList.indexOf(cellKey) === -1) {
          currentUserKeyList.push(cellKey)
        }

        userCellKeysMap[openid] = currentUserKeyList
        cellsMap[cellKey] = {
          content: charList[0],
          openid,
          nickname,
          updatedAt: new Date()
        }
      }

      delete reservationMap[cellKey]
      delete userReservationMap[openid]

      const filledBounds = computeFilledBounds(cellsMap)
      const now = new Date()

      await transaction.collection(BOARD_COLLECTION).doc(freshActivity.boardId).update({
        data: {
          cellsMap,
          userCellKeysMap,
          reservationMap,
          userReservationMap,
          updatedAt: now
        }
      })

      await transaction.collection(ACTIVITY_COLLECTION).doc(activityId).update({
        data: {
          filledCount: countFilledCells(cellsMap),
          userCount: countUserCount(userCellKeysMap),
          minFilledRow: filledBounds ? filledBounds.minRow : null,
          maxFilledRow: filledBounds ? filledBounds.maxRow : null,
          minFilledCol: filledBounds ? filledBounds.minCol : null,
          maxFilledCol: filledBounds ? filledBounds.maxCol : null,
          updatedAt: now
        }
      })

      await transaction.collection(PLAY_LOG_COLLECTION).add({
        data: {
          activityId,
          boardId: freshActivity.boardId,
          cellKey,
          openid,
          actionType: shouldDelete ? 'delete' : (isNewCell ? 'create' : 'update'),
          createdCharCount: shouldDelete
            ? 0
            : (isNewCell ? 1 : 0),
          content: shouldDelete ? '' : charList[0],
          createdAt: now
        }
      })

      return {
        actionType: shouldDelete ? 'delete' : (isNewCell ? 'create' : 'update'),
        filledCount: countFilledCells(cellsMap),
        userCount: countUserCount(userCellKeysMap)
      }
    })

    return {
      success: true,
      ...result
    }
  } catch (error) {
    console.error('submitPoemPancakeCell error:', error)
    return {
      success: false,
      message: error.message || '提交失败'
    }
  }
}
