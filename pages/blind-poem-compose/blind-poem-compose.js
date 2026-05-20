const MODE_TEXT_MAP = {
  A: '模式A：双人各写一句',
  B: '模式B：上下句互写',
  C: '模式C：同题异写'
}

function normalizeText(value) {
  return String(value || '').trim()
}

Page({
  data: {
    loading: true,
    submitting: false,
    errorMessage: '',
    roundId: '',
    mode: '',
    modeText: '',
    promptTitle: '',
    promptText: '',
    roleText: '',
    theme: '',
    imageryText: '',
    content: '',
    contentCount: 0
  },

  onLoad(options = {}) {
    const mode = normalizeText(options.mode).toUpperCase()

    if (!MODE_TEXT_MAP[mode]) {
      this.setData({
        loading: false,
        errorMessage: '当前模式不存在'
      })
      return
    }

    this.prepareRound(mode)
  },

  prepareRound(mode) {
    this.setData({
      loading: true,
      errorMessage: '',
      mode,
      modeText: MODE_TEXT_MAP[mode]
    })

    wx.cloud.callFunction({
      name: 'prepareBlindPoemRound',
      data: {
        mode
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '获取创作题面失败')
      }

      const round = result.round || {}
      const imagery = Array.isArray(round.imagery) ? round.imagery : []

      this.setData({
        loading: false,
        roundId: round._id || '',
        promptTitle: round.promptTitle || '',
        promptText: round.composePromptText || round.promptText || '',
        roleText: round.roleText || '',
        theme: round.theme || '',
        imageryText: imagery.join(' / ')
      })
    }).catch((error) => {
      console.error('prepareBlindPoemRound error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '获取创作题面失败'
      })
    })
  },

  onInput(e) {
    const content = e.detail.value || ''

    this.setData({
      content,
      contentCount: content.length
    })
  },

  onSubmitTap() {
    const roundId = this.data.roundId
    const mode = this.data.mode
    const content = normalizeText(this.data.content)

    if (!roundId || !mode) {
      wx.showToast({
        title: '当前创作轮次无效',
        icon: 'none'
      })
      return
    }

    if (!content) {
      wx.showToast({
        title: '请先写下你的诗句',
        icon: 'none'
      })
      return
    }

    if (this.data.submitting) {
      return
    }

    this.setData({
      submitting: true
    })

    wx.showLoading({
      title: '提交中...'
    })

    wx.cloud.callFunction({
      name: 'submitBlindPoemAnswer',
      data: {
        roundId,
        mode,
        content
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '提交失败',
          icon: 'none'
        })
        return
      }

      wx.redirectTo({
        url: `/pages/blind-poem-result/blind-poem-result?roundId=${roundId}`
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('submitBlindPoemAnswer error:', error)
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        submitting: false
      })
    })
  }
})
