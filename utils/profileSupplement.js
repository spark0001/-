const ACCESS_CACHE_KEY = 'tabApprovedAccessCache'
// 用户状态缓存时间：5 分钟（原 30 秒太短，会导致频繁请求）
const ACCESS_CACHE_MAX_AGE = 5 * 60 * 1000
const REQUIRED_PROFILE_FIELDS = ['birthday', 'signature']

function normalizeText(value) {
  return String(value || '').trim()
}

function buildCachedApprovedUserInfo(source) {
  const status = normalizeText(source && (source.status || source.userStatus))

  if (status !== 'approved') {
    return null
  }

  return {
    status: 'approved',
    name: normalizeText(source && source.name),
    contact: normalizeText(source && source.contact),
    gradeMajor: normalizeText(source && source.gradeMajor),
    birthday: normalizeText(source && source.birthday),
    signature: normalizeText(source && source.signature),
    profileSupplementPrompted: source && source.profileSupplementPrompted === true
  }
}

function syncGlobalUserInfo(userInfo) {
  try {
    if (!userInfo || typeof getApp !== 'function') {
      return
    }

    const app = getApp()

    if (!app) {
      return
    }

    app.globalData = app.globalData || {}
    app.globalData.userInfo = {
      ...(app.globalData.userInfo || {}),
      ...userInfo,
      birthday: normalizeText(userInfo.birthday),
      signature: normalizeText(userInfo.signature)
    }
  } catch (error) {
    console.error('syncGlobalUserInfo error:', error)
  }
}

function getCachedAccessDecision() {
  try {
    const cacheData = wx.getStorageSync(ACCESS_CACHE_KEY)

    if (!cacheData || typeof cacheData !== 'object') {
      return null
    }

    if (!cacheData.updatedAt || Date.now() - Number(cacheData.updatedAt) > ACCESS_CACHE_MAX_AGE) {
      return null
    }

    if (cacheData.userStatus === 'approved') {
      return {
        canAccess: true,
        userInfo: buildCachedApprovedUserInfo(cacheData)
      }
    }

    return {
      canAccess: false,
      redirectUrl: cacheData.hasApplication ? '/pages/guest-status/guest-status' : '/pages/apply/apply'
    }
  } catch (error) {
    console.error('getCachedAccessDecision error:', error)
    return null
  }
}

function setCachedAccessDecision(userInfo, applicationInfo) {
  try {
    wx.setStorageSync(ACCESS_CACHE_KEY, {
      updatedAt: Date.now(),
      userStatus: normalizeText(userInfo && userInfo.status),
      hasApplication: !!(applicationInfo && applicationInfo.hasApplication),
      name: normalizeText(userInfo && userInfo.name),
      contact: normalizeText(userInfo && userInfo.contact),
      gradeMajor: normalizeText(userInfo && userInfo.gradeMajor),
      birthday: normalizeText(userInfo && userInfo.birthday),
      signature: normalizeText(userInfo && userInfo.signature),
      profileSupplementPrompted: !!(userInfo && userInfo.profileSupplementPrompted === true)
    })
  } catch (error) {
    console.error('setCachedAccessDecision error:', error)
  }

  syncGlobalUserInfo(userInfo)
}

function normalizeAccessResult(res, fallbackMessage = '账号状态获取失败') {
  const result = res && res.result ? res.result : {}
  const userInfo = result.userInfo || {}
  const applicationInfo = result.applicationInfo || {}

  if (!result.success) {
    throw new Error(result.message || fallbackMessage)
  }

  setCachedAccessDecision(userInfo, applicationInfo)

  return {
    result,
    userInfo,
    applicationInfo
  }
}

function callAccessStatusFunction(name, fallbackMessage) {
  return wx.cloud.callFunction({
    name
  }).then((res) => normalizeAccessResult(res, fallbackMessage))
}

function fetchAccessDecision() {
  return callAccessStatusFunction('getMyCenterData', '账号状态获取失败').catch((error) => {
    console.warn('getMyCenterData failed, fallback to getAccessStatus:', error)
    return callAccessStatusFunction('getAccessStatus', '账号状态获取失败')
  })
}

function isProfileSupplementComplete(userInfo) {
  return REQUIRED_PROFILE_FIELDS.every((fieldName) => {
    return !!normalizeText(userInfo && userInfo[fieldName])
  })
}

function shouldPromptProfileSupplement(userInfo) {
  return !!(
    userInfo
    && normalizeText(userInfo.status) === 'approved'
    && !isProfileSupplementComplete(userInfo)
  )
}

function refreshMyCenterUserInfo() {
  return fetchAccessDecision().then(({ userInfo, applicationInfo }) => {
    return {
      userInfo,
      applicationInfo
    }
  })
}

function resolveLatestUserInfoForProfileSupplement(userInfo) {
  if (!shouldPromptProfileSupplement(userInfo)) {
    return Promise.resolve(userInfo || null)
  }

  return refreshMyCenterUserInfo().then((result) => {
    const latestUserInfo = result && result.userInfo ? result.userInfo : null
    return latestUserInfo && normalizeText(latestUserInfo.status) === 'approved'
      ? latestUserInfo
      : null
  }).catch((error) => {
    console.error('resolveLatestUserInfoForProfileSupplement error:', error)
    return null
  })
}

module.exports = {
  REQUIRED_PROFILE_FIELDS,
  getCachedAccessDecision,
  setCachedAccessDecision,
  fetchAccessDecision,
  isProfileSupplementComplete,
  shouldPromptProfileSupplement,
  refreshMyCenterUserInfo,
  resolveLatestUserInfoForProfileSupplement
}
