const {
  getCachedAccessDecision,
  fetchAccessDecision
} = require('../../utils/profileSupplement')
const {
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization
} = require('../../utils/privacy')
const {
  buildSharePosterSource,
  cacheSharePosterSource
} = require('../../utils/readingPoster')
const {
  SHARE_LANDING_HOME,
  buildShareAppMessage,
  buildShareTimeline,
  showPageShareMenu
} = require('../../utils/share')

const QUICK_ADD_PAGE_CACHE_KEY = 'quickAddPageCacheV1'
const QUICK_ADD_REFRESH_INTERVAL = 30 * 1000

function buildDefaultReadingForm() {
  return {
    bookTitle: '',
    contentTitle: '',
    author: '',
    duration: '',
    pagesOrChapter: '',
    insight: '',
    excerpt: '',
    activityIndex: 0,
    activityId: '',
    activityTitle: '',
    images: []
  }
}

function buildDefaultLifeForm() {
  return {
    title: '',
    content: '',
    activityIndex: 0,
    activityId: '',
    activityTitle: '',
    images: []
  }
}

function buildDefaultRewardForm() {
  return {
    title: '',
    content: '',
    activityIndex: 0,
    activityId: '',
    activityTitle: '',
    images: []
  }
}

function buildDefaultRewardTabAccess() {
  return {
    currentRewardActivityId: '',
    currentRewardActivityTitle: '',
    currentReadingRuleActivityId: '',
    currentReadingRuleActivityTitle: '',
    showRewardShare: false
  }
}

function buildReadingFormWithActivity(activityOption = null, activityIndex = 0, previousForm = null) {
  const safeActivityOption = activityOption && typeof activityOption === 'object'
    ? activityOption
    : {
      _id: '',
      title: ''
    }
  const nextReadingForm = previousForm
    ? {
      ...previousForm
    }
    : buildDefaultReadingForm()

  nextReadingForm.activityIndex = activityIndex
  nextReadingForm.activityId = safeActivityOption._id || ''
  nextReadingForm.activityTitle = safeActivityOption._id ? (safeActivityOption.title || '') : ''

  return nextReadingForm
}

function buildRewardFormWithActivity(activityOption = null, activityIndex = 0, previousForm = null) {
  const safeActivityOption = activityOption && typeof activityOption === 'object'
    ? activityOption
    : {
      _id: '',
      title: ''
    }
  const nextRewardForm = previousForm
    ? {
      ...previousForm
    }
    : buildDefaultRewardForm()

  nextRewardForm.activityIndex = activityIndex
  nextRewardForm.activityId = safeActivityOption._id || ''
  nextRewardForm.activityTitle = safeActivityOption._id ? (safeActivityOption.title || '') : ''

  return nextRewardForm
}

function normalizeText(value) {
  return String(value || '').trim()
}

function getTimestamp(dateText, timeText) {
  const dateTokens = String(dateText || '').split('-').map((item) => Number(item))
  const timeTokens = String(timeText || '').split(':').map((item) => Number(item))
  const year = dateTokens[0]
  const month = dateTokens[1]
  const day = dateTokens[2]
  const hour = timeTokens[0]
  const minute = timeTokens[1]

  if (
    !Number.isFinite(year)
    || !Number.isFinite(month)
    || !Number.isFinite(day)
    || !Number.isFinite(hour)
    || !Number.isFinite(minute)
  ) {
    return Number.NaN
  }

  // 创建本地时间对象，然后减去 8 小时偏移得到 UTC 时间（中国时区 UTC+8）
  const localDate = new Date(year, month - 1, day, hour, minute)
  const utcTimestamp = localDate.getTime() - (8 * 60 * 60 * 1000)
  return utcTimestamp
}

function getActivityTimeRange(activity) {
  const timeType = normalizeText(activity && activity.timeType) || 'singlePoint'
  const startDate = normalizeText(activity && activity.startDate)
  const endDate = normalizeText(activity && activity.endDate) || startDate
  const startTimeInput = normalizeText(activity && activity.startTime)
  const endTimeInput = normalizeText(activity && activity.endTime)
  const hasExactTime = !!(activity && activity.hasExactTime)

  if (timeType === 'singlePoint' && startDate && startTimeInput) {
    const timestamp = getTimestamp(startDate, startTimeInput)

    if (!Number.isNaN(timestamp)) {
      return {
        startTimestamp: timestamp,
        endTimestamp: timestamp
      }
    }
  }

  if (timeType === 'singleDayRange' && startDate && startTimeInput && endTimeInput) {
    const startTimestamp = getTimestamp(startDate, startTimeInput)
    const endTimestamp = getTimestamp(startDate, endTimeInput)

    if (!Number.isNaN(startTimestamp) && !Number.isNaN(endTimestamp)) {
      return {
        startTimestamp,
        endTimestamp
      }
    }
  }

  if (timeType === 'dateRange' && startDate && endDate) {
    const startTime = hasExactTime ? (startTimeInput || '00:00') : '00:00'
    const endTime = hasExactTime ? (endTimeInput || '23:59') : '23:59'
    const startTimestamp = getTimestamp(startDate, startTime)
    const endTimestamp = getTimestamp(endDate, endTime)

    if (!Number.isNaN(startTimestamp) && !Number.isNaN(endTimestamp)) {
      return {
        startTimestamp,
        endTimestamp
      }
    }
  }

  return {
    startTimestamp: Number(activity && activity.sortTime) || 0,
    endTimestamp: Number(activity && activity.endSortTime) || Number(activity && activity.sortTime) || 0
  }
}

