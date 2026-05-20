function buildDefaultPermission() {
  return {
    activityPermission: false
  }
}

const ACTIVITY_LIST_MANAGE_CACHE_KEY = 'activityListManageCacheV1'

function normalizeActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function buildDisplayList(list, activeFilter) {
  if (activeFilter === 'scheduled') {
    return (list || []).filter((item) => item && item.isScheduled)
  }

  if (activeFilter === 'offline') {
    return (list || []).filter((item) => normalizeActivityMode(item && item.activityMode) === 'offline')
  }

  return list || []
}

function buildSummaryStats(list) {
  const activityList = list || []
  return {
    total: activityList.length,
    scheduled: activityList.filter((item) => item && item.isScheduled).length,
    offline: activityList.filter((item) => normalizeActivityMode(item && item.activityMode) === 'offline').length
  }
}

Page({
  data: {
    loading: false,
    errorMessage: '',
    hasContent: false,
    activeFilter: 'all',
    permission: buildDefaultPermission(),
    activityList: [],
    displayList: [],
    coverErrorMap: {},
    summaryStats: buildSummaryStats([])
  },

  onLoad() {
    this.hydrateCache()
    this.getActivityList()
  },

  onPullDownRefresh() {
    this.getActivityList({
      stopPullDownRefresh: true
    })
  },

  getActivityList(options = {}) {
    const hasExistingContent = !!(
      (this.data.activityList && this.data.activityList.length) ||
      (this.data.displayList && this.data.displayList.length)
    )

    this.setData({
      loading: true,
      errorMessage: '',
      hasContent: hasExistingContent || this.data.hasContent
    })

    wx.cloud.callFunction({
      name: 'getActivityList',
      data: {
        limit: 100,
        includePast: true,
        withPermission: true
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        if (!hasExistingContent) {
          this.setData({
            permission: buildDefaultPermission(),
            activityList: [],
            displayList: [],
            summaryStats: buildSummaryStats([]),
            errorMessage: result.message || '活动列表加载失败'
          })
        } else {
          this.setData({
            errorMessage: result.message || '活动列表加载失败',
            hasContent: true
          })
        }
        return
      }

      const permission = result.currentUserPermission || buildDefaultPermission()
      const activityList = result.list || []

      this.setData({
        permission,
        activityList,
        displayList: buildDisplayList(activityList, this.data.activeFilter),
        coverErrorMap: {},
        summaryStats: buildSummaryStats(activityList),
        hasContent: true
      }, () => {
        this.persistCache()
      })
    }).catch((error) => {
      console.error('activity-list-manage getActivityList error:', error)
      if (!hasExistingContent) {
        this.setData({
          permission: buildDefaultPermission(),
          activityList: [],
          displayList: [],
          summaryStats: buildSummaryStats([]),
          errorMessage: error.message || '活动列表加载失败'
        })
      } else {
        this.setData({
          errorMessage: error.message || '活动列表加载失败',
          hasContent: true
        })
      }
      wx.showToast({
        title: '活动列表加载失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        loading: false
      })

      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  hydrateCache() {
    try {
      const cache = wx.getStorageSync(ACTIVITY_LIST_MANAGE_CACHE_KEY) || {}
      const activityList = Array.isArray(cache.activityList) ? cache.activityList : []
      const permission = cache.permission || buildDefaultPermission()

      if (!activityList.length && !permission.activityPermission) {
        return
      }

      this.setData({
        permission,
        activityList,
        displayList: buildDisplayList(activityList, this.data.activeFilter),
        summaryStats: buildSummaryStats(activityList),
        hasContent: true,
        loading: false
      })
    } catch (error) {
      console.warn('hydrate activity list manage cache failed:', error)
    }
  },

  persistCache() {
    try {
      wx.setStorageSync(ACTIVITY_LIST_MANAGE_CACHE_KEY, {
        permission: this.data.permission,
        activityList: this.data.activityList
      })
    } catch (error) {
      console.warn('persist activity list manage cache failed:', error)
    }
  },

  onFilterChange(e) {
    const value = e.currentTarget.dataset.value

    if (!value || value === this.data.activeFilter) {
      return
    }

    this.setData({
      activeFilter: value,
      displayList: buildDisplayList(this.data.activityList, value)
    })
  },

  onCoverError(e) {
    const activityId = e.currentTarget.dataset.id

    if (!activityId) {
      return
    }

    this.setData({
      [`coverErrorMap.${activityId}`]: true
    })
  },

  goEditActivity(e) {
    const activityId = e.currentTarget.dataset.id

    if (!activityId) {
      return
    }

    wx.navigateTo({
      url: `/pages/admin/admin?activityId=${activityId}`
    })
  },

  goActivityDetail(e) {
    const activityId = e.currentTarget.dataset.id

    if (!activityId) {
      return
    }

    wx.navigateTo({
      url: `/pages/activity-detail/activity-detail?id=${activityId}`
    })
  }
})
