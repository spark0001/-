const MODE_OPTIONS = [
  { label: '模式A', value: 'A' },
  { label: '模式B', value: 'B' },
  { label: '模式C', value: 'C' }
]

const MANAGE_CACHE_KEY = 'blindPoemManageCacheV1'

function buildDefaultForm() {
  return {
    promptId: '',
    mode: 'A',
    modeIndex: 0,
    title: '',
    promptText: '',
    theme: '',
    imageryText: '',
    sort: '0',
    statusEnabled: true
  }
}

function getModeIndex(value) {
  const index = MODE_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 0 : index
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    saving: false,
    switchingMode: '',
    updatingAnswerId: '',
    modeOptions: MODE_OPTIONS.map((item) => item.label),
    modeStatus: {
      A: true,
      B: true,
      C: true
    },
    promptList: [],
    promptPreviewList: [],
    answerList: [],
    answerPreviewList: [],
    form: buildDefaultForm(),
    hasContent: false
  },

  onLoad(options = {}) {
    this.pendingPromptId = options.promptId || ''
    this.hydrateManageCache()
    this.loadManageData()
  },

  onPullDownRefresh() {
    this.loadManageData({
      stopPullDownRefresh: true
    })
  },

  loadManageData(options = {}) {
    const hasExistingContent = !!(
      (this.data.promptList && this.data.promptList.length) ||
      (this.data.answerList && this.data.answerList.length)
    )

    this.setData({
      loading: true,
      errorMessage: '',
      hasContent: hasExistingContent || this.data.hasContent
    })

    wx.cloud.callFunction({
      name: 'getBlindPoemManageData'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '双盲作诗后台数据加载失败')
      }

      this.setData({
        loading: false,
        modeStatus: result.modeStatus || {
          A: true,
          B: true,
          C: true
        },
        promptList: result.promptList || [],
        promptPreviewList: (result.promptList || []).slice(0, 3),
        answerList: result.answerList || [],
        answerPreviewList: (result.answerList || []).slice(0, 3),
        hasContent: true
      }, () => {
        this.persistManageCache()
        if (this.pendingPromptId) {
          this.applyPromptToForm(this.pendingPromptId)
        }
      })
    }).catch((error) => {
      console.error('getBlindPoemManageData error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '双盲作诗后台数据加载失败',
        hasContent: this.data.hasContent || hasExistingContent
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  hydrateManageCache() {
    try {
      const cache = wx.getStorageSync(MANAGE_CACHE_KEY) || {}
      const promptList = Array.isArray(cache.promptList) ? cache.promptList : []
      const answerList = Array.isArray(cache.answerList) ? cache.answerList : []
      const modeStatus = cache.modeStatus || {
        A: true,
        B: true,
        C: true
      }

      if (!promptList.length && !answerList.length) {
        return
      }

      this.setData({
        modeStatus,
        promptList,
        promptPreviewList: promptList.slice(0, 3),
        answerList,
        answerPreviewList: answerList.slice(0, 3),
        hasContent: true,
        loading: false
      }, () => {
        if (this.pendingPromptId) {
          this.applyPromptToForm(this.pendingPromptId)
        }
      })
    } catch (error) {
      console.warn('hydrate blind poem manage cache failed:', error)
    }
  },

  persistManageCache() {
    try {
      wx.setStorageSync(MANAGE_CACHE_KEY, {
        modeStatus: this.data.modeStatus,
        promptList: this.data.promptList,
        answerList: this.data.answerList
      })
    } catch (error) {
      console.warn('persist blind poem manage cache failed:', error)
    }
  },

  onModeSwitchChange(e) {
    const mode = e.currentTarget.dataset.mode
    const enabled = !!e.detail.value

    if (!mode) {
      return
    }

    this.setData({
      switchingMode: mode
    })

    wx.cloud.callFunction({
      name: 'updateBlindPoemModeSettings',
      data: {
        mode,
        enabled
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '模式状态保存失败')
      }

      this.setData({
        modeStatus: result.modeStatus || this.data.modeStatus
      }, () => {
        this.persistManageCache()
      })

      wx.showToast({
        title: '模式状态已更新',
        icon: 'none'
      })
    }).catch((error) => {
      console.error('updateBlindPoemModeSettings error:', error)
      wx.showToast({
        title: error.message || '模式状态保存失败',
        icon: 'none'
      })
      this.loadManageData()
    }).finally(() => {
      this.setData({
        switchingMode: ''
      })
    })
  },

  onModePickerChange(e) {
    const modeIndex = Number(e.detail.value)
    const modeOption = MODE_OPTIONS[modeIndex]

    if (!modeOption) {
      return
    }

    this.setData({
      'form.mode': modeOption.value,
      'form.modeIndex': modeIndex
    })
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    this.setData({
      [`form.${field}`]: e.detail.value
    })
  },

  onFormStatusChange(e) {
    this.setData({
      'form.statusEnabled': !!e.detail.value
    })
  },

  onEditPromptTap(e) {
    const prompt = e.currentTarget.dataset.prompt

    if (!prompt) {
      return
    }

    this.fillFormByPrompt(prompt)
  },

  applyPromptToForm(promptId) {
    const prompt = (this.data.promptList || []).find((item) => item && item.promptId === promptId)

    if (!prompt) {
      return
    }

    this.pendingPromptId = ''
    this.fillFormByPrompt(prompt)
  },

  fillFormByPrompt(prompt) {
    this.setData({
      form: {
        promptId: prompt.promptId || '',
        mode: prompt.mode || 'A',
        modeIndex: getModeIndex(prompt.mode),
        title: prompt.title || '',
        promptText: prompt.promptText || '',
        theme: prompt.theme || '',
        imageryText: prompt.imageryText || '',
        sort: `${prompt.sort || 0}`,
        statusEnabled: prompt.status !== 'disabled'
      }
    })
  },

  onCancelEditTap() {
    this.setData({
      form: buildDefaultForm()
    })
  },

  onSavePromptTap() {
    const form = this.data.form
    const promptText = String(form.promptText || '').trim()
    const theme = String(form.theme || '').trim()

    if (!promptText) {
      wx.showToast({
        title: '请先填写题面说明',
        icon: 'none'
      })
      return
    }

    if (form.mode === 'C' && !theme) {
      wx.showToast({
        title: '模式C请填写主题',
        icon: 'none'
      })
      return
    }

    this.setData({
      saving: true
    })

    wx.cloud.callFunction({
      name: 'saveBlindPoemPrompt',
      data: {
        promptId: form.promptId || '',
        mode: form.mode,
        title: form.title || '',
        promptText,
        theme,
        imageryText: form.imageryText || '',
        sort: Number(form.sort) || 0,
        status: form.statusEnabled ? 'enabled' : 'disabled'
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '题面保存失败')
      }

      wx.showToast({
        title: '题面已保存',
        icon: 'none'
      })

      this.setData({
        form: buildDefaultForm()
      })

      this.loadManageData()
    }).catch((error) => {
      console.error('saveBlindPoemPrompt error:', error)
      wx.showToast({
        title: error.message || '题面保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        saving: false
      })
    })
  },

  onTogglePromptStatusTap(e) {
    const prompt = e.currentTarget.dataset.prompt

    if (!prompt) {
      return
    }

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

      this.loadManageData()
    }).catch((error) => {
      console.error('toggle blind poem prompt status error:', error)
      wx.showToast({
        title: error.message || '题面状态更新失败',
        icon: 'none'
      })
    })
  },

  updateAnswerStatus(answerId, data, successText) {
    if (!answerId) {
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

      this.loadManageData()
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
  },

  goPromptList() {
    wx.navigateTo({
      url: '/pages/blind-poem-prompt-list/blind-poem-prompt-list'
    })
  },

  goAnswerList() {
    wx.navigateTo({
      url: '/pages/blind-poem-answer-list/blind-poem-answer-list'
    })
  }
})
