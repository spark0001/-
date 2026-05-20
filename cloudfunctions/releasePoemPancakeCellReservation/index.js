const cloud = require('wx-server-sdk')
const {
  normalizeText,
  toTimestamp
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

exports.main = async (event = {}) => {
  try {
    await ensureCollection(db, ACTIVITY_COLLECTION)
    await ensureCollection(db, BOARD_COLLECTION)

    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const activityId = normalizeText(event.activityId)
    const targetCellKey = normalizeText(event.cellKey)
    const nowTimestamp = Date.now()

    if (!activityId) {
      return {
        success: false,
        message: '缺少活动信息'
      }
    }

    await runTransactionWithRetry(db, async (transaction) => {
      const activityRes = await transaction.collection(ACTIVITY_COLLECTION).doc(activityId).get()
      const activity = activityRes.data || null

      if (!activity || !activity.boardId) {
        return
      }

      const boardRes = await transaction.collection(BOARD_COLLECTION).doc(activity.boardId).get()
      const board = boardRes.data || null

      if (!board) {
        return
      }

      const activeState = getActiveReservationState(board, nowTimestamp)
      const reservationMap = {
        ...activeState.reservationMap
      }
      const userReservationMap = {
        ...activeState.userReservationMap
      }
      const reservedCellKey = normalizeText(userReservationMap[openid])

      if (!reservedCellKey) {
        await transaction.collection(BOARD_COLLECTION).doc(activity.boardId).update({
          data: {
            reservationMap,
            userReservationMap,
            updatedAt: new Date()
          }
        })
        return
      }

      if (targetCellKey && targetCellKey !== reservedCellKey) {
        return
      }

      delete reservationMap[reservedCellKey]
      delete userReservationMap[openid]

      await transaction.collection(BOARD_COLLECTION).doc(activity.boardId).update({
        data: {
          reservationMap,
          userReservationMap,
          updatedAt: new Date()
        }
      })
    })

    return {
      success: true
    }
  } catch (error) {
    console.error('releasePoemPancakeCellReservation error:', error)
    return {
      success: false,
      message: error.message || '释放占位失败'
    }
  }
}
