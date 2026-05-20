const cloud = require('wx-server-sdk')
const {
  normalizeText,
  buildChinaDate,
  formatDateTime
} = require('./shared/poemPancakeTime')
const {
  ensureCollection,
  getFirstRecord
} = require('./shared/db')
const {
  buildInitialFinalBounds
} = require('./shared/poemPancakeBoard')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ACTIVITY_COLLECTION = 'poem_pancake_activities'
const BOARD_COLLECTION = 'poem_pancake_boards'

function canManagePoemPancake(userRecord) {
  return !!(userRecord && (userRecord.superAdmin || (userRecord.role === 'admin' && userRecord.status === 'approved')))
}

async function getManagerUserRecord(openid) {
  return getFirstRecord(db, 'users', { openid })
}

function parseDateInput(value) {
  const safeValue = normalizeText(value).replace(/[/.]/g, '-').replace('T', ' ')

  if (!safeValue) {
    return null
  }

  const exactMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/.exec(safeValue)

  if (exactMatch) {
    const year = Number(exactMatch[1])
    const month = Number(exactMatch[2]) - 1
    const day = Number(exactMatch[3])
    const hour = Number(exactMatch[4] || 0)
    const minute = Number(exactMatch[5] || 0)
    const second = Number(exactMatch[6] || 0)
    const date = buildChinaDate(year, month, day, hour, minute, second)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const date = new Date(safeValue.replace(/-/g, '/'))
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeDateTimeText(value, fallbackDate = null) {
  const parsedDate = parseDateInput(value)

  if (parsedDate) {
    return formatDateTime(parsedDate)
  }

  if (fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())) {
    return formatDateTime(fallbackDate)
  }

  return ''
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
    const title = normalizeText(event.title)
    const theme = normalizeText(event.theme)
    const description = normalizeText(event.description)
    const startAtInput = normalizeText(event.startAt)
    const deadlineAtInput = normalizeText(event.deadlineAt)
    const startAt = parseDateInput(startAtInput) || new Date()
    const deadlineAt = parseDateInput(deadlineAtInput)
    const startAtText = normalizeDateTimeText(startAtInput, startAt)
    const deadlineAtText = normalizeDateTimeText(deadlineAtInput)
    const requestedStatus = ['draft', 'published'].includes(normalizeText(event.status))
      ? normalizeText(event.status)
      : 'draft'

    if (!title) {
      return {
        success: false,
        message: '请先填写活动标题'
      }
    }

    if (!deadlineAt) {
      return {
        success: false,
        message: '请填写有效的截止时间'
      }
    }

    if (deadlineAt.getTime() <= startAt.getTime()) {
      return {
        success: false,
        message: '截止时间需要晚于开始时间'
      }
    }

    const now = new Date()

    if (activityId) {
      const activityRes = await db.collection(ACTIVITY_COLLECTION).doc(activityId).get()
      const activity = activityRes.data || null

      if (!activity) {
        return {
          success: false,
          message: '活动不存在'
        }
      }

      const currentStatus = normalizeText(activity.status) || 'draft'
      const nextStatus = requestedStatus

      if (nextStatus === 'published' && deadlineAt.getTime() <= Date.now()) {
        return {
          success: false,
          message: '已过截止时间，不能直接发布'
        }
      }

      if (!['closed', 'archived'].includes(currentStatus) && (Number(activity.filledCount) || 0) > 0) {
        return {
          success: false,
          message: '已有成员落字的活动暂不支持直接编辑，请新建一场活动'
        }
      }

      await db.collection(ACTIVITY_COLLECTION).doc(activityId).update({
        data: {
          title,
          theme,
          description,
          startAt,
          deadlineAt,
          startAtText,
          deadlineAtText,
          status: nextStatus,
          updatedAt: now,
          updatedBy: openid
        }
      })

      return {
        success: true,
        activityId,
        savedStatus: nextStatus
      }
    }

    if (requestedStatus === 'published' && deadlineAt.getTime() <= Date.now()) {
      return {
        success: false,
        message: '已过截止时间，不能直接发布'
      }
    }

    const addRes = await db.collection(ACTIVITY_COLLECTION).add({
      data: {
        title,
        theme,
        description,
        startAt,
        deadlineAt,
        startAtText,
        deadlineAtText,
        status: requestedStatus,
        filledCount: 0,
        userCount: 0,
        finalBoard: {},
        finalBounds: buildInitialFinalBounds(),
        boardId: '',
        createdAt: now,
        createdBy: openid,
        updatedAt: now,
        updatedBy: openid
      }
    })

    const createdActivityId = addRes._id || ''
    const boardRes = await db.collection(BOARD_COLLECTION).add({
      data: {
        activityId: createdActivityId,
        cellsMap: {},
        userCellKeysMap: {},
        reservationMap: {},
        userReservationMap: {},
        createdAt: now,
        updatedAt: now
      }
    })

    await db.collection(ACTIVITY_COLLECTION).doc(createdActivityId).update({
      data: {
        boardId: boardRes._id || ''
      }
    })

    return {
      success: true,
      activityId: createdActivityId,
      savedStatus: requestedStatus
    }
  } catch (error) {
    console.error('savePoemPancakeActivity error:', error)
    return {
      success: false,
      message: error.message || '诗词摊煎饼活动保存失败'
    }
  }
}
