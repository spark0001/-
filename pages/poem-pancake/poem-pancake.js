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
const {
  decorateActivityTimeState
} = require('../../utils/poemPancake')

function normalizeActivityList(list = []) {
  return (Array.isArray(list) ? list : []).map((item) => decorateActivityTimeState(item))
}

function buildStatsFromList(list = []) {
  const safeList = Array.isArray(list) ? list : []

  return {
    totalActivities: safeList.length,
    ongoingActivities: safeList.filter((item) => item.statusText === '进行中').length,
    totalChars: safeList.reduce((sum, item) => sum + (Number(item && item.filledCount) || 0), 0)
  }
}

Page({
  data: {
    ...buildPrivacyReminderData(),
    loading: true,
    syncing: false,
    hasContent: false,
    errorMessage: '',
    list: [],
    stats: {
      totalActivities: 0,
      ongoingActivities: 0,
      totalChars: 0
    }
  },

  ...privacyReminderMethods,

  onLoad() {
    showPageShareMenu()
    this.reportedExposureActivityMap = {}
  },

  onShow() {
    this.startClockRefresh()
    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        return
      }

      this.loadActivityList({
        silent: this.data.hasContent
      })
    })
  },

  onHide() {
    this.stopClockRefresh()
  },

  onUnload() {
    this.stopClockRefresh()
  },

  onPullDownRefresh() {
    this.loadActivityList({
      silent: this.data.hasContent,
      stopPullDownRefresh: true
    })
  },

  loadActivityList(options = {}) {
    const silent = !!options.silent && this.data.hasContent

    this.setData({
      loading: !silent,
      syncing: silent,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getPoemPancakeActivityList'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '诗词摊煎饼活动加载失败')
      }

      const list = normalizeActivityList(result.list)
      const stats = result.stats && typeof result.stats === 'object'
        ? result.stats
        : buildStatsFromList(list)

      this.setData({
        loading: false,
        syncing: false,
        hasContent: true,
        errorMessage: '',
        list,
        stats: {
          ...stats,
          ongoingActivities: list.filter((item) => item.statusText === '进行中').length
        }
      }, () => {
        this.reportActivityExposure(list)
      })
    }).catch((error) => {
      console.error('getPoemPancakeActivityList error:', error)
      this.setData({
        loading: false,
        syncing: false,
        errorMessage: error.message || '诗词摊煎饼活动加载失败',
        hasContent: this.data.hasContent
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  reportActivityExposure(list = []) {
    const activityIds = (Array.isArray(list) ? list : [])
      .map((item) => item && item.activityId)
      .filter(Boolean)
      .filter((activityId) => {
        if (this.reportedExposureActivityMap && this.reportedExposureActivityMap[activityId]) {
          return false
        }

        return true
      })

    if (!activityIds.length) {
      return
    }

    wx.cloud.callFunction({
      name: 'reportPoemPancakeEvent',
      data: {
        eventType: 'exposure',
        activityIds
      }
    }).then(() => {
      activityIds.forEach((activityId) => {
        this.reportedExposureActivityMap[activityId] = true
      })
    }).catch((error) => {
      console.warn('report poem pancake exposure error:', error)
    })
  },

  startClockRefresh() {
    this.stopClockRefresh()
    this.clockTimer = setInterval(() => {
      this.refreshDisplayedTimeState()
    }, 30000)
  },

  stopClockRefresh() {
    if (this.clockTimer) {
      clearInterval(this.clockTimer)
      this.clockTimer = null
    }
  },

  refreshDisplayedTimeState() {
    if (!Array.isArray(this.data.list) || !this.data.list.length) {
      return
    }

    const list = normalizeActivityList(this.data.list)

    this.setData({
      list,
      stats: {
        ...(this.data.stats || {}),
        ongoingActivities: list.filter((item) => item.statusText === '进行中').length
      }
    })
  },

  goDetail(e) {
    const activityId = e.currentTarget.dataset.id

    if (!activityId) {
      return
    }

    wx.navigateTo({
      url: `/pages/poem-pancake-detail/poem-pancake-detail?activityId=${activityId}`
    })
  },

  getShareTitle() {
    const ongoingActivities = Number(this.data.stats && this.data.stats.ongoingActivities) || 0

    return ongoingActivities
      ? `诗词摊煎饼｜当前有 ${ongoingActivities} 场共创正在延展`
      : '诗词摊煎饼｜来校园读书会一起摊开一张生长中的诗词画板'
  },

  onShareAppMessage() {
    return buildShareAppMessage({
      title: this.getShareTitle(),
      path: '/pages/poem-pancake/poem-pancake',
      shareLanding: SHARE_LANDING_CREATE
    })
  },

  onShareTimeline() {
    return buildShareTimeline({
      title: this.getShareTitle(),
      shareLanding: SHARE_LANDING_CREATE
    })
  }
})
