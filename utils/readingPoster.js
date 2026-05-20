const { getCachedAccessDecision } = require('./profileSupplement')

const SHARE_POSTER_SOURCE_KEY = 'sharePosterSourceV2'
const LEGACY_READING_POSTER_SOURCE_KEY = 'readingPosterSource'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSharePosterType(value) {
  return value === 'life' || value === 'reward' ? value : 'reading'
}

function toTimestamp(value) {
  if (!value) {
    return 0
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 0
  }

  return date.getTime()
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDate(timestamp) {
  const safeTimestamp = Number(timestamp) || 0

  if (!safeTimestamp) {
    return ''
  }

  const date = new Date(safeTimestamp)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function resolveCheckInDate(record) {
  const dayKey = normalizeText(record && (record.checkInDate || record.dayKey))

  if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return dayKey
  }

  return formatDate(record && record.createdAt)
}

function resolveReadingReflectionText(record) {
  const insight = normalizeText(record && record.insight)
  const excerpt = normalizeText(record && record.excerpt)

  if (insight && excerpt) {
    return `感想：${insight}\n\n摘录：${excerpt}`
  }

  return insight || excerpt
}

function resolveReadingMetricText(record) {
  const metricPartList = []
  const duration = Number(record && record.duration) || 0
  const pagesOrChapter = normalizeText(record && record.pagesOrChapter)

  if (duration > 0) {
    metricPartList.push(`阅读时长 ${duration} 分钟`)
  }

  if (pagesOrChapter) {
    metricPartList.push(pagesOrChapter)
  }

  return metricPartList.join(' · ')
}

function resolveImageList(record) {
  return Array.isArray(record && record.images)
    ? record.images.map((item) => normalizeText(item)).filter(Boolean)
    : []
}

function resolvePosterUserInfo(explicitUserInfo) {
  const safeUserInfo = explicitUserInfo && typeof explicitUserInfo === 'object'
    ? explicitUserInfo
    : {}
  const app = typeof getApp === 'function' ? getApp() : null
  const globalUserInfo = app && app.globalData && app.globalData.userInfo
    ? app.globalData.userInfo
    : {}
  const cachedDecision = getCachedAccessDecision()
  const cachedUserInfo = cachedDecision && cachedDecision.canAccess && cachedDecision.userInfo
    ? cachedDecision.userInfo
    : {}

  return {
    nickname: normalizeText(
      safeUserInfo.nickName
      || safeUserInfo.nickname
      || safeUserInfo.name
      || globalUserInfo.nickName
      || globalUserInfo.nickname
      || globalUserInfo.name
      || cachedUserInfo.nickName
      || cachedUserInfo.nickname
      || cachedUserInfo.name
    ) || '读书会成员',
    avatarUrl: normalizeText(
      safeUserInfo.avatarUrl
      || safeUserInfo.avatar
      || globalUserInfo.avatarUrl
      || globalUserInfo.avatar
      || cachedUserInfo.avatarUrl
      || cachedUserInfo.avatar
    )
  }
}

function resolveShareTitle(record, type) {
  if (type === 'reading') {
    return normalizeText(record && record.bookTitle) || '未填写书名'
  }

  if (type === 'reward') {
    return normalizeText(record && record.title) || '奖励晒单'
  }

  return normalizeText(record && record.title) || '生活分享'
}

function resolveShareContentTitle(record, type) {
  if (type !== 'reading') {
    return ''
  }

  const explicitTitle = normalizeText(record && (record.contentTitle || record.title))
  const insight = normalizeText(record && record.insight)
  const excerpt = normalizeText(record && record.excerpt)

  if (explicitTitle) {
    return explicitTitle
  }

  if (insight) {
    return '感悟'
  }

  if (excerpt) {
    return '摘抄'
  }

  return '一句话感悟或者摘抄'
}

function resolveShareSecondaryText(record, type) {
  if (type === 'reading') {
    return normalizeText(record && record.author)
  }

  return normalizeText(record && record.activityTitle)
}

function resolveShareDate(record, type) {
  if (type === 'reading') {
    return resolveCheckInDate(record)
  }

  const explicitDate = normalizeText(record && record.checkInDate)

  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) {
    return explicitDate
  }

  return formatDate(record && record.createdAt)
}

function resolveShareReflectionText(record, type) {
  if (type === 'reading') {
    return resolveReadingReflectionText(record)
  }

  return normalizeText(record && (record.content || record.summary || record.reflectionText))
}

