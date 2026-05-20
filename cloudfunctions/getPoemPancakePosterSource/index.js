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

function formatActivityTimeRange(startAt, deadlineAt) {
  const startText = formatDateTime(startAt)
  const deadlineText = formatDateTime(deadlineAt)

  if (startText && deadlineText) {
    return `${startText} - ${deadlineText}`
  }

  return deadlineText || startText || '时间待定'
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

async function getUserProfile(openid) {
  try {
    const res = await db.collection('users').where({
      openid
    }).limit(1).get()
    const user = (res.data || [])[0] || {}

    return {
      avatarUrl: normalizeText(user.avatarUrl),
      nickName: normalizeText(user.nickName || user.name) || '读书会成员'
    }
  } catch (error) {
    if (isCollectionNotExistError(error)) {
      return {
        avatarUrl: '',
        nickName: '读书会成员'
      }
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
    const activity = await ensureActivityFinalized(activityRes.data || null)

    if (!activity) {
      return {
        success: false,
        message: '活动不存在'
      }
    }

    const board = await getBoardById(activity.boardId)
    const isFrozenActivity = ['closed', 'archived'].includes(normalizeText(activity.status))
    const cellsMap = isFrozenActivity && activity.finalBoard
      ? activity.finalBoard
      : (board && board.cellsMap && typeof board.cellsMap === 'object' ? board.cellsMap : {})
    const userCellKeysMap = board && board.userCellKeysMap && typeof board.userCellKeysMap === 'object'
      ? board.userCellKeysMap
      : {}
    const myCellKeyList = resolveUserCellKeyList(cellsMap, userCellKeysMap, openid)
    const userProfile = await getUserProfile(openid)

    const startValue = getActivityStartValue(activity)
    const deadlineValue = getActivityDeadlineValue(activity)

    return {
      success: true,
      source: {
        activityId: activity._id || '',
        themeText: normalizeText(activity.theme) || normalizeText(activity.title) || '诗词摊煎饼',
        activityTimeText: formatActivityTimeRange(startValue, deadlineValue),
        shareTimeText: `分享时间  ${formatDateTime(new Date())}`,
        shareUserAvatar: normalizeText(userProfile.avatarUrl),
        shareUserName: normalizeText(userProfile.nickName),
        contributionText: `贡献度  ${countFilledCells(cellsMap) ? Number(((myCellKeyList.length / countFilledCells(cellsMap)) * 100).toFixed(1)) : 0}%`,
        totalCharsText: `当前总字数  ${countFilledCells(cellsMap)}`,
        cellsMap,
        displayBounds: isFrozenActivity && activity.finalBounds
          ? buildDisplayBounds(activity.finalBounds, activity.finalBounds.rowCount || INITIAL_VIEW_SIZE, 0)
          : buildDisplayBounds(computeFilledBounds(cellsMap))
      }
    }
  } catch (error) {
    console.error('getPoemPancakePosterSource error:', error)
    return {
      success: false,
      message: error.message || '海报数据加载失败'
    }
  }
}
