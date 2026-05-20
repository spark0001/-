const {
  normalizeText,
  parseDateValue,
  toTimestamp,
  formatDateTime
} = require('./poemPancakeTime')

const INITIAL_VIEW_SIZE = 15
const EXPAND_PADDING = 2

function buildCellKey(rowIndex, colIndex) {
  return `r${Number(rowIndex) || 0}c${Number(colIndex) || 0}`
}

function parseCellKey(cellKey) {
  const safeKey = normalizeText(cellKey)
  const match = /^r(-?\d+)c(-?\d+)$/.exec(safeKey)

  if (!match) {
    return null
  }

  return {
    rowIndex: Number(match[1]),
    colIndex: Number(match[2])
  }
}

function getEmptyBounds(size = INITIAL_VIEW_SIZE) {
  const safeSize = Math.max(1, Number(size) || INITIAL_VIEW_SIZE)
  const min = -Math.floor(safeSize / 2)
  const max = min + safeSize - 1

  return {
    minRow: min,
    maxRow: max,
    minCol: min,
    maxCol: max
  }
}

function normalizeBounds(bounds = {}) {
  const safeBounds = bounds && typeof bounds === 'object' ? bounds : {}
  const minRow = Number.isFinite(Number(safeBounds.minRow)) ? Number(safeBounds.minRow) : 0
  const maxRow = Number.isFinite(Number(safeBounds.maxRow)) ? Number(safeBounds.maxRow) : 0
  const minCol = Number.isFinite(Number(safeBounds.minCol)) ? Number(safeBounds.minCol) : 0
  const maxCol = Number.isFinite(Number(safeBounds.maxCol)) ? Number(safeBounds.maxCol) : 0

  return {
    minRow: Math.min(minRow, maxRow),
    maxRow: Math.max(minRow, maxRow),
    minCol: Math.min(minCol, maxCol),
    maxCol: Math.max(minCol, maxCol)
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

function extendBounds(bounds, padding = EXPAND_PADDING) {
  const safeBounds = normalizeBounds(bounds)
  const safePadding = Math.max(0, Number(padding) || 0)

  return {
    minRow: safeBounds.minRow - safePadding,
    maxRow: safeBounds.maxRow + safePadding,
    minCol: safeBounds.minCol - safePadding,
    maxCol: safeBounds.maxCol + safePadding
  }
}

function ensureMinimumBounds(bounds, minSize = INITIAL_VIEW_SIZE) {
  const safeBounds = normalizeBounds(bounds)
  const safeMinSize = Math.max(1, Number(minSize) || INITIAL_VIEW_SIZE)
  let minRow = safeBounds.minRow
  let maxRow = safeBounds.maxRow
  let minCol = safeBounds.minCol
  let maxCol = safeBounds.maxCol
  let height = maxRow - minRow + 1
  let width = maxCol - minCol + 1

  if (height < safeMinSize) {
    const totalPadding = safeMinSize - height
    const topPadding = Math.floor(totalPadding / 2)
    const bottomPadding = totalPadding - topPadding
    minRow -= topPadding
    maxRow += bottomPadding
    height = safeMinSize
  }

  if (width < safeMinSize) {
    const totalPadding = safeMinSize - width
    const leftPadding = Math.floor(totalPadding / 2)
    const rightPadding = totalPadding - leftPadding
    minCol -= leftPadding
    maxCol += rightPadding
    width = safeMinSize
  }

  return {
    minRow,
    maxRow,
    minCol,
    maxCol,
    rowCount: height,
    colCount: width
  }
}

function buildDisplayBounds(bounds = null, options = {}) {
  const minSize = Math.max(1, Number(options.minSize) || INITIAL_VIEW_SIZE)
  const padding = Math.max(0, Number(options.padding) || EXPAND_PADDING)

  if (!bounds) {
    return {
      ...getEmptyBounds(minSize),
      rowCount: minSize,
      colCount: minSize
    }
  }

  return ensureMinimumBounds(extendBounds(bounds, padding), minSize)
}

function buildBoardRows(cellsMap = {}, displayBounds = null, myCellKeyMap = {}, reservedCellMap = {}) {
  const safeBounds = displayBounds && typeof displayBounds === 'object'
    ? displayBounds
    : buildDisplayBounds(null)
  const rows = []

  for (let rowIndex = safeBounds.minRow; rowIndex <= safeBounds.maxRow; rowIndex += 1) {
    const cellList = []

    for (let colIndex = safeBounds.minCol; colIndex <= safeBounds.maxCol; colIndex += 1) {
      const cellKey = buildCellKey(rowIndex, colIndex)
      const cellData = cellsMap && typeof cellsMap[cellKey] === 'object'
        ? cellsMap[cellKey]
        : null
      const content = normalizeText(cellData && cellData.content)
      const reservedData = reservedCellMap && typeof reservedCellMap[cellKey] === 'object'
        ? reservedCellMap[cellKey]
        : null
      const reserved = !content && !!reservedData
      const reservedByMe = reserved && reservedData.reservedByMe === true
      const reservedNickname = normalizeText(reservedData && reservedData.nickname)

      cellList.push({
        key: cellKey,
        rowIndex,
        colIndex,
        content,
        filled: !!content,
        reserved,
        reservedByMe,
        reservedText: reservedByMe ? '编辑中' : '占位中',
        reservedNickname,
        isMine: !!(myCellKeyMap && myCellKeyMap[cellKey]),
        nickname: normalizeText(cellData && cellData.nickname),
        updatedAtText: formatDateTime(cellData && cellData.updatedAt)
      })
    }

    rows.push({
      key: `row-${rowIndex}`,
      rowIndex,
      cellList
    })
  }

  return rows
}

function buildMyCellKeyMap(myCellKeyList = []) {
  return (Array.isArray(myCellKeyList) ? myCellKeyList : []).reduce((result, key) => {
    const safeKey = normalizeText(key)

    if (safeKey) {
      result[safeKey] = true
    }

    return result
  }, {})
}

function countFilledCells(cellsMap = {}) {
  return Object.keys(cellsMap || {}).length
}

function buildContributionRateText(myCount, totalCount) {
  const safeMyCount = Math.max(0, Number(myCount) || 0)
  const safeTotalCount = Math.max(0, Number(totalCount) || 0)

  if (!safeMyCount || !safeTotalCount) {
    return '0%'
  }

  return `${Number(((safeMyCount / safeTotalCount) * 100).toFixed(1))}%`
}

function getActivityStatusText(status, startAt, deadlineAt) {
  const safeStatus = normalizeText(status)

  if (safeStatus === 'archived') {
    return '已归档'
  }

  if (safeStatus === 'closed') {
    return '已截止'
  }

  if (safeStatus === 'draft') {
    return '草稿'
  }

  const startTimestamp = toTimestamp(startAt)
  const deadlineTimestamp = toTimestamp(deadlineAt)
  const now = Date.now()

  if (startTimestamp && startTimestamp > now) {
    return '未开始'
  }

  if (deadlineTimestamp && deadlineTimestamp <= now) {
    return '已截止'
  }

  return '进行中'
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

function formatActivityTimeRange(startAt, deadlineAt) {
  const startText = formatDateTime(startAt)
  const deadlineText = formatDateTime(deadlineAt)

  if (startText && deadlineText) {
    return `${startText} - ${deadlineText}`
  }

  return deadlineText || startText || '时间待定'
}

function canWriteToActivity(activity = {}) {
  const safeActivity = activity && typeof activity === 'object' ? activity : {}
  const safeStatus = normalizeText(safeActivity.status)
  const startTimestamp = toTimestamp(safeActivity.startAtText || safeActivity.startAt)
  const deadlineTimestamp = toTimestamp(safeActivity.deadlineAtText || safeActivity.deadlineAt)
  const now = Date.now()

  if (safeStatus !== 'published') {
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

function buildWriteHint(activity = {}) {
  const safeActivity = activity && typeof activity === 'object' ? activity : {}
  const safeStatus = normalizeText(safeActivity.status)
  const startValue = safeActivity.startAtText || safeActivity.startAt
  const startTimestamp = toTimestamp(startValue)
  const deadlineTimestamp = toTimestamp(safeActivity.deadlineAtText || safeActivity.deadlineAt)
  const now = Date.now()

  if (safeStatus === 'archived') {
    return '活动已归档，这张画板会保留为固定快照。'
  }

  if (safeStatus === 'closed' || (deadlineTimestamp && deadlineTimestamp <= now)) {
    return '活动已截止，画板已经冻结为固定快照。'
  }

  if (startTimestamp && startTimestamp > now) {
    return `活动将在 ${formatDateTime(startValue)} 开始，可先查看当前画板范围。`
  }

  return '点格子后会先短暂占位，输入 1 个字后会真正固定；点自己写过的格子可以改字，清空后可删除。'
}

function decorateActivityTimeState(activity = {}) {
  const safeActivity = activity && typeof activity === 'object' ? activity : {}
  const startValue = safeActivity.startAtText || safeActivity.startAt
  const deadlineValue = safeActivity.deadlineAtText || safeActivity.deadlineAt

  return {
    ...safeActivity,
    statusText: getActivityStatusText(safeActivity.status, startValue, deadlineValue),
    activityTimeText: formatActivityTimeRange(startValue, deadlineValue),
    remainingTimeText: buildRemainingTimeText(startValue, deadlineValue),
    canWrite: canWriteToActivity(safeActivity),
    writeHint: buildWriteHint(safeActivity)
  }
}

module.exports = {
  INITIAL_VIEW_SIZE,
  EXPAND_PADDING,
  normalizeText,
  parseDateValue,
  toTimestamp,
  formatDateTime,
  buildCellKey,
  parseCellKey,
  computeFilledBounds,
  buildDisplayBounds,
  buildBoardRows,
  buildMyCellKeyMap,
  countFilledCells,
  buildContributionRateText,
  getActivityStatusText,
  buildRemainingTimeText,
  formatActivityTimeRange,
  canWriteToActivity,
  buildWriteHint,
  decorateActivityTimeState
}
