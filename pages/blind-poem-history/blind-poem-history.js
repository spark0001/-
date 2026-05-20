Page({
  data: {
    loading: true,
    errorMessage: '',
    historyList: []
  },

  onShow() {
    this.loadHistory()
  },

  onPullDownRefresh() {
    this.loadHistory({
      stopPullDownRefresh: true
    })
  },

  loadHistory(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBlindPoemHistory'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '历史记录加载失败')
      }

      this.setData({
        loading: false,
        historyList: result.list || []
      })
    }).catch((error) => {
      console.error('getBlindPoemHistory error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '历史记录加载失败',
        historyList: []
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
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
  }
})
