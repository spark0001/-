const {
  buildPrivacyReminderData,
  privacyReminderMethods
} = require('../../utils/privacy')
const {
  decorateActivityTimeState,
  normalizeText
} = require('../../utils/poemPancake')

function createEmptyForm() {
  return {
    activityId: '',
    title: '',
    theme: '',
    description: '',
    startAt: '',
    deadlineAt: ''
  }
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function buildDateTimeText(dateText, timeText, fallbackTime = '00:00') {
  const safeDateText = normalizeText(dateText)
  const safeTimeText = normalizeText(timeText) || fallbackTime

  if (!safeDateText) {
    return ''
  }

  return `${safeDateText} ${safeTimeText}`
}

function parseDateTimeParts(value) {
  const safeValue = normalizeText(value)

  if (!safeValue) {
    return {
      date: '',
      time: ''
    }
  }

  const partList = safeValue.split(/\s+/).filter(Boolean)

  return {
    date: normalizeText(partList[0]),
    time: normalizeText(partList[1])
  }
}

function getNowDateTimeParts(offsetDays = 0, defaultTime = '') {
  const date = new Date(Date.now() + (offsetDays * 24 * 60 * 60 * 1000))

  return {
    date: `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
    time: defaultTime || `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
  }
}

function normalizeManageList(list = []) {
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
    saving: false,
    actingActivityId: '',
    errorMessage: '',
    list: [],
    stats: {
      totalActivities: 0,
      ongoingActivities: 0,
      totalChars: 0
    },
    form: createEmptyForm(),
    startDateValue: '',
    startTimeValue: '',
    deadlineDateValue: '',
    deadlineTimeValue: ''
  },

  ...privacyReminderMethods,

  onLoad() {
    this.syncDateTimePickers()
    this.loadManageData()
  },

  onShow() {
    this.startClockRefresh()
  },

  onHide() {
    this.stopClockRefresh()
  },

  onUnload() {
    this.stopClockRefresh()
  },

  onPullDownRefresh() {
    this.loadManageData({
      silent: !!this.data.list.length,
      stopPullDownRefresh: true
    })
  },

  loadManageData(options = {}) {
    const silent = !!options.silent && !!this.data.list.length

    this.setData({
      loading: !silent,
      syncing: silent,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getPoemPancakeManageData'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '管理数据加载失败')
      }

      const list = normalizeManageList(result.list)
      const nextStats = result.stats && typeof result.stats === 'object'
        ? {
          ...result.stats,
          ongoingActivities: list.filter((item) => item.statusText === '进行中').length
        }
        : buildStatsFromList(list)

      this.setData({
        loading: false,
        syncing: false,
        errorMessage: '',
        list,
        stats: nextStats
      })
    }).catch((error) => {
      console.error('getPoemPancakeManageData error:', error)
      this.setData({
        loading: false,
        syncing: false,
        errorMessage: error.message || '管理数据加载失败'
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    const nextForm = {
      ...this.data.form,
      [field]: e.detail.value
    }

    this.setData({
      form: nextForm
    }, () => {
      if (field === 'startAt' || field === 'deadlineAt') {
        this.syncDateTimePickers()
      }
    })
  },

  resetForm() {
    this.setData({
      form: createEmptyForm()
    }, () => {
      this.syncDateTimePickers()
    })
  },

  syncDateTimePickers() {
    const startParts = parseDateTimeParts(this.data.form.startAt)
    const deadlineParts = parseDateTimeParts(this.data.form.deadlineAt)

    this.setData({
      startDateValue: startParts.date,
      startTimeValue: startParts.time,
      deadlineDateValue: deadlineParts.date,
      deadlineTimeValue: deadlineParts.time
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

    const list = normalizeManageList(this.data.list)

    this.setData({
      list,
      stats: {
        ...(this.data.stats || {}),
        ongoingActivities: list.filter((item) => item.statusText === '进行中').length
      }
    })
  },

  setFormDateTimeField(field, dateText, timeText, fallbackTime) {
    this.setData({
      form: {
        ...this.data.form,
        [field]: buildDateTimeText(dateText, timeText, fallbackTime)
      }
    }, () => {
      this.syncDateTimePickers()
    })
  },

  onNewDraftTap() {
    this.resetForm()
  },

  goPosterManage() {
    wx.navigateTo({
      url: '/pages/poster-manage/poster-manage?contentType=poemPancake'
    })
  },

  onEditTap(e) {
    const activityId = e.currentTarget.dataset.id
    const activity = (this.data.list || []).find((item) => item.activityId === activityId)

    if (!activity) {
      return
    }

    this.setData({
      form: {
        activityId,
        title: activity.title || '',
        theme: activity.theme || '',
        description: activity.description || '',
        startAt: activity.startAtText || '',
        deadlineAt: activity.deadlineAtText || ''
      }
    }, () => {
      this.syncDateTimePickers()
    })
  },

  onStartNowTap() {
    const parts = getNowDateTimeParts(0)
    this.setFormDateTimeField('startAt', parts.date, parts.time, parts.time)
  },

  onDeadlineSoonTap() {
    const parts = getNowDateTimeParts(7, '22:00')
    this.setFormDateTimeField('deadlineAt', parts.date, parts.time, '22:00')
  },

  onStartDateChange(e) {
    this.setFormDateTimeField(
      'startAt',
      e.detail.value,
      this.data.startTimeValue,
      '19:30'
    )
  },

  onStartTimeChange(e) {
    this.setFormDateTimeField(
      'startAt',
      this.data.startDateValue || getNowDateTimeParts(0).date,
      e.detail.value,
      '19:30'
    )
  },

  onDeadlineDateChange(e) {
    this.setFormDateTimeField(
      'deadlineAt',
      e.detail.value,
      this.data.deadlineTimeValue,
      '22:00'
    )
  },

  onDeadlineTimeChange(e) {
    this.setFormDateTimeField(
      'deadlineAt',
      this.data.deadlineDateValue || getNowDateTimeParts(7, '22:00').date,
      e.detail.value,
      '22:00'
    )
  },

  ensureExpectedStatusAfterSave(activityId, expectedStatus, actualStatus) {
    const safeActivityId = normalizeText(activityId)
    const safeExpectedStatus = normalizeText(expectedStatus)
    const safeActualStatus = normalizeText(actualStatus)

    if (!safeActivityId || safeExpectedStatus !== 'published' || safeActualStatus === 'published') {
      return Promise.resolve(safeActualStatus || safeExpectedStatus)
    }

    return wx.cloud.callFunction({
      name: 'updatePoemPancakeActivityStatus',
      data: {
        activityId: safeActivityId,
        targetStatus: 'published'
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '活动发布状态同步失败')
      }

      return 'published'
    })
  },

  saveForm(status) {
    const form = this.data.form || {}

    if (!normalizeText(form.title)) {
      wx.showToast({
        title: '请先填写活动标题',
        icon: 'none'
      })
      return
    }

    if (!normalizeText(form.deadlineAt)) {
      wx.showToast({
        title: '请先填写截止时间',
        icon: 'none'
      })
      return
    }

    if (this.data.saving) {
      return
    }

    this.setData({
      saving: true
    })

    wx.cloud.callFunction({
      name: 'savePoemPancakeActivity',
      data: {
        activityId: normalizeText(form.activityId),
        title: normalizeText(form.title),
        theme: normalizeText(form.theme),
        description: normalizeText(form.description),
        startAt: normalizeText(form.startAt),
        deadlineAt: normalizeText(form.deadlineAt),
        status
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '保存失败')
      }

      const savedStatus = normalizeText(result.savedStatus) || status
      const savedActivityId = normalizeText(result.activityId) || normalizeText(form.activityId)

      return this.ensureExpectedStatusAfterSave(savedActivityId, status, savedStatus).then((finalStatus) => {
        const successTextMap = {
          draft: '草稿已保存',
          published: '活动已发布',
          closed: '已截止活动已更新',
          archived: '已归档活动已更新'
        }

        wx.showToast({
          title: successTextMap[finalStatus] || '活动已更新',
          icon: 'success'
        })

        this.resetForm()
        this.loadManageData({
          silent: true
        })
      })
    }).catch((error) => {
      console.error('savePoemPancakeActivity error:', error)
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        saving: false
      })
    })
  },

  onSaveDraftTap() {
    this.saveForm('draft')
  },

  onSavePublishedTap() {
    this.saveForm('published')
  },

  updateStatus(activityId, targetStatus) {
    if (!activityId || !targetStatus || this.data.actingActivityId) {
      return
    }

    this.setData({
      actingActivityId: activityId
    })

    wx.cloud.callFunction({
      name: 'updatePoemPancakeActivityStatus',
      data: {
        activityId,
        targetStatus
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '状态更新失败')
      }

      const successTextMap = {
        published: '活动已发布',
        closed: '活动已关闭',
        archived: '活动已归档'
      }

      wx.showToast({
        title: successTextMap[targetStatus] || '状态已更新',
        icon: 'none'
      })

      this.loadManageData({
        silent: true
      })
    }).catch((error) => {
      console.error('updatePoemPancakeActivityStatus error:', error)
      wx.showToast({
        title: error.message || '状态更新失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        actingActivityId: ''
      })
    })
  },

  onPublishTap(e) {
    this.updateStatus(e.currentTarget.dataset.id, 'published')
  },

  onCloseTap(e) {
    this.updateStatus(e.currentTarget.dataset.id, 'closed')
  },

  onArchiveTap(e) {
    this.updateStatus(e.currentTarget.dataset.id, 'archived')
  },

  onDeleteTap(e) {
    const activityId = e.currentTarget.dataset.id

    if (!activityId || this.data.actingActivityId) {
      return
    }

    wx.showModal({
      title: '删除草稿活动',
      content: '删除后活动和空白画板都会移除，且无法恢复。仅建议删除无人参与的草稿活动。',
      confirmColor: '#b42318',
      success: (modalRes) => {
        if (!modalRes.confirm) {
          return
        }

        this.setData({
          actingActivityId: activityId
        })

        wx.cloud.callFunction({
          name: 'deletePoemPancakeActivity',
          data: {
            activityId
          }
        }).then((res) => {
          const result = res.result || {}

          if (!result.success) {
            throw new Error(result.message || '删除失败')
          }

          wx.showToast({
            title: '草稿已删除',
            icon: 'none'
          })

          if (this.data.form.activityId === activityId) {
            this.resetForm()
          }

          this.loadManageData({
            silent: true
          })
        }).catch((error) => {
          console.error('deletePoemPancakeActivity error:', error)
          wx.showToast({
            title: error.message || '删除失败',
            icon: 'none'
          })
        }).finally(() => {
          this.setData({
            actingActivityId: ''
          })
        })
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
  }
})
