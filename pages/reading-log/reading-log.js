const {
  buildReadingPosterSource,
  cacheReadingPosterSource
} = require('../../utils/readingPoster')
const {
  SHARE_LANDING_HOME,
  buildShareAppMessage,
  buildShareTimeline,
  showPageShareMenu
} = require('../../utils/share')

const DEFAULT_ACTIVITY_OPTION = {
  _id: '',
  title: '不关联活动'
}

const READING_INCENTIVE_TARGET_DAYS = 10

function normalizeText(value) {
  return String(value || '').trim()
}

function decodeText(value) {
  const safeValue = normalizeText(value)

  if (!safeValue) {
    return ''
  }

  try {
    return decodeURIComponent(safeValue)
  } catch (error) {
    return safeValue
  }
}

function buildDefaultForm(activityOption = DEFAULT_ACTIVITY_OPTION, activityIndex = 0) {
  const safeActivityOption = activityOption && typeof activityOption === 'object'
    ? activityOption
    : DEFAULT_ACTIVITY_OPTION
  const activityId = normalizeText(safeActivityOption._id)
  const activityTitle = activityId ? normalizeText(safeActivityOption.title) : ''

  return {
    bookTitle: '',
    contentTitle: '',
    author: '',
    duration: '',
    pagesOrChapter: '',
    insight: '',
    excerpt: '',
    activityIndex,
    activityId,
    activityTitle
  }
}

function buildPageDesc(activityTitle) {
  const safeActivityTitle = normalizeText(activityTitle)

  if (!safeActivityTitle) {
    return '记录你今天的阅读内容与感受，当前还未设置激励阅读活动，你也可以手动选择其他活动进行关联。'
  }

  return `记录你今天的阅读内容与感受，默认关联【${safeActivityTitle}】，累计打卡【${safeActivityTitle}】${READING_INCENTIVE_TARGET_DAYS}天且线下到场可领奖，可手动取消或改选其他活动。`
}

function buildActivityHintText(activityTitle) {
  const safeActivityTitle = normalizeText(activityTitle)

  if (!safeActivityTitle) {
    return '当前还未设置激励阅读活动，可按需手动取消关联或改选其他活动。'
  }

  return `当前默认关联【${safeActivityTitle}】，可手动取消或改选其他活动。`
}

