const {
  getCachedAccessDecision,
  fetchAccessDecision
} = require('../../utils/profileSupplement')
const {
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization
} = require('../../utils/privacy')
const {
  SHARE_LANDING_CREATE,
  buildShareAppMessage,
  buildShareTimeline,
  showPageShareMenu
} = require('../../utils/share')

const CREATE_EXPOSURE_CACHE_KEY = 'createBlindPoemExposureAt'
const CREATE_EXPOSURE_THROTTLE_MS = 5 * 60 * 1000
const BLIND_POEM_HOME_CACHE_KEY = 'blindPoemHomeCacheV1'
const BLIND_POEM_HOME_PREFETCH_INTERVAL = 60 * 1000

const BLIND_POEM_MODE_OPTIONS = [
  {
    value: 'A',
    modeLabel: '模式A',
    title: '双人各写一句',
    description: '两位写作者各写一句，完成后组合成一首双句短诗。',
    tagline: '一句一句，接住陌生人的灵感。',
    accentClass: 'accent-a'
  },
  {
    value: 'B',
    modeLabel: '模式B',
    title: '上下句互写',
    description: '两位写作者分别完成上句与下句，最终展示为一组上下句结果。',
    tagline: '先有一句，再等另一句来回应。',
    accentClass: 'accent-b'
  },
  {
    value: 'C',
    modeLabel: '模式C',
    title: '同题异写',
    description: '围绕同一主题分别创作，结果页并列展示两份不同作品。',
    tagline: '同一题面，也能写出完全不同的心绪。',
    accentClass: 'accent-c'
  }
]

function buildBlindPoemHomePayload(result) {
  const availableModes = Array.isArray(result && result.availableModes) ? result.availableModes : []

  return {
    modeOptions: BLIND_POEM_MODE_OPTIONS.filter((item) => {
      return availableModes.indexOf(item.value) !== -1
    }),
    historyPreview: Array.isArray(result && result.list) ? result.list.slice(0, 3) : [],
    featuredList: Array.isArray(result && result.featuredList) ? result.featuredList : [],
    totalParticipationCount: Number(result && result.totalParticipationCount) || 0
  }
}

// pages/create/create.js
Page({
  data: {
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad() {
    showPageShareMenu()
  },

  onShow() {
    this.syncTabBarSelected(1)

    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        return
      }

      this.ensureApprovedAccess().then((canAccess) => {
        if (!canAccess) {
          return
        }

        this.maybeReportBlindPoemExposure()
        this.prefetchBlindPoemHome()
      })
    })
  },

  syncTabBarSelected(index) {
    if (typeof this.getTabBar !== 'function') {
      return
    }

    const tabBar = this.getTabBar()

    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(index)
    }
  },

  ensureApprovedAccess() {
    const cachedDecision = getCachedAccessDecision()

    if (cachedDecision) {
      if (cachedDecision.canAccess) {
        return Promise.resolve(true)
      }

      wx.reLaunch({
        url: cachedDecision.redirectUrl
      })
      return Promise.resolve(false)
    }

    return fetchAccessDecision().then(({ userInfo, applicationInfo }) => {
      if (userInfo.status === 'approved') {
        return true
      }

      if (applicationInfo.hasApplication) {
        wx.reLaunch({
          url: '/pages/guest-status/guest-status'
        })
      } else {
        wx.reLaunch({
          url: '/pages/apply/apply'
        })
      }

      return false
    }).catch((error) => {
      console.error('create ensureApprovedAccess error:', error)
      const fallbackDecision = getCachedAccessDecision()

      if (fallbackDecision && fallbackDecision.canAccess) {
        return true
      }

      wx.reLaunch({
        url: fallbackDecision ? fallbackDecision.redirectUrl : '/pages/apply/apply'
      })
      return false
    })
  },

  reportBlindPoemExposure() {
    wx.cloud.callFunction({
      name: 'reportBlindPoemEvent',
      data: {
        eventType: 'exposure'
      }
    }).catch((error) => {
      console.error('report blind poem exposure error:', error)
    })
  },

  maybeReportBlindPoemExposure() {
    const now = Date.now()
    let lastReportedAt = 0

    try {
      lastReportedAt = Number(wx.getStorageSync(CREATE_EXPOSURE_CACHE_KEY)) || 0
    } catch (error) {
      console.warn('read create exposure cache failed:', error)
    }

    if ((now - lastReportedAt) < CREATE_EXPOSURE_THROTTLE_MS) {
      return
    }

    try {
      wx.setStorageSync(CREATE_EXPOSURE_CACHE_KEY, now)
    } catch (error) {
      console.warn('write create exposure cache failed:', error)
    }

    setTimeout(() => {
      this.reportBlindPoemExposure()
    }, 0)
  },

  prefetchBlindPoemHome() {
    let cache = null

    try {
      cache = wx.getStorageSync(BLIND_POEM_HOME_CACHE_KEY) || null
    } catch (error) {
      console.warn('read blind poem home cache failed:', error)
    }

    const updatedAt = Number(cache && cache.updatedAt) || 0

    if (updatedAt && (Date.now() - updatedAt) < BLIND_POEM_HOME_PREFETCH_INTERVAL) {
      return
    }

    wx.cloud.callFunction({
      name: 'getBlindPoemHistory'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        return
      }

      wx.setStorageSync(BLIND_POEM_HOME_CACHE_KEY, {
        updatedAt: Date.now(),
        payload: buildBlindPoemHomePayload(result)
      })
    }).catch((error) => {
      console.warn('prefetch blind poem home failed:', error)
    })
  },

  goBlindPoem() {
    wx.navigateTo({
      url: '/pages/blind-poem/blind-poem'
    })
  },

  goPoemPancake() {
    wx.navigateTo({
      url: '/pages/poem-pancake/poem-pancake'
    })
  },

  getCreateShareTitle() {
    const modeCount = Array.isArray(this.data && this.data.modeOptions)
      ? this.data.modeOptions.length
      : 0

    return modeCount
      ? `创作互动｜已开放 ${modeCount} 种双盲作诗玩法与诗词摊煎饼`
      : '创作互动｜来校园读书会一起双盲作诗和诗词摊煎饼'
  },

  onShareAppMessage() {
    return buildShareAppMessage({
      title: this.getCreateShareTitle(),
      path: '/pages/create/create',
      shareLanding: SHARE_LANDING_CREATE
    })
  },

  onShareTimeline() {
    return buildShareTimeline({
      title: this.getCreateShareTitle(),
      shareLanding: SHARE_LANDING_CREATE
    })
  }
})
