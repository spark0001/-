const ALL_MODE_OPTIONS = [
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
const {
  SHARE_LANDING_CREATE,
  buildShareAppMessage,
  buildShareTimeline,
  showPageShareMenu
} = require('../../utils/share')

const BLIND_POEM_CACHE_KEY = 'blindPoemHomeCacheV1'
const BLIND_POEM_REFRESH_INTERVAL = 60000
const BLIND_POEM_DETAIL_CLICK_CACHE_KEY = 'blindPoemDetailClickAt'
const BLIND_POEM_DETAIL_CLICK_THROTTLE_MS = 5 * 60 * 1000

Page({
  data: {
    loading: true,
    syncing: false,
    hasContent: false,
    errorMessage: '',
    modeOptions: [],
    historyPreview: [],
    featuredList: [],
    totalParticipationCount: 0
  },

  onLoad() {
    showPageShareMenu()
    this.hydrateBlindPoemCache()
  },

  onShow() {
    this.maybeReportDetailClick()

    const now = Date.now()
    const shouldSkipRefresh = this.data.hasContent
      && this.lastBlindPoemRefreshAt
      && (now - this.lastBlindPoemRefreshAt) < BLIND_POEM_REFRESH_INTERVAL

    if (shouldSkipRefresh) {
      return
    }

    this.loadHistoryPreview({
      silent: this.data.hasContent
    })
  },

  onPullDownRefresh() {
    this.loadHistoryPreview({
      silent: this.data.hasContent,
      stopPullDownRefresh: true
    })
  },

  loadHistoryPreview(options = {}) {
    const silent = !!options.silent && this.data.hasContent
    this.lastBlindPoemRefreshAt = Date.now()

    this.setData({
      loading: !silent,
      syncing: silent,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBlindPoemHistory'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '双盲作诗历史加载失败')
      }

      const pagePayload = this.buildBlindPoemPayload(result)

      this.setData({
        loading: false,
        syncing: false,
        hasContent: true,
        errorMessage: '',
        ...pagePayload
      }, () => {
        this.persistBlindPoemCache()
      })
    }).catch((error) => {
      console.error('getBlindPoemHistory error:', error)

      if (this.data.hasContent) {
        this.setData({
          loading: false,
          syncing: false,
          errorMessage: '最新内容刷新失败，当前先显示缓存内容。'
        })
      } else {
        this.setData({
          loading: false,
          syncing: false,
          hasContent: false,
          errorMessage: error.message || '双盲作诗历史加载失败',
          modeOptions: [],
          historyPreview: [],
          featuredList: [],
          totalParticipationCount: 0
        })
      }
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  buildBlindPoemPayload(result) {
    const availableModes = Array.isArray(result.availableModes) ? result.availableModes : []

    return {
      modeOptions: ALL_MODE_OPTIONS.filter((item) => {
        return availableModes.indexOf(item.value) !== -1
      }),
      historyPreview: (result.list || []).slice(0, 3),
      featuredList: result.featuredList || [],
      totalParticipationCount: Number(result.totalParticipationCount) || 0
    }
  },

  hydrateBlindPoemCache() {
    try {
      const cache = wx.getStorageSync(BLIND_POEM_CACHE_KEY) || {}
      const payload = cache.payload || null

      if (!payload) {
        return
      }

      this.lastBlindPoemRefreshAt = Number(cache.updatedAt) || 0

      this.setData({
        ...payload,
        loading: false,
        syncing: false,
        hasContent: true,
        errorMessage: ''
      })
    } catch (error) {
      console.warn('hydrate blind poem cache failed:', error)
    }
  },

  persistBlindPoemCache() {
    try {
      wx.setStorageSync(BLIND_POEM_CACHE_KEY, {
        updatedAt: Date.now(),
        payload: {
          modeOptions: this.data.modeOptions,
          historyPreview: this.data.historyPreview,
          featuredList: this.data.featuredList,
          totalParticipationCount: this.data.totalParticipationCount
        }
      })
    } catch (error) {
      console.warn('persist blind poem cache failed:', error)
    }
  },

  reportDetailClick() {
    wx.cloud.callFunction({
      name: 'reportBlindPoemEvent',
      data: {
        eventType: 'detail_click'
      }
    }).catch((error) => {
      console.error('report blind poem detail click error:', error)
    })
  },

  maybeReportDetailClick() {
    const now = Date.now()
    let lastReportedAt = 0

    try {
      lastReportedAt = Number(wx.getStorageSync(BLIND_POEM_DETAIL_CLICK_CACHE_KEY)) || 0
    } catch (error) {
      console.warn('read blind poem detail cache failed:', error)
    }

    if ((now - lastReportedAt) < BLIND_POEM_DETAIL_CLICK_THROTTLE_MS) {
      return
    }

    try {
      wx.setStorageSync(BLIND_POEM_DETAIL_CLICK_CACHE_KEY, now)
    } catch (error) {
      console.warn('write blind poem detail cache failed:', error)
    }

    setTimeout(() => {
      this.reportDetailClick()
    }, 0)
  },

  onModeTap(e) {
    const mode = e.currentTarget.dataset.mode

    if (!mode) {
      return
    }

    wx.navigateTo({
      url: `/pages/blind-poem-compose/blind-poem-compose?mode=${mode}`
    })
  },

  goHistory() {
    wx.navigateTo({
      url: '/pages/blind-poem-history/blind-poem-history'
    })
  },

  goResult(e) {
    const roundId = e.currentTarget.dataset.id

    if (!roundId) {
      return
    }

    wx.navigateTo({
      url: `/pages/blind-poem-result/blind-poem-result?roundId=${roundId}`
    })
  },

  getBlindPoemShareTitle() {
    const totalParticipationCount = Number(this.data.totalParticipationCount) || 0

    return totalParticipationCount
      ? `双盲作诗｜已有 ${totalParticipationCount} 次创作互动发生`
      : '双盲作诗｜来校园读书会接住陌生人的灵感'
  },

  onShareAppMessage() {
    return buildShareAppMessage({
      title: this.getBlindPoemShareTitle(),
      path: '/pages/create/create',
      shareLanding: SHARE_LANDING_CREATE
    })
  },

  onShareTimeline() {
    return buildShareTimeline({
      title: this.getBlindPoemShareTitle(),
      shareLanding: SHARE_LANDING_CREATE
    })
  }
})
