const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000
const READING_INCENTIVE_TARGET_DAYS = 10

function normalizeText(value) {
  return String(value || '').trim()
}

function isValidArticleUrl(url) {
  return /^https?:\/\//i.test(normalizeText(url))
}

function normalizeArticleUrl(url) {
  const safeUrl = normalizeText(url)

  if (!isValidArticleUrl(safeUrl)) {
    return safeUrl
  }

  if (safeUrl.indexOf('mp.weixin.qq.com/') === -1 || safeUrl.indexOf('#wechat_redirect') !== -1) {
    return safeUrl
  }

  return `${safeUrl}#wechat_redirect`
}

function toTimestamp(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.getTime()
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function getChinaDateParts(value) {
  const timestamp = toTimestamp(value)

  if (!timestamp) {
    return null
  }

  const date = new Date(timestamp + CHINA_TIME_OFFSET)

  return {
    year: date.getUTCFullYear(),
    month: padNumber(date.getUTCMonth() + 1),
    day: padNumber(date.getUTCDate())
  }
}

function normalizeDayKey(value) {
  const safeValue = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? safeValue : ''
}

function buildDayKeyFromDateParts(dateParts) {
  if (!dateParts) {
    return ''
  }

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`
}

function buildDayKey(item) {
  const createdAtDayKey = buildDayKeyFromDateParts(getChinaDateParts(item && item.createdAt))

  if (createdAtDayKey) {
    return createdAtDayKey
  }

  return normalizeDayKey(item && item.dayKey)
}

function isValidDate(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return false
  }

  const parsedDate = new Date(`${dateText} 00:00`.replace(/-/g, '/'))
  return !Number.isNaN(parsedDate.getTime())
}

function isValidTime(timeText) {
  if (!/^\d{2}:\d{2}$/.test(timeText)) {
    return false
  }

  const parts = timeText.split(':')
  const hour = Number(parts[0])
  const minute = Number(parts[1])

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function getTimestamp(dateText, timeText) {
  const dateTokens = String(dateText || '').split('-').map((item) => Number(item))
  const timeTokens = String(timeText || '').split(':').map((item) => Number(item))
  const year = dateTokens[0]
  const month = dateTokens[1]
  const day = dateTokens[2]
  const hour = timeTokens[0]
  const minute = timeTokens[1]

  if (
    !Number.isFinite(year)
    || !Number.isFinite(month)
    || !Number.isFinite(day)
    || !Number.isFinite(hour)
    || !Number.isFinite(minute)
  ) {
    return Number.NaN
  }

  return Date.UTC(year, month - 1, day, hour - 8, minute)
}

function buildPermissionInfo(userRecord) {
  const role = userRecord ? userRecord.role || 'guest' : 'guest'
  const superAdmin = typeof (userRecord && userRecord.superAdmin) === 'boolean'
    ? userRecord.superAdmin
    : false
  const activityPermission = typeof (userRecord && userRecord.activityPermission) === 'boolean'
    ? userRecord.activityPermission
    : false
  const rewardPermission = typeof (userRecord && userRecord.rewardPermission) === 'boolean'
    ? userRecord.rewardPermission
    : (superAdmin || activityPermission)

  return {
    role,
    superAdmin,
    dataPermission: typeof (userRecord && userRecord.dataPermission) === 'boolean'
      ? userRecord.dataPermission
      : false,
    activityPermission,
    rewardPermission,
    imageUploadPermission: true
  }
}

function normalizeTemplateType(value) {
  if (value === 'template2' || value === 'template3') {
    return value
  }

  return 'template1'
}

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function canBeReadingIncentiveActivity(activityMode, activityType) {
  return activityMode === 'offline' && activityType !== 'rewardClaim'
}

function isMemberUser(userRecord) {
  const role = normalizeText(userRecord && userRecord.role)
  return !!(userRecord && userRecord.status === 'approved' && (role === 'member' || role === 'admin'))
}

function isCurrentReadingIncentiveActivity(activity) {
  return !!(
    activity
    && activity.status === 'published'
    && activity.isCurrentReadingIncentive === true
    && normalizeActivityMode(activity.activityMode) === 'offline'
    && normalizeActivityType(activity.activityType) !== 'rewardClaim'
  )
}

function selectCurrentReadingIncentiveActivity(activityList) {
  return (activityList || [])
    .filter(isCurrentReadingIncentiveActivity)
    .sort((a, b) => {
      const bTimestamp = toTimestamp(b && (b.updatedAt || b.createdAt)) || 0
      const aTimestamp = toTimestamp(a && (a.updatedAt || a.createdAt)) || 0
      return bTimestamp - aTimestamp
    })[0] || null
}

function getCurrentRewardMeta(currentDate = new Date()) {
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')

  return {
    monthKey: `${year}-${month}`,
    rewardLabel: `${year}年${month}月奖励`
  }
}

function normalizeTemplateData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

async function getAllRecords(collectionName, whereData) {
  const pageSize = 100
  let skip = 0
  let records = []

  while (true) {
    let query = db.collection(collectionName)

    if (whereData && Object.keys(whereData).length) {
      query = query.where(whereData)
    }

    const res = await query
      .skip(skip)
      .limit(pageSize)
      .get()

    const currentBatch = res.data || []

    records = records.concat(currentBatch)

    if (currentBatch.length < pageSize) {
      break
    }

    skip += currentBatch.length
  }

  return records
}

async function clearOtherCurrentReadingIncentiveActivities(currentActivityId) {
  const safeCurrentActivityId = normalizeText(currentActivityId)

  if (!safeCurrentActivityId) {
    return
  }

  const currentActivityList = await getAllRecords('activities', {
    isCurrentReadingIncentive: true
  }).catch(() => [])

  const targetActivityList = (currentActivityList || []).filter((item) => {
    return normalizeText(item && item._id) && normalizeText(item && item._id) !== safeCurrentActivityId
  })

  if (!targetActivityList.length) {
    return
  }

  await Promise.all(targetActivityList.map((item) => {
    return db.collection('activities').doc(item._id).update({
      data: {
        isCurrentReadingIncentive: false,
        updatedAt: new Date()
      }
    })
  }))
}

function buildActivityDayRange(activity) {
  const startDayKey = normalizeDayKey(activity && activity.startDate) || buildDayKey({
    createdAt: Number(activity && activity.sortTime) ? new Date(Number(activity.sortTime)) : null
  })
  const endDayKey = normalizeDayKey(activity && activity.endDate)
    || normalizeDayKey(activity && activity.startDate)
    || buildDayKey({
      createdAt: Number(activity && activity.endSortTime) ? new Date(Number(activity.endSortTime)) : null
    })
    || startDayKey

  return {
    startDayKey,
    endDayKey
  }
}

function isDayInClosedRange(dayKey, startDayKey, endDayKey) {
  return !!(dayKey && startDayKey && endDayKey && dayKey >= startDayKey && dayKey <= endDayKey)
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

function normalizeEffectMode(value) {
  return value === 'scheduled' ? 'scheduled' : 'immediate'
}

function normalizeThresholdType(value) {
  return value === 'consecutive' ? 'consecutive' : 'accumulated'
}

function selectCurrentReadingIncentiveRule(ruleList) {
  return ensureArray(ruleList)
    .filter((item) => item && item.isActive === true)
    .slice()
    .sort((a, b) => {
      const bTimestamp = toTimestamp(b && (b.updatedAt || b.createdAt || b.effectAt)) || 0
      const aTimestamp = toTimestamp(a && (a.updatedAt || a.createdAt || a.effectAt)) || 0
      return bTimestamp - aTimestamp
    })[0] || null
}

async function activateDueReadingIncentiveRule(ruleList, currentTimestamp = Date.now()) {
  const safeRuleList = ensureArray(ruleList)
  const dueRule = safeRuleList
    .filter((item) => {
      const effectAt = toTimestamp(item && item.effectAt)
      return normalizeEffectMode(item && item.effectMode) === 'scheduled'
        && item.isActive !== true
        && !!effectAt
        && effectAt <= currentTimestamp
    })
    .slice()
    .sort((a, b) => {
      const bEffectAt = toTimestamp(b && b.effectAt) || 0
      const aEffectAt = toTimestamp(a && a.effectAt) || 0
      return bEffectAt - aEffectAt
    })[0] || null

  if (!dueRule || !dueRule._id) {
    return safeRuleList
  }

  const now = new Date(currentTimestamp)
  const dueRuleId = normalizeText(dueRule._id)
  const updates = []

  safeRuleList.forEach((item) => {
    const ruleDocId = normalizeText(item && item._id)

    if (!ruleDocId) {
      return
    }

    if (ruleDocId === dueRuleId && item.isActive !== true) {
      updates.push(
        db.collection('reading_incentive_rules').doc(ruleDocId).update({
          data: {
            isActive: true,
            updatedAt: now
          }
        })
      )
      item.isActive = true
      item.updatedAt = now
      return
    }

    if (ruleDocId !== dueRuleId && item.isActive === true) {
      updates.push(
        db.collection('reading_incentive_rules').doc(ruleDocId).update({
          data: {
            isActive: false,
            updatedAt: now
          }
        })
      )
      item.isActive = false
      item.updatedAt = now
    }
  })

  if (updates.length) {
    await Promise.all(updates)
  }

  return safeRuleList
}

function buildDateFromDayKey(dayKey) {
  const safeDayKey = normalizeDayKey(dayKey)

  if (!safeDayKey) {
    return null
  }

  const parts = safeDayKey.split('-').map((item) => Number(item))

  if (parts.length !== 3 || parts.some((item) => !Number.isFinite(item))) {
    return null
  }

  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
}

function getDayDiff(previousDayKey, nextDayKey) {
  const previousDate = buildDateFromDayKey(previousDayKey)
  const nextDate = buildDateFromDayKey(nextDayKey)

  if (!previousDate || !nextDate) {
    return Number.MAX_SAFE_INTEGER
  }

  return Math.round((nextDate.getTime() - previousDate.getTime()) / (24 * 60 * 60 * 1000))
}

function getAccumulatedCompletedCount(dayKeyList) {
  return ensureArray(dayKeyList).length
}

function getConsecutiveCompletedCount(dayKeyList) {
  const safeDayKeyList = ensureArray(dayKeyList)

  if (!safeDayKeyList.length) {
    return 0
  }

  let currentCount = 0
  let maxCount = 0
  let previousDayKey = ''

  safeDayKeyList.forEach((dayKey) => {
    if (!previousDayKey) {
      currentCount = 1
      maxCount = 1
      previousDayKey = dayKey
      return
    }

    const diff = getDayDiff(previousDayKey, dayKey)

    if (diff === 1) {
      currentCount += 1
    } else {
      currentCount = 1
    }

    if (currentCount > maxCount) {
      maxCount = currentCount
    }

    previousDayKey = dayKey
  })

  return maxCount
}

function getRuleCompletedCount(dayKeyList, thresholdType) {
  return normalizeThresholdType(thresholdType) === 'consecutive'
    ? getConsecutiveCompletedCount(dayKeyList)
    : getAccumulatedCompletedCount(dayKeyList)
}

async function buildQualifiedOpenidListByCurrentReadingIncentive() {
  const [userList, readingLogList, readingRuleList] = await Promise.all([
    getAllRecords('users', {
      status: 'approved'
    }).catch(() => []),
    getAllRecords('reading_logs').catch(() => []),
    getAllRecords('reading_incentive_rules').catch((queryError) => {
      if (!isCollectionNotExistError(queryError)) {
        throw queryError
      }

      return []
    }).catch(() => [])
  ])
  const safeReadingRuleList = await activateDueReadingIncentiveRule(readingRuleList || []).catch((error) => {
    console.error('activateDueReadingIncentiveRule error:', error)
    return ensureArray(readingRuleList)
  })
  const currentReadingIncentiveRule = selectCurrentReadingIncentiveRule(safeReadingRuleList)
  const incentiveActivityId = normalizeText(currentReadingIncentiveRule && currentReadingIncentiveRule.activityId)
  const incentiveActivityRes = incentiveActivityId
    ? await db.collection('activities').doc(incentiveActivityId).get().catch(() => ({ data: null }))
    : { data: null }
  const incentiveActivity = incentiveActivityRes.data || null

  if (!currentReadingIncentiveRule || !incentiveActivity || !incentiveActivity._id) {
    return []
  }

  const memberOpenidMap = {}

  ;(userList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (openid && isMemberUser(item)) {
      memberOpenidMap[openid] = true
    }
  })

  const requireOfflineAttendance = currentReadingIncentiveRule.requireOfflineAttendance !== false
  const eligibleOpenidMap = {}

  ;(Array.isArray(incentiveActivity.registrations) ? incentiveActivity.registrations : []).forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (!openid || !memberOpenidMap[openid]) {
      return
    }

    if (!requireOfflineAttendance || item.attended === true) {
      eligibleOpenidMap[openid] = true
    }
  })

  const activityId = normalizeText(incentiveActivity && incentiveActivity._id)
  const { startDayKey, endDayKey } = buildActivityDayRange(incentiveActivity)
  const openidDayMap = {}

  ;(readingLogList || []).forEach((item) => {
    const openid = normalizeText(item && item.openid)
    const dayKey = buildDayKey(item)

    if (
      !openid
      || !memberOpenidMap[openid]
      || (requireOfflineAttendance && !eligibleOpenidMap[openid])
      || normalizeText(item && item.activityId) !== activityId
      || !isDayInClosedRange(dayKey, startDayKey, endDayKey)
    ) {
      return
    }

    if (!openidDayMap[openid]) {
      openidDayMap[openid] = {}
    }

    openidDayMap[openid][dayKey] = true
  })

  return Object.keys(openidDayMap).filter((openid) => {
    const completedCount = getRuleCompletedCount(
      Object.keys(openidDayMap[openid] || {}).sort(),
      currentReadingIncentiveRule && currentReadingIncentiveRule.thresholdType
    )
    const targetCount = Number(currentReadingIncentiveRule && currentReadingIncentiveRule.thresholdValue) > 0
      ? Number(currentReadingIncentiveRule.thresholdValue)
      : READING_INCENTIVE_TARGET_DAYS

    return completedCount >= targetCount
  })
}

async function autoRegisterQualifiedMembersToRewardActivity(rewardActivity) {
  const rewardActivityId = normalizeText(rewardActivity && rewardActivity._id)

  if (!rewardActivityId || normalizeActivityType(rewardActivity && rewardActivity.activityType) !== 'rewardClaim') {
    return 0
  }

  const qualifiedOpenidList = await buildQualifiedOpenidListByCurrentReadingIncentive()

  if (!qualifiedOpenidList.length) {
    return 0
  }

  const registrations = Array.isArray(rewardActivity && rewardActivity.registrations)
    ? rewardActivity.registrations.slice()
    : []
  const registeredOpenidMap = {}

  registrations.forEach((item) => {
    const openid = normalizeText(item && item.openid)

    if (openid) {
      registeredOpenidMap[openid] = true
    }
  })

  const now = new Date()
  const appendedRegistrations = qualifiedOpenidList
    .filter((openid) => !registeredOpenidMap[openid])
    .map((openid) => {
      return {
        openid,
        createdAt: now,
        autoRegistered: true,
        registerSource: 'system:autoReward'
      }
    })

  if (!appendedRegistrations.length) {
    return 0
  }

  const nextRegistrations = registrations.concat(appendedRegistrations)

  await db.collection('activities').doc(rewardActivityId).update({
    data: {
      registrations: nextRegistrations,
      registrationCount: nextRegistrations.length,
      updatedAt: now
    }
  })

  return appendedRegistrations.length
}

function buildPublishPayload(event) {
  const hasPublishSchedule = !!event.hasPublishSchedule
  const publishDate = normalizeText(event.publishDate)
  const publishTime = normalizeText(event.publishTime)

  if (!hasPublishSchedule) {
    return {
      success: true,
      publishAt: 0
    }
  }

  if (!publishDate || !publishTime) {
    return {
      success: false,
      message: '请完整选择发布时间'
    }
  }

  if (!isValidDate(publishDate) || !isValidTime(publishTime)) {
    return {
      success: false,
      message: '发布时间格式不正确'
    }
  }

  return {
    success: true,
    publishAt: getTimestamp(publishDate, publishTime)
  }
}

function buildTimePayload(event) {
  const timeType = normalizeText(event.timeType) || 'singlePoint'
  const startDate = normalizeText(event.startDate)
  const endDate = normalizeText(event.endDate)
  const startTimeInput = normalizeText(event.startTime)
  const endTimeInput = normalizeText(event.endTime)
  const hasExactTime = !!event.hasExactTime

  if (timeType === 'singlePoint') {
    if (!startDate) {
      return {
        success: false,
        message: '请完整选择活动时间'
      }
    }

    if (!isValidDate(startDate) || !isValidTime(startTimeInput)) {
      return {
        success: false,
        message: '活动时间格式不正确'
      }
    }

    const timestamp = getTimestamp(startDate, startTimeInput)

    return {
      success: true,
      timePayload: {
        timeType,
        startDate,
        endDate: startDate,
        startTime: startTimeInput,
        endTime: startTimeInput,
        hasExactTime: true,
        sortTime: timestamp
      }
    }
  }

  if (timeType === 'singleDayRange') {
    if (!startDate || !startTimeInput || !endTimeInput) {
      return {
        success: false,
        message: '请完整选择活动时间'
      }
    }

    if (!isValidDate(startDate) || !isValidTime(startTimeInput) || !isValidTime(endTimeInput)) {
      return {
        success: false,
        message: '活动时间格式不正确'
      }
    }

    const startTimestamp = getTimestamp(startDate, startTimeInput)
    const endTimestamp = getTimestamp(startDate, endTimeInput)

    if (endTimestamp < startTimestamp) {
      return {
        success: false,
        message: '结束时间不能早于开始时间'
      }
    }

    return {
      success: true,
      timePayload: {
        timeType,
        startDate,
        endDate: startDate,
        startTime: startTimeInput,
        endTime: endTimeInput,
        hasExactTime: true,
        sortTime: startTimestamp
      }
    }
  }

  if (timeType === 'dateRange') {
    if (!startDate || !endDate) {
      return {
        success: false,
        message: '请完整选择活动日期范围'
      }
    }

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return {
        success: false,
        message: '活动日期格式不正确'
      }
    }

    const defaultStartTimestamp = getTimestamp(startDate, '00:00')
    const defaultEndTimestamp = getTimestamp(endDate, '23:59')

    if (defaultEndTimestamp < defaultStartTimestamp) {
      return {
        success: false,
        message: '结束日期不能早于开始日期'
      }
    }

    const startTime = hasExactTime ? startTimeInput : '00:00'
    const endTime = hasExactTime ? endTimeInput : '23:59'

    if (hasExactTime && (!isValidTime(startTime) || !isValidTime(endTime))) {
      return {
        success: false,
        message: '具体时间格式不正确'
      }
    }

    const startTimestamp = getTimestamp(startDate, startTime)
    const endTimestamp = getTimestamp(endDate, endTime)

    if (endTimestamp < startTimestamp) {
      return {
        success: false,
        message: '结束时间不能早于开始时间'
      }
    }

    return {
      success: true,
      timePayload: {
        timeType,
        startDate,
        endDate,
        startTime,
        endTime,
        hasExactTime,
        sortTime: startTimestamp
      }
    }
  }

  return {
    success: false,
    message: '不支持的活动时间模式'
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const activityId = normalizeText(event.activityId)
  const title = normalizeText(event.title)
  const location = normalizeText(event.location)
  const description = normalizeText(event.description)
  const theme = normalizeText(event.theme)
  const activityMode = normalizeActivityMode(event.activityMode)
  const activityType = normalizeActivityType(event.activityType)
  const officialAccountUrl = normalizeArticleUrl(event.officialAccountUrl)
  const coverUrl = normalizeText(event.coverUrl)
  const displayConfigInput = event.displayConfig && typeof event.displayConfig === 'object'
    ? event.displayConfig
    : {}
  const displayConfig = {
    templateType: normalizeTemplateType(displayConfigInput.templateType),
    templateData: normalizeTemplateData(displayConfigInput.templateData)
  }

  const userRes = await db.collection('users')
    .where({
      openid
    })
    .limit(1)
    .get()

  const userRecord = (userRes.data && userRes.data[0]) || null
  const permissionInfo = buildPermissionInfo(userRecord)

  if (!permissionInfo.activityPermission) {
    return {
      success: false,
      message: '当前账号没有活动管理权限'
    }
  }

  if (!title) {
    return {
      success: false,
      message: '活动标题不能为空'
    }
  }

  if (!theme) {
    return {
      success: false,
      message: '活动主题不能为空'
    }
  }

  if (officialAccountUrl && !isValidArticleUrl(officialAccountUrl)) {
    return {
      success: false,
      message: '相关公众号链接格式不正确'
    }
  }

  const timeResult = buildTimePayload(event)

  if (!timeResult.success) {
    return timeResult
  }

  const publishResult = buildPublishPayload(event)

  if (!publishResult.success) {
    return publishResult
  }

  try {
    let existingActivity = null

    if (activityId) {
      const existedRes = await db.collection('activities').doc(activityId).get()
      existingActivity = existedRes.data || null

      if (!existingActivity) {
        return {
          success: false,
          message: '活动不存在'
        }
      }
    }

    const inputReadingIncentiveActivity = normalizeBoolean(event.isReadingIncentiveActivity, null)
    const preservedReadingIncentiveActivity = !!(
      existingActivity
      && (
        existingActivity.isReadingIncentiveActivity === true
        || existingActivity.isCurrentReadingIncentive === true
      )
    )
    const canUseReadingIncentiveActivity = canBeReadingIncentiveActivity(activityMode, activityType)
    const isReadingIncentiveActivity = canUseReadingIncentiveActivity
      && (
        inputReadingIncentiveActivity === null
          ? preservedReadingIncentiveActivity
          : inputReadingIncentiveActivity === true
      )
    const isCurrentReadingIncentive = isReadingIncentiveActivity

    if (inputReadingIncentiveActivity === true && activityMode !== 'offline') {
      return {
        success: false,
        message: '当前激励阅读关联活动必须是线下活动'
      }
    }

    if (inputReadingIncentiveActivity === true && activityType === 'rewardClaim') {
      return {
        success: false,
        message: '奖励领取活动不能设置为激励阅读关联活动'
      }
    }

    const now = new Date()
    const rewardMeta = getCurrentRewardMeta(now)
    const payload = {
      title,
      location,
      description,
      theme,
      officialAccountUrl,
      activityMode,
      activityType,
      rewardMonthKey: activityType === 'rewardClaim'
        ? (normalizeText(event.rewardMonthKey) || rewardMeta.monthKey)
        : '',
      rewardLabel: activityType === 'rewardClaim'
        ? (normalizeText(event.rewardLabel) || rewardMeta.rewardLabel)
        : '',
      isReadingIncentiveActivity,
      isCurrentReadingIncentive,
      coverUrl,
      displayConfig,
      publishAt: publishResult.publishAt,
      status: 'published',
      updatedAt: now,
      ...timeResult.timePayload
    }

    if (activityId) {
      await db.collection('activities').doc(activityId).update({
        data: {
          ...payload,
          timeText: _.remove(),
          activityTime: _.remove(),
          endSortTime: _.remove()
        }
      })

      if (isCurrentReadingIncentive) {
        await clearOtherCurrentReadingIncentiveActivities(activityId)
      }

      if (activityType === 'rewardClaim') {
        await autoRegisterQualifiedMembersToRewardActivity({
          ...(existingActivity || {}),
          _id: activityId,
          activityType,
          registrations: Array.isArray(existingActivity && existingActivity.registrations)
            ? existingActivity.registrations
            : []
        }).catch((error) => {
          console.error('autoRegisterQualifiedMembersToRewardActivity on update error:', error)
        })
      }

      return {
        success: true,
        message: '活动更新成功',
        activityId
      }
    }

    const addRes = await db.collection('activities').add({
      data: {
        ...payload,
        registrations: [],
        registrationCount: 0,
        createdBy: openid,
        createdAt: now
      }
    })

    if (isCurrentReadingIncentive) {
      await clearOtherCurrentReadingIncentiveActivities(addRes._id)
    }

    if (activityType === 'rewardClaim') {
      await autoRegisterQualifiedMembersToRewardActivity({
        ...payload,
        _id: addRes._id,
        registrations: []
      }).catch((error) => {
        console.error('autoRegisterQualifiedMembersToRewardActivity on create error:', error)
      })
    }

    return {
      success: true,
      message: '活动创建成功',
      activityId: addRes._id
    }
  } catch (error) {
    return {
      success: false,
      message: '活动保存失败',
      error: error.message || error
    }
  }
}
