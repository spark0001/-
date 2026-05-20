const {
  buildBoardRows,
  buildContributionRateText,
  buildMyCellKeyMap,
  decorateActivityTimeState,
  normalizeText
} = require('../../utils/poemPancake')

const BOARD_CELL_SIZE_RPX = 56
const INLINE_SUBMIT_DELAY = 80
const ASCII_INLINE_SUBMIT_DELAY = 480
const RESERVATION_SYNC_INTERVAL = 2500
const RESERVATION_SYNC_ERROR_BACKOFF = 6000
const POST_SUBMIT_SYNC_DELAY = 4000

function shouldAutoSubmitChar(char) {
  const safeChar = normalizeText(char)
  return Array.from(safeChar).length === 1
}

function getAutoSubmitDelay(char) {
  const safeChar = normalizeText(char)
  return /^[A-Za-z0-9]$/.test(safeChar) ? ASCII_INLINE_SUBMIT_DELAY : INLINE_SUBMIT_DELAY
}

function decorateBoardRowsWithEditor(boardRows = [], editingCellKey = '', reservedCellMap = {}) {
  const safeEditingCellKey = normalizeText(editingCellKey)

  return (Array.isArray(boardRows) ? boardRows : []).map((row) => ({
    ...row,
    cellList: (Array.isArray(row.cellList) ? row.cellList : []).map((cell) => {
      const isEditing = safeEditingCellKey && cell.key === safeEditingCellKey
      const reservedData = reservedCellMap && typeof reservedCellMap[cell.key] === 'object'
        ? reservedCellMap[cell.key]
        : null

      return {
        ...cell,
        reserved: !cell.filled && !!reservedData,
        reservedByMe: !!(reservedData && reservedData.reservedByMe),
        reservedText: reservedData && reservedData.reservedByMe ? '编辑中' : '占位中',
        isEditing
      }
    })
  }))
}

function buildDetailViewModel(payload = {}, editorState = {}) {
  const cellsMap = payload.cellsMap && typeof payload.cellsMap === 'object'
    ? payload.cellsMap
    : {}
  const displayBounds = payload.displayBounds && typeof payload.displayBounds === 'object'
    ? payload.displayBounds
    : {
      minRow: -7,
      maxRow: 7,
      minCol: -7,
      maxCol: 7,
      rowCount: 15,
      colCount: 15
    }
  const myCellKeyList = Array.isArray(payload.myCellKeyList) ? payload.myCellKeyList : []
  const myCharCount = Number(payload.myCharCount) || 0
  const totalChars = Number(payload.totalChars) || Object.keys(cellsMap).length
  const myCellKeyMap = buildMyCellKeyMap(myCellKeyList)
  const reservedCellMap = payload.reservedCellMap && typeof payload.reservedCellMap === 'object'
    ? payload.reservedCellMap
    : {}
  const activity = payload.activity && typeof payload.activity === 'object'
    ? decorateActivityTimeState(payload.activity)
    : null
  const boardRows = buildBoardRows(cellsMap, displayBounds, myCellKeyMap)

  return {
    activity,
    cellsMap,
    reservedCellMap,
    displayBounds,
    boardRows: decorateBoardRowsWithEditor(boardRows, editorState.editingCellKey, reservedCellMap),
    myCellKeyList,
    myReservedCellKey: normalizeText(payload.myReservedCellKey),
    myCharCount,
    totalChars,
    contributionRateText: buildContributionRateText(myCharCount, totalChars),
    boardWidthRpx: displayBounds.colCount * BOARD_CELL_SIZE_RPX,
    boardHeightRpx: displayBounds.rowCount * BOARD_CELL_SIZE_RPX,
    reserveDurationMs: Number(payload.reserveDurationMs) || 1500
  }
}

module.exports = {
  BOARD_CELL_SIZE_RPX,
  RESERVATION_SYNC_INTERVAL,
  RESERVATION_SYNC_ERROR_BACKOFF,
  POST_SUBMIT_SYNC_DELAY,
  shouldAutoSubmitChar,
  getAutoSubmitDelay,
  decorateBoardRowsWithEditor,
  buildDetailViewModel
}
