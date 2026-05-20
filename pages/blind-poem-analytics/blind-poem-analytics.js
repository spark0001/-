function formatRateText(numerator, denominator) {
  if (!denominator) {
    return '0%'
  }

  return `${Number(((numerator / denominator) * 100).toFixed(1))}%`
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    stats: {
      exposureUserCount: 0,
      detailClickUserCount: 0,
      participantUserCount: 0,
      participationCount: 0
    },
    funnelStages: [],
    modeStats: []
  },

  onShow() {
    this.loadAnalytics()
  },

  onPullDownRefresh() {
    this.loadAnalytics({
      stopPullDownRefresh: true
    })
  },

  loadAnalytics(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBlindPoemAnalytics'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '双盲作诗数据加载失败')
      }

      const stats = result.stats || {}
      const funnelStages = result.funnelStages || []

      this.setData({
        loading: false,
        stats: {
          exposureUserCount: Number(stats.exposureUserCount) || 0,
          detailClickUserCount: Number(stats.detailClickUserCount) || 0,
          participantUserCount: Number(stats.participantUserCount) || 0,
          participationCount: Number(stats.participationCount) || 0,
          detailRateText: formatRateText(stats.detailClickUserCount, stats.exposureUserCount),
          participantRateText: formatRateText(stats.participantUserCount, stats.detailClickUserCount)
        },
        funnelStages: funnelStages.map((item, index) => {
          const baseValue = Number(funnelStages[0] && funnelStages[0].value) || 0
          const value = Number(item && item.value) || 0

          return {
            ...item,
            value,
            widthPercent: baseValue ? Math.max(32, Number(((value / baseValue) * 100).toFixed(1))) : 32,
            colorClass: `stage-${index + 1}`
          }
        }),
        modeStats: result.modeStats || []
      })
    }).catch((error) => {
      console.error('getBlindPoemAnalytics error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '双盲作诗数据加载失败',
        stats: {
          exposureUserCount: 0,
          detailClickUserCount: 0,
          participantUserCount: 0,
          participationCount: 0,
          detailRateText: '0%',
          participantRateText: '0%'
        },
        funnelStages: [],
        modeStats: []
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  }
})