function isActivityOngoing(activity, currentTimestamp = Date.now()) {
  const timeRange = getActivityTimeRange(activity)

  if (!timeRange.startTimestamp || !timeRange.endTimestamp) {
    return false
  }

  return currentTimestamp >= timeRange.startTimestamp && currentTimestamp <= timeRange.endTimestamp
}

function isRewardShareActivitySelectable(activity, currentTimestamp = Date.now()) {
  const timeRange = getActivityTimeRange(activity)
  const endTimestamp = Number(timeRange.endTimestamp) || 0

  if (!endTimestamp) {
    return false
  }

  if (isActivityOngoing(activity, currentTimestamp)) {
    return true
  }

  return currentTimestamp > endTimestamp && currentTimestamp - endTimestamp <= 30 * 24 * 60 * 60 * 1000
}

function getFileExtension(filePath) {
  const safePath = String(filePath || '')
  const dotIndex = safePath.lastIndexOf('.')

  if (dotIndex === -1) {
    return 'png'
  }

  return safePath.slice(dotIndex + 1).toLowerCase()
}

function buildLifeImageCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `life-shares/${randomPart}.${extension}`
}

function buildReadingImageCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `reading-logs/${randomPart}.${extension}`
}

function buildRewardImageCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `reward-shares/${randomPart}.${extension}`
}

function getActivityOptionIndex(optionList, activityId) {
  const safeActivityId = normalizeText(activityId)

  if (!safeActivityId) {
    return 0
  }

  const targetIndex = (optionList || []).findIndex((item) => {
    return normalizeText(item && item._id) === safeActivityId
  })

  return targetIndex > -1 ? targetIndex : 0
}

