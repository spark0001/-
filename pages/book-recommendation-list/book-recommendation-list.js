const RECOMMENDATION_LIST_CACHE_KEY = 'bookRecommendationListCacheV2'
const RECOMMENDATION_LIST_REFRESH_INTERVAL = 30 * 1000

function normalizeText(value) {
  return String(value || '').trim()
}

function buildDefaultOverview() {
  return {
    totalCount: '0',
    archiveCount: '0',
    latestUpdateText: '暂无更新'
  }
}

function formatDateTime(timestamp) {
  const safeTimestamp = Number(timestamp) || 0

  if (!safeTimestamp) {
    return '暂无时间'
  }

  const date = new Date(safeTimestamp)

  if (Number.isNaN(date.getTime())) {
    return '暂无时间'
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}`
}

function isMpArticleUrl(url) {
  return /^https?:\/\/mp\.weixin\.qq\.com\//i.test(normalizeText(url))
}

function getCoverFallbackText(title) {
  const safeTitle = normalizeText(title).replace(/\s+/g, '')

  if (!safeTitle) {
    return '书荐'
  }

  return safeTitle.slice(0, 2)
}

function buildRecommendationListData(list, currentRecommendationId) {
  return (list || []).map((item) => {
    const summary = normalizeText(item && item.summary)
    const updatedAt = Number(item && item.updatedAt) || Number(item && item.createdAt) || 0
    const title = normalizeText(item && item.title) || '未命名推荐'
    const articleUrl = normalizeText(item && item.articleUrl)
    const isCurrent = !!(item && item._id && item._id === currentRecommendationId)

    return {
      _id: item && item._id ? item._id : '',
      title,
      summaryText: summary || '暂无推荐简介',
      coverUrl: normalizeText(item && item.coverUrl),
      coverFallbackText: getCoverFallbackText(title),
      articleUrl,
      articleSourceText: isMpArticleUrl(articleUrl) ? '公众号文章' : '外部文章',
      timeText: formatDateTime(updatedAt),
      badgeText: isCurrent ? '当前推荐' : '往期精选',
      isCurrent
    }
  })
}

function buildOverviewData(recommendationList) {
  const totalCount = recommendationList.length
  const currentCount = recommendationList.some((item) => item.isCurrent) ? 1 : 0

  return {
    totalCount: String(totalCount),
    archiveCount: String(Math.max(0, totalCount - currentCount)),
    latestUpdateText: recommendationList[0] ? recommendationList[0].timeText : '暂无更新'
  }
}

function buildPagePayload(list, currentRecommendationId, canManage) {
  const recommendationList = buildRecommendationListData(list, currentRecommendationId)

  return {
    hasContent: recommendationList.length > 0,
    canManage: !!canManage,
    currentRecommendationId,
    recommendationList,
    overview: buildOverviewData(recommendationList)
  }
}

function readRecommendationListCache() {
  try {
    const cache = wx.getStorageSync(RECOMMENDATION_LIST_CACHE_KEY)

    if (!cache || typeof cache !== 'object') {
      return null
    }

    if (!Array.isArray(cache.list)) {
      return null
    }

    return cache
  } catch (error) {
    console.error('readRecommendationListCache error:', error)
    return null
  }
}

function writeRecommendationListCache(list, currentRecommendationId) {
  try {
    wx.setStorageSync(RECOMMENDATION_LIST_CACHE_KEY, {
      updatedAt: Date.now(),
      currentRecommendationId,
      list: Array.isArray(list) ? list : []
    })
  } catch (error) {
    console.error('writeRecommendationListCache error:', error)
  }
}

Page({
  data: {
    loading: true,
    syncing: false,
    hasContent: false,
    errorMessage: '',
    recommendationList: [],
    overview: buildDefaultOverview(),
    currentRecommendationId: '',
    openingRecommendationId: '',
    deletingRecommendationId: '',
    canManage: false
  },

  onLoad() {
    this.hydrateRecommendationCache()
  },

  onHide() {
    this.clearOpeningRecommendationTimer()
  },

  onUnload() {
    this.clearOpeningRecommendationTimer()
  },

  onShow() {
    const now = Date.now()
    const shouldSkipRefresh = this.data.hasContent
      && this.lastRecommendationRefreshAt
      && (now - this.lastRecommendationRefreshAt) < RECOMMENDATION_LIST_REFRESH_INTERVAL

    if (shouldSkipRefresh) {
      return
    }

    this.loadRecommendationList({
      silent: this.data.hasContent
    })
  },

  onPullDownRefresh() {
    this.loadRecommendationList({
      silent: this.data.hasContent,
      stopPullDownRefresh: true
    })
  },

  loadRecommendationList(options = {}) {
    const silent = !!options.silent && this.data.hasContent

    this.setData({
      loading: !silent,
      syncing: silent,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBookRecommendationList'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '图书推荐列表加载失败')
      }

      const currentRecommendationId = normalizeText(result.currentRecommendationId)
      this.lastRecommendationRefreshAt = Date.now()
      const pagePayload = buildPagePayload(result.list || [], currentRecommendationId, !!result.canManage)

      this.setData({
        loading: false,
        syncing: false,
        errorMessage: '',
        ...pagePayload
      })

      writeRecommendationListCache(result.list || [], currentRecommendationId)
    }).catch((error) => {
      console.error('getBookRecommendationList error:', error)

      if (this.data.hasContent) {
        this.setData({
          loading: false,
          syncing: false
        })
        return
      }

      this.setData({
        loading: false,
        syncing: false,
        errorMessage: error.message || '图书推荐列表加载失败',
        hasContent: false,
        canManage: false,
        currentRecommendationId: '',
        recommendationList: [],
        overview: buildDefaultOverview()
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  hydrateRecommendationCache() {
    const cache = readRecommendationListCache()

    if (!cache) {
      return
    }

    this.lastRecommendationRefreshAt = Number(cache.updatedAt) || 0

    this.setData({
      loading: false,
      syncing: false,
      errorMessage: '',
      ...buildPagePayload(cache.list || [], normalizeText(cache.currentRecommendationId), false)
    })
  },

  clearOpeningRecommendationTimer() {
    if (this.openingRecommendationTimer) {
      clearTimeout(this.openingRecommendationTimer)
      this.openingRecommendationTimer = null
    }
  },

  reportRecommendationClick(recommendationId) {
    if (!recommendationId) {
      return Promise.resolve()
    }

    return wx.cloud.callFunction({
      name: 'reportBookRecommendationEvent',
      data: {
        recommendationId,
        eventType: 'click'
      }
    }).catch((error) => {
      console.error('reportBookRecommendationEvent error:', error)
    })
  },

  copyRecommendationLink(articleUrl) {
    const safeUrl = normalizeText(articleUrl)

    if (!safeUrl) {
      wx.showToast({
        title: '当前推荐链接无效',
        icon: 'none'
      })
      return
    }

    wx.setClipboardData({
      data: safeUrl,
      success: () => {
        wx.showToast({
          title: '当前环境无法直接打开，链接已复制',
          icon: 'none'
        })
      },
      fail: () => {
        wx.showToast({
          title: '当前环境无法打开推荐链接',
          icon: 'none'
        })
      }
    })
  },

  openMpArticle(articleUrl) {
    if (typeof wx.openOfficialAccountArticle !== 'function') {
      this.copyRecommendationLink(articleUrl)
      return
    }

    wx.openOfficialAccountArticle({
      url: articleUrl,
      fail: (error) => {
        console.error('open official account article error:', error)
        this.copyRecommendationLink(articleUrl)
      }
    })
  },

  onRecommendationTap(e) {
    const item = e.currentTarget.dataset.item || {}
    const recommendationId = normalizeText(item._id)
    const articleUrl = normalizeText(item.articleUrl)
    const title = normalizeText(item.title)

    if (!recommendationId || !articleUrl) {
      wx.showToast({
        title: '当前暂无可查看的推荐内容',
        icon: 'none'
      })
      return
    }

    if (this.data.openingRecommendationId === recommendationId) {
      return
    }

    this.setData({
      openingRecommendationId: recommendationId
    })

    this.reportRecommendationClick(recommendationId)

    if (isMpArticleUrl(articleUrl)) {
      this.openMpArticle(articleUrl)
    } else {
      wx.navigateTo({
        url: `/pages/web-view/web-view?title=${encodeURIComponent(title || '图书推荐')}&url=${encodeURIComponent(articleUrl)}`
      })
    }

    this.clearOpeningRecommendationTimer()
    this.openingRecommendationTimer = setTimeout(() => {
      this.setData({
        openingRecommendationId: ''
      })
      this.openingRecommendationTimer = null
    }, 500)
  },

  onEditRecommendationTap(e) {
    if (!this.data.canManage) {
      return
    }

    const item = e.currentTarget.dataset.item || {}
    const recommendationId = normalizeText(item._id)

    if (!recommendationId) {
      return
    }

    wx.navigateTo({
      url: `/pages/book-recommendation-manage/book-recommendation-manage?recommendationId=${recommendationId}`
    })
  },

  onDeleteRecommendationTap(e) {
    if (!this.data.canManage) {
      return
    }

    const item = e.currentTarget.dataset.item || {}
    const recommendationId = normalizeText(item._id)
    const title = normalizeText(item.title) || '该推荐'

    if (!recommendationId || this.data.deletingRecommendationId === recommendationId) {
      return
    }

    wx.showModal({
      title: '删除推荐',
      content: `确认删除“${title}”吗？`,
      confirmColor: '#2f6bff',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        this.setData({
          deletingRecommendationId: recommendationId
        })

        wx.cloud.callFunction({
          name: 'deleteBookRecommendation',
          data: {
            recommendationId
          }
        }).then((deleteRes) => {
          const result = deleteRes.result || {}

          if (!result.success) {
            wx.showToast({
              title: result.message || '删除失败',
              icon: 'none'
            })
            return
          }

          wx.showToast({
            title: '推荐已删除',
            icon: 'success'
          })

          this.loadRecommendationList()
        }).catch((error) => {
          console.error('deleteBookRecommendation error:', error)
          wx.showToast({
            title: '删除失败',
            icon: 'none'
          })
        }).finally(() => {
          this.setData({
            deletingRecommendationId: ''
          })
        })
      }
    })
  }
})
