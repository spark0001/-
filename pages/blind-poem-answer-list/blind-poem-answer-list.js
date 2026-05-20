const FILTER_OPTIONS = [
  { label: '全部', value: 'ALL' },
  { label: '模式A', value: 'A' },
  { label: '模式B', value: 'B' },
  { label: '模式C', value: 'C' }
]

Page({
  data: {
    loading: true,
    errorMessage: '',
    updatingAnswerId: '',
    filterOptions: FILTER_OPTIONS,
    activeFilter: 'ALL',
    answerList: [],
    filteredAnswerList: []
  },

  onShow() {
    this.loadAnswerList()
  },

  onPullDownRefresh() {
    this.loadAnswerList({
      stopPullDownRefresh: true
    })
  },

  loadAnswerList(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBlindPoemManageData'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '作品记录加载失败')
      }

      this.setData({
        loading: false,
        answerList: result.answerList || []
      }, () => {
        this.applyFilter()
      })
    }).catch((error) => {
      console.error('getBlindPoemManageData error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '作品记录加载失败',
        answerList: [],
        filteredAnswerList: []
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  applyFilter() {
    const activeFilter = this.data.activeFilter

    this.setData({
      filteredAnswerList: (this.data.answerList || []).filter((item) => {
        if (activeFilter === 'ALL') {
          return true
        }

        return item && item.mode === activeFilter
      })
    })
  },

  onFilterChange(e) {
    const value = e.currentTarget.dataset.value

    if (!value || value === this.data.activeFilter) {
      return
    }

    this.setData({
      activeFilter: value
    }, () => {
      this.applyFilter()
    })
  },

  updateAnswerStatus(answerId, data, successText) {
    if (!answerId || this.data.updatingAnswerId === answerId) {
      return
    }

    this.setData({
      updatingAnswerId: answerId
    })

    wx.cloud.callFunction({
      name: 'updateBlindPoemAnswerStatus',
      data: {
        answerId,
        ...data
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '作品状态保存失败')
      }

      wx.showToast({
        title: successText,
        icon: 'none'
      })

      this.loadAnswerList()
    }).catch((error) => {
      console.error('updateBlindPoemAnswerStatus error:', error)
      wx.showToast({
        title: error.message || '作品状态保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        updatingAnswerId: ''
      })
    })
  },

  onToggleAnswerBlockTap(e) {
    const answer = e.currentTarget.dataset.answer

    if (!answer) {
      return
    }

    this.updateAnswerStatus(answer.answerId, {
      reviewStatus: answer.reviewStatus === 'blocked' ? 'normal' : 'blocked'
    }, answer.reviewStatus === 'blocked' ? '已取消屏蔽' : '已屏蔽作品')
  },

  onToggleAnswerFeatureTap(e) {
    const answer = e.currentTarget.dataset.answer

    if (!answer || answer.reviewStatus === 'blocked') {
      return
    }

    this.updateAnswerStatus(answer.answerId, {
      isFeatured: !answer.isFeatured
    }, answer.isFeatured ? '已取消精选' : '已设为精选')
  }
})
