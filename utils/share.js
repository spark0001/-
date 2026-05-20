function normalizeText(value) {
  return String(value == null ? '' : value).trim()
}

/**
 * 分享工具模块
 * 用于构建微信小程序的分享配置（好友分享和朋友圈分享）
 */

/** 分享落地页：首页 */
const SHARE_LANDING_HOME = 'home'
/** 分享落地页：创作互动页 */
const SHARE_LANDING_CREATE = 'create'
/** 分享落地页：活动详情页 */
const SHARE_LANDING_ACTIVITY_DETAIL = 'activityDetail'

/**
 * 规范化分享落地页参数
 * @param {string} value - 原始落地页参数
 * @returns {string} - 合法的落地页标识（home/create/activityDetail）或空字符串
 */
function normalizeShareLanding(value) {
  const safeValue = normalizeText(value)

  if (
    safeValue === SHARE_LANDING_HOME
    || safeValue === SHARE_LANDING_CREATE
    || safeValue === SHARE_LANDING_ACTIVITY_DETAIL
  ) {
    return safeValue
  }

  return ''
}

/**
 * 构建分享 query 参数，包含分享落地页信息
 * @param {object} query - 原始 query 参数
 * @param {string} shareLanding - 分享落地页标识
 * @returns {object} - 包含 shareEntry 和 shareLanding 的 query 对象
 */
function buildShareQuery(query = {}, shareLanding = '') {
  const safeLanding = normalizeShareLanding(shareLanding)

  if (!safeLanding) {
    return {
      ...(query || {})
    }
  }

  return {
    ...(query || {}),
    shareEntry: '1',
    shareLanding: safeLanding
  }
}

function buildQueryString(query = {}) {
  return Object.keys(query).reduce((result, key) => {
    const value = query[key]
    const safeValue = normalizeText(value)

    if (!safeValue) {
      return result
    }

    result.push(`${encodeURIComponent(key)}=${encodeURIComponent(safeValue)}`)
    return result
  }, []).join('&')
}

function buildPagePath(pagePath, query = {}) {
  const safePath = normalizeText(pagePath) || '/pages/home/home'
  const queryString = buildQueryString(query)

  return queryString ? `${safePath}?${queryString}` : safePath
}

function showPageShareMenu(options = {}) {
  if (typeof wx.showShareMenu !== 'function') {
    return
  }

  const enableTimeline = options.timeline !== false

  try {
    wx.showShareMenu({
      menus: enableTimeline
        ? ['shareAppMessage', 'shareTimeline']
        : ['shareAppMessage']
    })
  } catch (error) {
    console.warn('showShareMenu failed:', error)
  }
}

function buildShareAppMessage(options = {}) {
  const payload = {
    title: normalizeText(options.title) || '校园读书会',
    path: buildPagePath(options.path, buildShareQuery(options.query, options.shareLanding))
  }
  const imageUrl = normalizeText(options.imageUrl)

  if (imageUrl) {
    payload.imageUrl = imageUrl
  }

  return payload
}

function buildShareTimeline(options = {}) {
  const payload = {
    title: normalizeText(options.title) || '校园读书会'
  }
  const query = buildQueryString(buildShareQuery(options.query, options.shareLanding))
  const imageUrl = normalizeText(options.imageUrl)

  if (query) {
    payload.query = query
  }

  if (imageUrl) {
    payload.imageUrl = imageUrl
  }

  return payload
}

function pickShareImage(...valueList) {
  for (let index = 0; index < valueList.length; index += 1) {
    const safeValue = normalizeText(valueList[index])

    if (safeValue) {
      return safeValue
    }
  }

  return ''
}

function getShareOpenInfo(options = {}) {
  return {
    fromShare: normalizeText(options.shareEntry) === '1',
    shareLanding: normalizeShareLanding(options.shareLanding)
  }
}

module.exports = {
  SHARE_LANDING_HOME,
  SHARE_LANDING_CREATE,
  SHARE_LANDING_ACTIVITY_DETAIL,
  buildShareAppMessage,
  buildShareTimeline,
  getShareOpenInfo,
  pickShareImage,
  showPageShareMenu
}