Page({
  data: {
    loading: true,
    syncing: false,
    hasContent: false,
    initialized: false,
    activeTab: 'reading',
    showRewardTab: false,
    currentReadingIncentiveActivityId: '',
    currentReadingIncentiveActivityTitle: '',
    activityOptions: [
      {
        _id: '',
        title: '不关联活动'
      }
    ],
    activityTitleOptions: ['不关联活动'],
    rewardActivityOptions: [
      {
        _id: '',
        title: '不关联活动'
      }
    ],
    rewardActivityTitleOptions: ['不关联活动'],
    activitiesLoading: false,
    readingSubmitting: false,
    lifeSubmitting: false,
    rewardSubmitting: false,
    posterPromptVisible: false,
    posterPromptTitle: '',
    posterPromptContent: '',
    readingInsightCount: 0,
    readingExcerptCount: 0,
    lifeContentCount: 0,
    rewardContentCount: 0,
    readingForm: buildDefaultReadingForm(),
    lifeForm: buildDefaultLifeForm(),
    rewardForm: buildDefaultRewardForm(),
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad() {
    showPageShareMenu()
    this.pendingReadingPreset = null
    this.pendingTargetTab = ''
    this.persistTimer = null
    this.posterPromptSource = null
    this.posterPromptComplete = null
    this.readingFormDraft = buildDefaultReadingForm()
    this.lifeFormDraft = buildDefaultLifeForm()
    this.rewardFormDraft = buildDefaultRewardForm()
    this.hydrateQuickAddCache()
  },

  onShow() {
    this.syncTabBarSelected(2)

    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        return
      }

      this.ensureApprovedAccess().then((canAccess) => {
        if (!canAccess) {
          return
        }

        const targetTab = wx.getStorageSync('quickAddTargetTab')
        this.pendingTargetTab = targetTab === 'reading' || targetTab === 'life' || targetTab === 'reward'
          ? targetTab
          : ''

        if (this.pendingTargetTab) {
          wx.removeStorageSync('quickAddTargetTab')
        }

        const readingPreset = wx.getStorageSync('quickAddReadingPreset')
        const safeReadingPreset = readingPreset && typeof readingPreset === 'object'
          ? {
            activityId: normalizeText(readingPreset.activityId),
            activityTitle: normalizeText(readingPreset.activityTitle)
          }
          : null

        this.pendingReadingPreset = safeReadingPreset && safeReadingPreset.activityId
          ? safeReadingPreset
          : null

        if (readingPreset) {
          wx.removeStorageSync('quickAddReadingPreset')
        }

        this.applyPendingQuickAddState()

        const now = Date.now()
        const hasPendingPresetInCache = !this.pendingReadingPreset || (this.data.activityOptions || []).some((item) => {
          return normalizeText(item && item._id) === this.pendingReadingPreset.activityId
        })
        const shouldSkipRefresh = this.data.hasContent
          && this.lastQuickAddRefreshAt
          && (now - this.lastQuickAddRefreshAt) < QUICK_ADD_REFRESH_INTERVAL
          && hasPendingPresetInCache

        if (shouldSkipRefresh) {
          if (!this.data.initialized) {
            this.setData({
              initialized: true
            })
          }
          return
        }

        this.loadPageData({
          silent: this.data.hasContent
        })
      })
    })
  },

  onHide() {
    this.persistQuickAddCache()
  },

  onUnload() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }

    this.persistQuickAddCache()
  },

  replaceFormDraft(scope, nextForm) {
    if (!scope) {
      return
    }

    this[`${scope}FormDraft`] = nextForm && typeof nextForm === 'object'
      ? {
        ...nextForm
      }
      : {}
  },

  patchFormDraft(scope, patch) {
    if (!scope || !patch || typeof patch !== 'object') {
      return
    }

    const draftKey = `${scope}FormDraft`
    const formKey = `${scope}Form`
    const currentDraft = this[draftKey] && typeof this[draftKey] === 'object'
      ? this[draftKey]
      : (this.data[formKey] && typeof this.data[formKey] === 'object'
        ? this.data[formKey]
        : {})

    this[draftKey] = {
      ...currentDraft,
      ...patch
    }
  },

  getFormSnapshot(scope) {
    if (!scope) {
      return {}
    }

    const formKey = `${scope}Form`
    const draftKey = `${scope}FormDraft`
    const formData = this.data[formKey] && typeof this.data[formKey] === 'object'
      ? this.data[formKey]
      : {}
    const formDraft = this[draftKey] && typeof this[draftKey] === 'object'
      ? this[draftKey]
      : null

    return formDraft
      ? {
        ...formData,
        ...formDraft
      }
      : {
        ...formData
      }
  },

  syncTabBarSelected(index) {
    if (typeof this.getTabBar !== 'function') {
      return
    }

    const tabBar = this.getTabBar()

    if (tabBar && typeof tabBar.setSelected === 'function') {
      tabBar.setSelected(index)
    }
  },

  noop() {},

  ensureApprovedAccess() {
    const cachedDecision = getCachedAccessDecision()

    if (cachedDecision) {
      if (cachedDecision.canAccess) {
        return Promise.resolve(true)
      }

      wx.reLaunch({
        url: cachedDecision.redirectUrl
      })
      return Promise.resolve(false)
    }

    return fetchAccessDecision().then(({ userInfo, applicationInfo }) => {
      if (userInfo.status === 'approved') {
        return true
      }

      if (applicationInfo.hasApplication) {
        wx.reLaunch({
          url: '/pages/guest-status/guest-status'
        })
      } else {
        wx.reLaunch({
          url: '/pages/apply/apply'
        })
      }

      return false
    }).catch((error) => {
      console.error('quick-add ensureApprovedAccess error:', error)
      const fallbackDecision = getCachedAccessDecision()

      if (fallbackDecision && fallbackDecision.canAccess) {
        return true
      }

      wx.reLaunch({
        url: fallbackDecision ? fallbackDecision.redirectUrl : '/pages/apply/apply'
      })
      return false
    })
  },

  loadPageData(options = {}) {
    const silent = !!options.silent && this.data.hasContent
    this.lastQuickAddRefreshAt = Date.now()

    this.setData({
      loading: !silent,
      syncing: silent,
      activitiesLoading: true
    })

    this.loadRewardTabAccess().finally(() => {
      this.loadActivityOptions({
        persistCache: true
      }).finally(() => {
        this.setData({
          loading: false,
          syncing: false
        })

        if (!this.data.initialized) {
          this.setData({
            initialized: true
          })
        }
      })
    })
  },

  loadRewardTabAccess() {
    return wx.cloud.callFunction({
      name: 'getMonthlyGiftProgress'
    }).then((res) => {
      const result = res.result || {}
      this.rewardTabAccess = result.success ? {
        currentRewardActivityId: result.currentRewardActivityId || '',
        currentRewardActivityTitle: result.currentRewardActivityTitle || '',
        currentReadingRuleActivityId: result.activityId || '',
        currentReadingRuleActivityTitle: result.activityTitle || '',
        showRewardShare: result.showRewardShare === true
      } : buildDefaultRewardTabAccess()

      this.schedulePersistQuickAddCache()
      return this.rewardTabAccess
    }).catch(() => {
      this.rewardTabAccess = buildDefaultRewardTabAccess()
      return this.rewardTabAccess
    })
  },

  loadActivityOptions(options = {}) {
    const shouldPersistCache = options.persistCache !== false

    return wx.cloud.callFunction({
      name: 'getActivityList',
      data: {
        limit: 20,
        includePast: true
      }
    }).then((res) => {
      const result = res.result || {}
      const list = result.success ? (result.list || []) : []
      const currentTimestamp = Date.now()
      const normalActivityList = list.filter((item) => item && item.activityType !== 'rewardClaim')
      const currentReadingIncentiveActivity = normalActivityList.find((item) => {
        return item && item.isCurrentReadingIncentive === true
      }) || null
      const rewardActivityList = list.filter((item) => {
        return item
          && item.activityType === 'rewardClaim'
          && item.isRegistered === true
          && isRewardShareActivitySelectable(item, currentTimestamp)
      })
      const activityOptions = [
        {
          _id: '',
          title: '不关联活动',
          isCurrentReadingIncentive: false
        }
      ].concat(normalActivityList.map((item) => {
        return {
          _id: item._id || '',
          title: item.title || '未命名活动',
          isCurrentReadingIncentive: item.isCurrentReadingIncentive === true
        }
      }))
      const rewardActivityOptions = [
        {
          _id: '',
          title: '不关联活动'
        }
      ].concat(rewardActivityList.map((item) => {
        return {
          _id: item._id || '',
          title: item.title || '未命名活动'
        }
      }))
      const rewardTabAccess = this.rewardTabAccess || buildDefaultRewardTabAccess()
      const ruleReadingActivityId = normalizeText(rewardTabAccess.currentReadingRuleActivityId)
      const ruleReadingActivityTitle = normalizeText(rewardTabAccess.currentReadingRuleActivityTitle)
      const currentReadingIncentiveActivityId = normalizeText(
        ruleReadingActivityId || (currentReadingIncentiveActivity && currentReadingIncentiveActivity._id)
      )
      const currentReadingIncentiveActivityTitle = normalizeText(
        ruleReadingActivityTitle || (currentReadingIncentiveActivity && currentReadingIncentiveActivity.title)
      )
      const preferredReadingActivityId = this.pendingReadingPreset && this.pendingReadingPreset.activityId
        ? this.pendingReadingPreset.activityId
        : (this.data.readingForm.activityId || currentReadingIncentiveActivityId)
      const readingActivityIndex = getActivityOptionIndex(activityOptions, preferredReadingActivityId)
      const selectedReadingActivity = activityOptions[readingActivityIndex] || activityOptions[0]
      const preferredRewardActivityId = rewardTabAccess.currentRewardActivityId || this.data.rewardForm.activityId
      const rewardActivityIndex = getActivityOptionIndex(rewardActivityOptions, preferredRewardActivityId)
      const selectedRewardActivity = rewardActivityOptions[rewardActivityIndex] || rewardActivityOptions[0]
      const showRewardTab = !!(rewardTabAccess.showRewardShare && rewardActivityOptions.length > 1)
      let nextActiveTab = this.data.activeTab

      if (this.pendingTargetTab) {
        nextActiveTab = this.pendingTargetTab === 'reward'
          ? (showRewardTab ? 'reward' : 'reading')
          : this.pendingTargetTab
        this.pendingTargetTab = ''
      } else if (!showRewardTab && nextActiveTab === 'reward') {
        nextActiveTab = 'reading'
      }

      const nextReadingForm = buildReadingFormWithActivity(
        selectedReadingActivity,
        readingActivityIndex,
        this.getFormSnapshot('reading')
      )
      const nextRewardForm = showRewardTab
        ? buildRewardFormWithActivity(
          selectedRewardActivity,
          rewardActivityIndex,
          this.getFormSnapshot('reward')
        )
        : buildDefaultRewardForm()

      this.replaceFormDraft('reading', nextReadingForm)
      this.replaceFormDraft('reward', nextRewardForm)

      this.setData({
        activityOptions,
        activityTitleOptions: activityOptions.map((item) => item.title),
        currentReadingIncentiveActivityId,
        currentReadingIncentiveActivityTitle,
        rewardActivityOptions,
        rewardActivityTitleOptions: rewardActivityOptions.map((item) => item.title),
        showRewardTab,
        hasContent: true,
        activeTab: nextActiveTab,
        readingForm: nextReadingForm,
        rewardForm: nextRewardForm
      }, () => {
        this.applyPendingQuickAddState()

        if (shouldPersistCache) {
          this.persistQuickAddCache()
        }
      })

      this.pendingReadingPreset = null
    }).catch((error) => {
      console.error('getActivityList error:', error)
      this.pendingReadingPreset = null
      this.setData({
        currentReadingIncentiveActivityId: '',
        currentReadingIncentiveActivityTitle: '',
        showRewardTab: false,
        activeTab: this.data.activeTab === 'reward' ? 'reading' : this.data.activeTab,
        rewardActivityOptions: [
          {
            _id: '',
            title: '不关联活动'
          }
        ],
        rewardActivityTitleOptions: ['不关联活动'],
        rewardForm: buildDefaultRewardForm()
      })
      this.replaceFormDraft('reward', buildDefaultRewardForm())
    }).finally(() => {
      this.setData({
        activitiesLoading: false
      })
    })
  },

  applyPendingQuickAddState() {
    const nextData = {}
    let shouldSetData = false

    if (this.pendingTargetTab) {
      nextData.activeTab = this.pendingTargetTab === 'reward'
        ? (this.data.showRewardTab ? 'reward' : 'reading')
        : this.pendingTargetTab
      this.pendingTargetTab = ''
      shouldSetData = true
    }

    if (this.pendingReadingPreset && Array.isArray(this.data.activityOptions) && this.data.activityOptions.length) {
      const readingActivityIndex = getActivityOptionIndex(this.data.activityOptions, this.pendingReadingPreset.activityId)
      const selectedReadingActivity = this.data.activityOptions[readingActivityIndex] || this.data.activityOptions[0]

      if (selectedReadingActivity && normalizeText(selectedReadingActivity._id) === this.pendingReadingPreset.activityId) {
        nextData.readingForm = buildReadingFormWithActivity(
          selectedReadingActivity,
          readingActivityIndex,
          this.getFormSnapshot('reading')
        )
        this.replaceFormDraft('reading', nextData.readingForm)
        this.pendingReadingPreset = null
        shouldSetData = true
      }
    }

    if (!shouldSetData) {
      return
    }

    this.setData(nextData, () => {
      this.schedulePersistQuickAddCache()
    })
  },

  hydrateQuickAddCache() {
    try {
      const cache = wx.getStorageSync(QUICK_ADD_PAGE_CACHE_KEY) || {}
      const payload = cache.payload || null

      if (!payload) {
        return
      }

      this.lastQuickAddRefreshAt = Number(cache.updatedAt) || 0
      this.rewardTabAccess = payload.rewardTabAccess || buildDefaultRewardTabAccess()

      const readingForm = {
        ...buildDefaultReadingForm(),
        ...(payload.readingForm || {})
      }
      const lifeForm = {
        ...buildDefaultLifeForm(),
        ...(payload.lifeForm || {})
      }
      const rewardForm = {
        ...buildDefaultRewardForm(),
        ...(payload.rewardForm || {})
      }

      this.replaceFormDraft('reading', readingForm)
      this.replaceFormDraft('life', lifeForm)
      this.replaceFormDraft('reward', rewardForm)

      this.setData({
        ...payload,
        readingForm,
        lifeForm,
        rewardForm,
        readingInsightCount: String(readingForm.insight || '').length,
        readingExcerptCount: String(readingForm.excerpt || '').length,
        lifeContentCount: String(lifeForm.content || '').length,
        rewardContentCount: String(rewardForm.content || '').length,
        loading: false,
        syncing: false,
        hasContent: true,
        initialized: true
      })
    } catch (error) {
      console.warn('hydrate quick-add cache failed:', error)
    }
  },

  persistQuickAddCache() {
    try {
      const readingForm = this.getFormSnapshot('reading')
      const lifeForm = this.getFormSnapshot('life')
      const rewardForm = this.getFormSnapshot('reward')

      wx.setStorageSync(QUICK_ADD_PAGE_CACHE_KEY, {
        updatedAt: Date.now(),
        payload: {
          activeTab: this.data.activeTab,
          showRewardTab: this.data.showRewardTab,
          currentReadingIncentiveActivityId: this.data.currentReadingIncentiveActivityId,
          currentReadingIncentiveActivityTitle: this.data.currentReadingIncentiveActivityTitle,
          activityOptions: this.data.activityOptions,
          activityTitleOptions: this.data.activityTitleOptions,
          rewardActivityOptions: this.data.rewardActivityOptions,
          rewardActivityTitleOptions: this.data.rewardActivityTitleOptions,
          readingForm,
          lifeForm,
          rewardForm,
          rewardTabAccess: this.rewardTabAccess || buildDefaultRewardTabAccess()
        }
      })
    } catch (error) {
      console.warn('persist quick-add cache failed:', error)
    }
  },

  schedulePersistQuickAddCache() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistQuickAddCache()
    }, 500)  // 原 120ms 改为 500ms，减少频繁保存导致的卡顿
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab

    if (!tab || tab === this.data.activeTab || (tab === 'reward' && !this.data.showRewardTab)) {
      return
    }

    this.setData({
      activeTab: tab
    }, () => {
      this.schedulePersistQuickAddCache()
    })
  },

  onReadingInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    const nextValue = e.detail.value

    this.patchFormDraft('reading', {
      [field]: nextValue
    })

    this.setData({
      [`readingForm.${field}`]: nextValue,
      readingInsightCount: field === 'insight' ? String(nextValue || '').length : this.data.readingInsightCount,
      readingExcerptCount: field === 'excerpt' ? String(nextValue || '').length : this.data.readingExcerptCount
    }, () => {
      this.schedulePersistQuickAddCache()
    })
  },

  onLifeInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    const nextValue = e.detail.value

    this.patchFormDraft('life', {
      [field]: nextValue
    })

    this.setData({
      [`lifeForm.${field}`]: nextValue,
      lifeContentCount: field === 'content' ? String(nextValue || '').length : this.data.lifeContentCount
    }, () => {
      this.schedulePersistQuickAddCache()
    })
  },

  onRewardInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    const nextValue = e.detail.value

    this.patchFormDraft('reward', {
      [field]: nextValue
    })

    this.setData({
      [`rewardForm.${field}`]: nextValue,
      rewardContentCount: field === 'content' ? String(nextValue || '').length : this.data.rewardContentCount
    }, () => {
      this.schedulePersistQuickAddCache()
    })
  },

  onActivityChange(e) {
    const scope = e.currentTarget.dataset.scope
    const activityIndex = Number(e.detail.value) || 0

    if (scope === 'life') {
      const selectedActivity = this.data.activityOptions[activityIndex] || this.data.activityOptions[0]
      const nextPatch = {
        activityIndex,
        activityId: selectedActivity._id || '',
        activityTitle: selectedActivity._id ? (selectedActivity.title || '') : ''
      }

      this.patchFormDraft('life', nextPatch)

      this.setData({
        'lifeForm.activityIndex': nextPatch.activityIndex,
        'lifeForm.activityId': nextPatch.activityId,
        'lifeForm.activityTitle': nextPatch.activityTitle
      }, () => {
        this.schedulePersistQuickAddCache()
      })
      return
    }

    if (scope === 'reward') {
      const selectedActivity = this.data.rewardActivityOptions[activityIndex] || this.data.rewardActivityOptions[0]
      const nextPatch = {
        activityIndex,
        activityId: selectedActivity._id || '',
        activityTitle: selectedActivity._id ? (selectedActivity.title || '') : ''
      }

      this.patchFormDraft('reward', nextPatch)

      this.setData({
        'rewardForm.activityIndex': nextPatch.activityIndex,
        'rewardForm.activityId': nextPatch.activityId,
        'rewardForm.activityTitle': nextPatch.activityTitle
      }, () => {
        this.schedulePersistQuickAddCache()
      })
      return
    }

    const selectedActivity = this.data.activityOptions[activityIndex] || this.data.activityOptions[0]
    const nextPatch = {
      activityIndex,
      activityId: selectedActivity._id || '',
      activityTitle: selectedActivity._id ? (selectedActivity.title || '') : ''
    }

    this.patchFormDraft('reading', nextPatch)

    this.setData({
      'readingForm.activityIndex': nextPatch.activityIndex,
      'readingForm.activityId': nextPatch.activityId,
      'readingForm.activityTitle': nextPatch.activityTitle
    }, () => {
      this.schedulePersistQuickAddCache()
    })
  },

  onApplyCurrentReadingIncentiveActivity() {
    const activityId = normalizeText(this.data.currentReadingIncentiveActivityId)

    if (!activityId) {
      wx.showToast({
        title: '当前还没有本期活动',
        icon: 'none'
      })
      return
    }

    const activityIndex = getActivityOptionIndex(this.data.activityOptions, activityId)
    const selectedActivity = this.data.activityOptions[activityIndex]

    if (!selectedActivity || !selectedActivity._id) {
      wx.showToast({
        title: '当前活动暂不可关联',
        icon: 'none'
      })
      return
    }

    const nextReadingForm = buildReadingFormWithActivity(
      selectedActivity,
      activityIndex,
      this.getFormSnapshot('reading')
    )

    this.replaceFormDraft('reading', nextReadingForm)

    this.setData({
      readingForm: nextReadingForm
    }, () => {
      this.schedulePersistQuickAddCache()
    })
  },

  onChooseLifeImages() {
    this.chooseImagesForForm('life')
  },

  onChooseReadingImages() {
    this.chooseImagesForForm('reading')
  },

  onChooseRewardImages() {
    this.chooseImagesForForm('reward')
  },

  chooseImagesForForm(scope) {
    if (scope !== 'reading' && scope !== 'life' && scope !== 'reward') {
      return
    }

    const formKey = `${scope}Form`
    const formData = this.data[formKey] || {}
    const currentImages = formData.images || []
    const submitting = !!this.data[`${scope}Submitting`]

    if (submitting) {
      return
    }

    const remainCount = 9 - currentImages.length

    if (remainCount <= 0) {
      wx.showToast({
        title: '最多选择9张图片',
        icon: 'none'
      })
      return
    }

    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFiles = res.tempFiles || []
        const nextImages = currentImages.concat(
          tempFiles
            .map((item) => item && item.tempFilePath)
            .filter(Boolean)
        )

        this.setData({
          [`${formKey}.images`]: nextImages
        }, () => {
          this.patchFormDraft(scope, {
            images: nextImages
          })
          this.schedulePersistQuickAddCache()
        })
      }
    })
  },

  onPreviewLifeImage(e) {
    this.previewImagesForForm('life', e)
  },

  onPreviewReadingImage(e) {
    this.previewImagesForForm('reading', e)
  },

  onPreviewRewardImage(e) {
    this.previewImagesForForm('reward', e)
  },

  previewImagesForForm(scope, e) {
    const url = e.currentTarget.dataset.url
    const urls = ((this.data[`${scope}Form`] || {}).images) || []

    if (!url || !urls.length) {
      return
    }

    wx.previewImage({
      current: url,
      urls
    })
  },

  onRemoveLifeImage(e) {
    this.removeImageForForm('life', e)
  },

  onRemoveReadingImage(e) {
    this.removeImageForForm('reading', e)
  },

  onRemoveRewardImage(e) {
    this.removeImageForForm('reward', e)
  },

  getQuickAddShareConfig() {
    const activeTab = normalizeText(this.data.activeTab) || 'reading'

    if (activeTab === 'life') {
      return {
        title: '内容发布｜来校园读书会记录你的生活分享',
        path: '/pages/home/home',
        shareLanding: SHARE_LANDING_HOME
      }
    }

    if (activeTab === 'reward') {
      return {
        title: '内容发布｜来晒晒你的阅读奖励',
        path: '/pages/home/home',
        shareLanding: SHARE_LANDING_HOME
      }
    }

    return {
      title: '内容发布｜来记录你的阅读打卡',
      path: '/pages/home/home',
      shareLanding: SHARE_LANDING_HOME
    }
  },

  onShareAppMessage() {
    return buildShareAppMessage(this.getQuickAddShareConfig())
  },

  onShareTimeline() {
    const shareConfig = this.getQuickAddShareConfig()
    return buildShareTimeline({
      title: shareConfig.title,
      shareLanding: shareConfig.shareLanding
    })
  },

  removeImageForForm(scope, e) {
    const index = Number(e.currentTarget.dataset.index)
    const imageList = ((((this.data[`${scope}Form`] || {}).images) || [])).slice()

    if (Number.isNaN(index) || index < 0 || index >= imageList.length) {
      return
    }

    imageList.splice(index, 1)

    this.patchFormDraft(scope, {
      images: imageList
    })

    this.setData({
      [`${scope}Form.images`]: imageList
    }, () => {
      this.schedulePersistQuickAddCache()
    })
  },

  uploadReadingImages(imageList) {
    return this.uploadImages(imageList, buildReadingImageCloudPath)
  },

  uploadLifeImages(imageList) {
    return this.uploadImages(imageList, buildLifeImageCloudPath)
  },

  uploadRewardImages(imageList) {
    return this.uploadImages(imageList, buildRewardImageCloudPath)
  },

  uploadImages(imageList, pathBuilder) {
    const safeList = Array.isArray(imageList) ? imageList.filter(Boolean) : []

    if (!safeList.length) {
      return Promise.resolve([])
    }

    return Promise.all(safeList.map((filePath) => {
      return wx.cloud.uploadFile({
        cloudPath: pathBuilder(filePath),
        filePath
      }).then((res) => res.fileID)
    }))
  },

  openSharePoster(source) {
    const posterSource = buildSharePosterSource(source)

    cacheSharePosterSource(posterSource)

    wx.navigateTo({
      url: `/pages/activity-poster/activity-poster?id=${encodeURIComponent(posterSource._id)}&type=${encodeURIComponent(posterSource.type)}`,
      success: (navRes) => {
        if (navRes.eventChannel && navRes.eventChannel.emit) {
          navRes.eventChannel.emit('acceptSharePosterSource', {
            record: posterSource
          })
        }
      }
    })
  },

  promptPosterCreation(options = {}) {
    const title = normalizeText(options.title) || '发布成功'
    const content = normalizeText(options.content) || '内容已发布成功，是否去制作海报？'
    const posterSource = options.posterSource || null
    const onComplete = typeof options.onComplete === 'function'
      ? options.onComplete
      : null

    this.posterPromptSource = posterSource
    this.posterPromptComplete = onComplete

    this.setData({
      posterPromptVisible: true,
      posterPromptTitle: title,
      posterPromptContent: content
    })
  },

  closePosterPrompt() {
    const onComplete = this.posterPromptComplete

    this.posterPromptSource = null
    this.posterPromptComplete = null

    this.setData({
      posterPromptVisible: false,
      posterPromptTitle: '',
      posterPromptContent: ''
    }, () => {
      if (onComplete) {
        onComplete()
      }
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

    this.openSharePoster(posterSource)
  },

  submitReading() {
    const form = this.getFormSnapshot('reading')
    const bookTitle = normalizeText(form.bookTitle)
    const contentTitle = normalizeText(form.contentTitle)
    const durationText = normalizeText(form.duration)
    const insight = normalizeText(form.insight)
    const excerpt = normalizeText(form.excerpt)

    if (!bookTitle) {
      wx.showToast({
        title: '请先填写书名再提交阅读打卡',
        icon: 'none'
      })
      return
    }

    if (!durationText) {
      wx.showToast({
        title: '请先填写阅读时长（分钟）',
        icon: 'none'
      })
      return
    }

    if (Number(durationText) <= 0) {
      wx.showToast({
        title: '阅读时长需填写大于0的数字',
        icon: 'none'
      })
      return
    }

    if (!insight && !excerpt) {
      wx.showToast({
        title: '请填写一句话感悟或摘抄内容中的任意一项',
        icon: 'none'
      })
      return
    }

    if (this.data.readingSubmitting) {
      return
    }

    this.setData({
      readingSubmitting: true
    })

    wx.showLoading({
      title: '提交中...'
    })

    this.uploadReadingImages(form.images || []).then((imageFileIds) => {
      return wx.cloud.callFunction({
        name: 'submitReadingLog',
        data: {
          bookTitle: form.bookTitle,
          contentTitle,
          author: form.author,
          duration: form.duration,
          pagesOrChapter: form.pagesOrChapter,
          insight: form.insight,
          excerpt: form.excerpt,
          images: imageFileIds,
          activityId: form.activityId,
          activityTitle: form.activityTitle
        }
      }).then((res) => ({
        imageFileIds,
        res
      }))
    }).then(({ imageFileIds, res }) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '提交失败',
          icon: 'none'
        })
        return
      }

      const posterSource = buildSharePosterSource({
        _id: result.readingLogId,
        type: 'reading',
        bookTitle: form.bookTitle,
        author: form.author,
        duration: form.duration,
        pagesOrChapter: form.pagesOrChapter,
        insight: form.insight,
        excerpt: form.excerpt,
        images: imageFileIds,
        activityId: form.activityId,
        activityTitle: form.activityTitle,
        dayKey: result.dayKey,
        createdAt: Date.now()
      })

      const nextReadingForm = buildDefaultReadingForm()
      this.replaceFormDraft('reading', nextReadingForm)

      this.setData({
        readingForm: nextReadingForm,
        readingInsightCount: 0,
        readingExcerptCount: 0
      }, () => {
        this.promptPosterCreation({
          title: '阅读打卡成功',
          content: '本次阅读打卡已发布成功，是否去制作海报？',
          posterSource,
          onComplete: () => {
            this.loadPageData({
              silent: true
            })
          }
        })
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('submitReadingLog error:', error)
      wx.showToast({
        title: '云函数调用失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        readingSubmitting: false
      })
    })
  },

  submitLifeShare() {
    const form = this.getFormSnapshot('life')
    const content = normalizeText(form.content)

    if (!content) {
      wx.showToast({
        title: '请先填写生活分享内容',
        icon: 'none'
      })
      return
    }

    if (this.data.lifeSubmitting) {
      return
    }

    this.setData({
      lifeSubmitting: true
    })

    wx.showLoading({
      title: '发布中...'
    })

    this.uploadLifeImages(form.images || []).then((imageFileIds) => {
      return wx.cloud.callFunction({
        name: 'submitLifeShare',
        data: {
          title: form.title,
          content: form.content,
          images: imageFileIds,
          activityId: form.activityId,
          activityTitle: form.activityTitle
        }
      }).then((res) => ({
        imageFileIds,
        res
      }))
    }).then(({ imageFileIds, res }) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '发布失败',
          icon: 'none'
        })
        return
      }

      const posterSource = buildSharePosterSource({
        _id: result.lifeShareId,
        type: 'life',
        title: form.title,
        content: form.content,
        images: imageFileIds,
        activityId: form.activityId,
        activityTitle: form.activityTitle,
        createdAt: Date.now()
      })

      const nextLifeForm = buildDefaultLifeForm()
      this.replaceFormDraft('life', nextLifeForm)

      this.setData({
        lifeForm: nextLifeForm,
        lifeContentCount: 0
      }, () => {
        this.schedulePersistQuickAddCache()
        this.promptPosterCreation({
          title: '生活分享成功',
          content: '本次生活分享已发布成功，是否去制作海报？',
          posterSource
        })
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('submitLifeShare error:', error)
      wx.showToast({
        title: '发布失败，请稍后重试',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        lifeSubmitting: false
      })
    })
  },

  submitRewardShare() {
    const form = this.getFormSnapshot('reward')
    const content = normalizeText(form.content)
    const hasImages = !!((form.images || []).length)

    if (!this.data.showRewardTab) {
      wx.showToast({
        title: '当前账号暂不可发布奖励晒单',
        icon: 'none'
      })
      return
    }

    if (!form.activityId) {
      wx.showToast({
        title: '请先选择关联的奖励活动',
        icon: 'none'
      })
      return
    }

    if (!content && !hasImages) {
      wx.showToast({
        title: '分享内容和奖励图片至少填写一项',
        icon: 'none'
      })
      return
    }

    if (this.data.rewardSubmitting) {
      return
    }

    this.setData({
      rewardSubmitting: true
    })

    wx.showLoading({
      title: '发布中...'
    })

    this.uploadRewardImages(form.images || []).then((imageFileIds) => {
      return wx.cloud.callFunction({
        name: 'submitRewardShare',
        data: {
          title: form.title,
          content: form.content,
          images: imageFileIds,
          activityId: form.activityId,
          activityTitle: form.activityTitle
        }
      }).then((res) => ({
        imageFileIds,
        res
      }))
    }).then(({ imageFileIds, res }) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '发布失败',
          icon: 'none'
        })
        return
      }

      const posterSource = buildSharePosterSource({
        _id: result.rewardShareId,
        type: 'reward',
        title: form.title,
        content: form.content,
        images: imageFileIds,
        activityId: form.activityId,
        activityTitle: form.activityTitle,
        createdAt: Date.now()
      })

      const nextRewardForm = buildDefaultRewardForm()
      this.replaceFormDraft('reward', nextRewardForm)

      this.setData({
        rewardForm: nextRewardForm,
        rewardContentCount: 0
      }, () => {
        this.schedulePersistQuickAddCache()
        this.promptPosterCreation({
          title: '奖励晒单成功',
          content: '本次奖励晒单已发布成功，是否去制作海报？',
          posterSource
        })
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('submitRewardShare error:', error)
      wx.showToast({
        title: '发布失败，请稍后重试',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        rewardSubmitting: false
      })
    })
  }
})