function resolveShareMetricText(record, type, imageList) {
  if (type === 'reading') {
    return resolveReadingMetricText(record)
  }

  const imageCount = Array.isArray(imageList) ? imageList.length : 0

  if (imageCount > 0) {
    return type === 'reward'
      ? `奖励图片 ${imageCount} 张`
      : `分享图片 ${imageCount} 张`
  }

  return ''
}

function buildSharePosterSource(record, explicitUserInfo) {
  const safeRecord = record && typeof record === 'object' ? record : {}
  const type = normalizeSharePosterType(safeRecord.type)
  const imageList = resolveImageList(safeRecord)
  const posterUserInfo = resolvePosterUserInfo(explicitUserInfo)
  const checkInDate = resolveShareDate(safeRecord, type)
  const resolvedContentTitle = resolveShareContentTitle(safeRecord, type)

  return {
    _id: normalizeText(
      safeRecord._id
      || safeRecord.readingLogId
      || safeRecord.lifeShareId
      || safeRecord.rewardShareId
    ) || `${type}-${Date.now()}`,
    type,
    title: type === 'reading'
      ? resolvedContentTitle
      : normalizeText(safeRecord.title || safeRecord.contentTitle),
    bookTitle: resolveShareTitle(safeRecord, type),
    contentTitle: resolvedContentTitle,
    author: resolveShareSecondaryText(safeRecord, type),
    checkInDate,
    dayKey: checkInDate,
    createdAt: toTimestamp(safeRecord.createdAt) || Date.now(),
    insight: normalizeText(safeRecord.insight),
    excerpt: normalizeText(safeRecord.excerpt),
    content: normalizeText(safeRecord.content),
    reflectionText: resolveShareReflectionText(safeRecord, type),
    nickname: posterUserInfo.nickname,
    avatarUrl: posterUserInfo.avatarUrl,
    duration: Number(safeRecord.duration) || 0,
    pagesOrChapter: normalizeText(safeRecord.pagesOrChapter),
    readingMetric: resolveShareMetricText(safeRecord, type, imageList),
    coverUrl: normalizeText(safeRecord.coverUrl || imageList[0]),
    images: imageList,
    activityId: normalizeText(safeRecord.activityId),
    activityTitle: normalizeText(safeRecord.activityTitle)
  }
}

function buildReadingPosterSource(record, explicitUserInfo) {
  return buildSharePosterSource({
    ...(record || {}),
    type: 'reading'
  }, explicitUserInfo)
}

function cacheSharePosterSource(source) {
  try {
    wx.setStorageSync(SHARE_POSTER_SOURCE_KEY, source)
  } catch (error) {
    console.error('cacheSharePosterSource error:', error)
  }
}

function cacheReadingPosterSource(source) {
  cacheSharePosterSource(source)
}

function readPosterSourceByKey(storageKey) {
  try {
    const source = wx.getStorageSync(storageKey)
    return source && typeof source === 'object' ? source : null
  } catch (error) {
    console.error('readPosterSourceByKey error:', error)
  }

  return null
}

function readSharePosterSource(recordId, type) {
  try {
    const source = readPosterSourceByKey(SHARE_POSTER_SOURCE_KEY) || readPosterSourceByKey(LEGACY_READING_POSTER_SOURCE_KEY)

    if (!source) {
      return null
    }

    const sourceId = normalizeText(source._id)
    const sourceType = normalizeSharePosterType(source.type)
    const targetId = normalizeText(recordId)
    const targetType = normalizeText(type)

    if (targetId && sourceId && sourceId !== targetId) {
      return null
    }

    if (targetType && sourceType !== normalizeSharePosterType(targetType)) {
      return null
    }

    return buildSharePosterSource(source)
  } catch (error) {
    console.error('readSharePosterSource error:', error)
  }

  return null
}

function readReadingPosterSource(recordId) {
  return readSharePosterSource(recordId, 'reading')
}

module.exports = {
  SHARE_POSTER_SOURCE_KEY,
  READING_POSTER_SOURCE_KEY: SHARE_POSTER_SOURCE_KEY,
  buildSharePosterSource,
  buildReadingPosterSource,
  cacheSharePosterSource,
  cacheReadingPosterSource,
  readSharePosterSource,
  readReadingPosterSource
}
