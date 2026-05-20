const MODE_OPTIONS = [
  { label: '模式A', value: 'A' },
  { label: '模式B', value: 'B' },
  { label: '模式C', value: 'C' }
]

Page({
  data: {
    loading: true,
    errorMessage: '',
    updatingPromptId: '',
    modeOptions: MODE_OPTIONS,
    activeMode: 'A',
    promptList: [],
    filteredPromptList: []
  },

  onLoad(options = {}) {
    const mode = options.mode || 'A'

    this.setData({
      activeMode: MODE_OPTIONS.some((item) => item.value === mode) ? mode : 'A'
    })
  },

  onShow() {
    this.loadPromptList()
  },

  onPullDownRefresh() {
    this.loadPromptList({
      stopPullDownRefresh: true
    })
  },

  loadPromptList(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBlindPoemManageData'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '题库列表加载失败')
      }

      this.setData({
        loading: false,
        promptList: result.promptList || []
      }, () => {
        this.applyModeFilter()
      })
    }).catch((error) => {
      console.error('getBlindPoemManageData error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '题库列表加载失败',
        promptList: [],
        filteredPromptList: []
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  applyModeFilter() {
    const activeMode = this.data.activeMode

    this.setData({
      filteredPromptList: (this.data.promptList || []).filter((item) => item && item.mode === activeMode)
    })
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode

    if (!mode || mode === this.data.activeMode) {
      return
    }

    this.setData({
      activeMode: mode
    }, () => {
      this.applyModeFilter()
    })
  },

  onEditPromptTap(e) {
    const promptId = e.currentTarget.dataset.id

    if (!promptId) {
      return
    }

    wx.navigateTo({
      url: `/pages/blind-poem-manage/blind-poem-manage?promptId=${promptId}`
    })
  },

  onTogglePromptStatusTap(e) {
    const prompt = e.currentTarget.dataset.prompt

    if (!prompt || this.data.updatingPromptId === prompt.promptId) {
      return
    }

    this.setData({
      updatingPromptId: prompt.promptId
    })

    wx.cloud.callFunction({
      name: 'saveBlindPoemPrompt',
      data: {
        promptId: prompt.promptId || '',
        mode: prompt.mode,
        title: prompt.title || '',
        promptText: prompt.promptText || '',
        theme: prompt.theme || '',
        imageryText: prompt.imageryText || '',
        sort: Number(prompt.sort) || 0,
        status: prompt.status === 'enabled' ? 'disabled' : 'enabled'
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '题面状态更新失败')
      }

      wx.showToast({
        title: '题面状态已更新',
        icon: 'none'
      })

      this.loadPromptList()
    }).catch((error) => {
      console.error('toggle blind poem prompt status error:', error)
      wx.showToast({
        title: error.message || '题面状态更新失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        updatingPromptId: ''
      })
    })
  }
})
