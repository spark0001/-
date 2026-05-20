const {
  normalizeText
} = require('./poemPancakeTime')

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

function buildInitialFinalBounds(size = INITIAL_VIEW_SIZE) {
  return buildDisplayBounds(null, size, 0)
}

function countFilledCells(cellsMap = {}) {
  return Object.keys(cellsMap || {}).length
}

function countUserCount(userCellKeysMap = {}) {
  return Object.keys(userCellKeysMap || {}).filter((openid) => {
    return Array.isArray(userCellKeysMap[openid]) && userCellKeysMap[openid].length
  }).length
}

function resolveUserCellKeyList(cellsMap = {}, userCellKeysMap = {}, openid = '') {
  const safeOpenid = normalizeText(openid)
  const keySet = new Set()

  if (!safeOpenid) {
    return []
  }

  const indexedKeyList = Array.isArray(userCellKeysMap && userCellKeysMap[safeOpenid])
    ? userCellKeysMap[safeOpenid]
    : []

  indexedKeyList.forEach((cellKey) => {
    const safeCellKey = normalizeText(cellKey)

    if (safeCellKey) {
      keySet.add(safeCellKey)
    }
  })

  Object.keys(cellsMap || {}).forEach((cellKey) => {
    const cell = cellsMap && typeof cellsMap[cellKey] === 'object'
      ? cellsMap[cellKey]
      : null

    if (normalizeText(cell && cell.openid) === safeOpenid) {
      keySet.add(normalizeText(cellKey))
    }
  })

  return Array.from(keySet)
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

function buildFinalSnapshotData(cellsMap = {}, userCellKeysMap = {}, options = {}) {
  const safeCellsMap = cellsMap && typeof cellsMap === 'object'
    ? cellsMap
    : {}
  const safeUserCellKeysMap = userCellKeysMap && typeof userCellKeysMap === 'object'
    ? userCellKeysMap
    : {}
  const now = options.now instanceof Date && !Number.isNaN(options.now.getTime())
    ? options.now
    : new Date()
  const snapshotData = {
    status: normalizeText(options.status) || 'closed',
    finalBoard: safeCellsMap,
    finalBounds: buildDisplayBounds(computeFilledBounds(safeCellsMap)),
    finalizedAt: now,
    filledCount: countFilledCells(safeCellsMap),
    userCount: countUserCount(safeUserCellKeysMap),
    updatedAt: now
  }

  if (normalizeText(options.updatedBy)) {
    snapshotData.updatedBy = normalizeText(options.updatedBy)
  }

  return snapshotData
}

function isFinalBoundsCompatibilityError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('Cannot create field') !== -1
    && message.indexOf('finalBounds') !== -1
}

async function persistActivityFinalSnapshot(db, collectionName, activityId, snapshotData = {}) {
  const _ = db.command
  const safeActivityId = normalizeText(activityId)
  const safeSnapshotData = snapshotData && typeof snapshotData === 'object'
    ? snapshotData
    : {}
  const safeFinalBoard = safeSnapshotData.finalBoard && typeof safeSnapshotData.finalBoard === 'object'
    ? safeSnapshotData.finalBoard
    : {}
  const safeFinalBounds = safeSnapshotData.finalBounds && typeof safeSnapshotData.finalBounds === 'object'
    ? safeSnapshotData.finalBounds
    : buildInitialFinalBounds()
  const persistData = {
    ...safeSnapshotData,
    finalBoard: _.set(safeFinalBoard),
    finalBounds: _.set(safeFinalBounds)
  }

  try {
    await db.collection(collectionName).doc(safeActivityId).update({
      data: persistData
    })
  } catch (error) {
    if (!isFinalBoundsCompatibilityError(error)) {
      throw error
    }

    // Historical records may have stored finalBounds as null, so remove it before rewriting the full snapshot.
    await db.collection(collectionName).doc(safeActivityId).update({
      data: {
        finalBounds: _.remove()
      }
    })

    await db.collection(collectionName).doc(safeActivityId).update({
      data: persistData
    })
  }
}

module.exports = {
  INITIAL_VIEW_SIZE,
  EXPAND_PADDING,
  computeFilledBounds,
  buildDisplayBounds,
  buildInitialFinalBounds,
  countFilledCells,
  countUserCount,
  resolveUserCellKeyList,
  resolveLiveBounds,
  buildFinalSnapshotData,
  persistActivityFinalSnapshot
}