Page({
  data: {
    form: buildDefaultForm(),
    loading: false,
    posterPromptVisible: false,
    posterPromptTitle: '',
    posterPromptContent: '',
    activitiesLoading: false,
    activityOptions: [DEFAULT_ACTIVITY_OPTION],
    activityTitleOptions: [DEFAULT_ACTIVITY_OPTION.title],
    defaultActivityTitle: '',
    activityHintText: buildActivityHintText(''),
    pageDesc: buildPageDesc('')
  },

  onLoad(options = {}) {
    showPageShareMenu()
    this.posterPromptSource = null
    this.preferredActivityId = normalizeText(options.activityId)
    this.preferredActivityTitle = decodeText(options.activityTitle)

    if (this.preferredActivityId) {
      this.setData({
        form: buildDefaultForm({
          _id: this.preferredActivityId,
          title: this.preferredActivityTitle
        }),
        defaultActivityTitle: this.preferredActivityTitle,
        activityHintText: buildActivityHintText(this.preferredActivityTitle),
        pageDesc: buildPageDesc(this.preferredActivityTitle)
      })
    }

    this.loadActivityOptions()
  },

  onUnload() {
    this.posterPromptSource = null
  },

  loadActivityOptions() {
    this.setData({
      activitiesLoading: true
    })

    wx.cloud.callFunction({
      name: 'getActivityList',
      data: {
        limit: 100,
        includePast: true
      }
    }).then((res) => {
      const result = res.result || {}
      const list = result.success ? (result.list || []) : []
      const normalActivityList = list.filter((item) => item && item.activityType !== 'rewardClaim')
      const activityOptions = [DEFAULT_ACTIVITY_OPTION].concat(normalActivityList.map((item) => {
        return {
          _id: item._id || '',
          title: item.title || '未命名活动',
          isCurrentReadingIncentive: item.isCurrentReadingIncentive === true
        }
      }))
      const currentReadingIncentiveActivity = normalActivityList.find((item) => {
        return item && item.isCurrentReadingIncentive === true
      }) || null
      const preferredActivityId = this.preferredActivityId || normalizeText(this.data.form.activityId)

      let activityIndex = 0

      if (preferredActivityId) {
        const preferredIndex = activityOptions.findIndex((item) => {
          return normalizeText(item && item._id) === preferredActivityId
        })

        if (preferredIndex >= 0) {
          activityIndex = preferredIndex
        }
      } else if (currentReadingIncentiveActivity && currentReadingIncentiveActivity._id) {
        const currentIndex = activityOptions.findIndex((item) => {
          return normalizeText(item && item._id) === normalizeText(currentReadingIncentiveActivity._id)
        })

        if (currentIndex >= 0) {
          activityIndex = currentIndex
        }
      }

      const selectedActivity = activityOptions[activityIndex] || activityOptions[0]
      const defaultActivityTitle = normalizeText(currentReadingIncentiveActivity && currentReadingIncentiveActivity.title)
        || (normalizeText(selectedActivity && selectedActivity._id)
          ? normalizeText(selectedActivity && selectedActivity.title)
          : '')
        || this.preferredActivityTitle

      this.setData({
        activityOptions,
        activityTitleOptions: activityOptions.map((item) => item.title),
        defaultActivityTitle,
        activityHintText: buildActivityHintText(defaultActivityTitle),
        pageDesc: buildPageDesc(defaultActivityTitle),
        form: {
          ...this.data.form,
          activityIndex,
          activityId: normalizeText(selectedActivity && selectedActivity._id),
          activityTitle: normalizeText(selectedActivity && selectedActivity._id)
            ? normalizeText(selectedActivity && selectedActivity.title)
            : ''
        }
      })
    }).catch((error) => {
      console.error('getActivityList error:', error)
      this.setData({
        activityHintText: buildActivityHintText(this.data.defaultActivityTitle),
        pageDesc: buildPageDesc(this.data.defaultActivityTitle)
      })
    }).finally(() => {
      this.setData({
        activitiesLoading: false
      })
    })
  },

  onActivityChange(e) {
    const activityIndex = Number(e.detail.value) || 0
    const selectedActivity = this.data.activityOptions[activityIndex] || this.data.activityOptions[0]

    this.setData({
      'form.activityIndex': activityIndex,
      'form.activityId': normalizeText(selectedActivity && selectedActivity._id),
      'form.activityTitle': normalizeText(selectedActivity && selectedActivity._id)
        ? normalizeText(selectedActivity && selectedActivity.title)
        : ''
    })
  },

  onBookTitleInput(e) {
    this.setData({
      'form.bookTitle': e.detail.value
    })
  },

  onAuthorInput(e) {
    this.setData({
      'form.author': e.detail.value
    })
  },

  onContentTitleInput(e) {
    this.setData({
      'form.contentTitle': e.detail.value
    })
  },

  onDurationInput(e) {
    this.setData({
      'form.duration': e.detail.value
    })
  },

  onPagesOrChapterInput(e) {
    this.setData({
      'form.pagesOrChapter': e.detail.value
    })
  },

  onInsightInput(e) {
    this.setData({
      'form.insight': e.detail.value
    })
  },

  onExcerptInput(e) {
    this.setData({
      'form.excerpt': e.detail.value
    })
  },

  noop() {},

  goReadingPoster(source) {
    const posterSource = buildReadingPosterSource(source)

    cacheReadingPosterSource(posterSource)

    wx.navigateTo({
      url: `/pages/activity-poster/activity-poster?id=${encodeURIComponent(posterSource._id)}&type=reading`,
      success: (navRes) => {
        if (navRes.eventChannel && navRes.eventChannel.emit) {
          navRes.eventChannel.emit('acceptSharePosterSource', {
            record: posterSource
          })
        }
      }
    })
  },

  promptPosterCreation(posterSource) {
    this.posterPromptSource = posterSource
    this.setData({
      posterPromptVisible: true,
      posterPromptTitle: '打卡成功',
      posterPromptContent: '本次阅读打卡已保存，是否立即生成分享海报？'
    })
  },

  closePosterPrompt() {
    this.posterPromptSource = null
    this.setData({
      posterPromptVisible: false,
      posterPromptTitle: '',
      posterPromptContent: ''
    })
  },

  onPosterPromptCancel() {
    this.closePosterPrompt()
  },

  onPosterPromptConfirm() {
    const posterSource = this.posterPromptSource
    this.closePosterPrompt()

    if (!posterSource) {
      return
    }

    this.goReadingPoster(posterSource)
  },

  getReadingLogShareConfig() {
    const form = this.data.form || {}
    const activityId = normalizeText(form.activityId)
    const activityTitle = normalizeText(form.activityTitle || this.data.defaultActivityTitle)

    return {
      title: activityTitle
        ? `阅读打卡｜记录在【${activityTitle}】里的阅读收获`
        : '阅读打卡｜记录今天的阅读内容与感受',
      path: '/pages/home/home',
      shareLanding: SHARE_LANDING_HOME
    }
  },

  onShareAppMessage() {
    return buildShareAppMessage(this.getReadingLogShareConfig())
  },

  onShareTimeline() {
    const shareConfig = this.getReadingLogShareConfig()
    return buildShareTimeline({
      title: shareConfig.title,
      shareLanding: shareConfig.shareLanding
    })
  },

  onSubmit() {
    const { bookTitle, contentTitle, author, duration, pagesOrChapter, insight, excerpt, activityId, activityTitle, activityIndex } = this.data.form

    if (!bookTitle.trim()) {
      wx.showToast({
        title: '请填写书名',
        icon: 'none'
      })
      return
    }

    if (!duration.trim()) {
      wx.showToast({
        title: '请填写阅读时长',
        icon: 'none'
      })
      return
    }

    if (Number(duration) <= 0) {
      wx.showToast({
        title: '阅读时长必须大于0',
        icon: 'none'
      })
      return
    }

    if (!insight.trim() && !excerpt.trim()) {
      wx.showToast({
        title: '感悟和摘抄请至少填写一项',
        icon: 'none'
      })
      return
    }

    if (this.data.loading) {
      return
    }

    this.setData({
      loading: true
    })

    wx.showLoading({
      title: '提交中...'
    })

    wx.cloud.callFunction({
      name: 'submitReadingLog',
      data: {
        bookTitle,
        contentTitle,
        author,
        duration,
        pagesOrChapter,
        insight,
        excerpt,
        activityId,
        activityTitle
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (result.success) {
        const selectedActivity = this.data.activityOptions[activityIndex] || DEFAULT_ACTIVITY_OPTION
        const posterSource = buildReadingPosterSource({
          _id: result.readingLogId,
          bookTitle,
          contentTitle,
          author,
          duration,
          pagesOrChapter,
          insight,
          excerpt,
          dayKey: result.dayKey,
          createdAt: Date.now()
        })

        this.setData({
          form: buildDefaultForm(selectedActivity, activityIndex)
        })

        this.promptPosterCreation(posterSource)
      } else {
        wx.showToast({
          title: result.message || '提交失败',
          icon: 'none'
        })
      }
    }).catch((error) => {
      wx.hideLoading()
      wx.showToast({
        title: '云函数调用失败',
        icon: 'none'
      })
      console.error('submitReadingLog error:', error)
    }).finally(() => {
      this.setData({
        loading: false
      })
    })
  }
})
