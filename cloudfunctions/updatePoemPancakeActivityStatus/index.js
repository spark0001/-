const cloud = require('wx-server-sdk')
const {
  normalizeText,
  toTimestamp,
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

exports.main = async (event = {}) => {
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

    const activityId = normalizeText(event.activityId)
    const targetStatus = ['published', 'closed', 'archived'].includes(normalizeText(event.targetStatus))
      ? normalizeText(event.targetStatus)
      : ''

    if (!activityId || !targetStatus) {
      return {
        success: false,
        message: '缺少状态更新参数'
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

    if (targetStatus === 'published' && toTimestamp(getActivityDeadlineValue(activity)) <= Date.now()) {
      return {
        success: false,
        message: '已过截止时间，不能再发布'
      }
    }

    if (targetStatus === 'published' && normalizeText(activity.status) === 'archived') {
      return {
        success: false,
        message: '已归档活动不能重新发布'
      }
    }

    const board = await getBoardById(activity.boardId)
    const cellsMap = board && board.cellsMap && typeof board.cellsMap === 'object'
      ? board.cellsMap
      : {}
    const userCellKeysMap = board && board.userCellKeysMap && typeof board.userCellKeysMap === 'object'
      ? board.userCellKeysMap
      : {}
    const now = new Date()
    const updateData = {
      status: targetStatus,
      updatedAt: now,
      updatedBy: openid
    }

    if (targetStatus === 'closed' || targetStatus === 'archived') {
      Object.assign(updateData, buildFinalSnapshotData(cellsMap, userCellKeysMap, {
        status: targetStatus,
        now,
        updatedBy: openid
      }))
    }

    if (targetStatus === 'closed' || targetStatus === 'archived') {
      await persistActivityFinalSnapshot(db, ACTIVITY_COLLECTION, activityId, updateData)
    } else {
      await db.collection(ACTIVITY_COLLECTION).doc(activityId).update({
        data: updateData
      })
    }

    return {
      success: true,
      activityId
    }
  } catch (error) {
    console.error('updatePoemPancakeActivityStatus error:', error)
    return {
      success: false,
      message: error.message || '状态更新失败'
    }
  }
}
