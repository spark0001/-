const {
  buildPrivacyReminderData,
  privacyReminderMethods
} = require('../../utils/privacy')

function buildDefaultForm() {
  return {
    _id: '',
    title: '',
    summary: '',
    coverUrl: '',
    articleUrl: ''
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function getFileExtension(filePath) {
  const safePath = String(filePath || '')
  const dotIndex = safePath.lastIndexOf('.')

  if (dotIndex === -1) {
    return 'png'
  }

  return safePath.slice(dotIndex + 1).toLowerCase()
}

function buildRecommendationCoverCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `book-recommendations/${randomPart}.${extension}`
}

function formatRateText(clickCount, exposureCount) {
  if (!exposureCount) {
    return '0%'
  }

  return `${Number(((clickCount / exposureCount) * 100).toFixed(1))}%`
}

function isValidArticleUrl(url) {
  return /^https?:\/\//i.test(normalizeText(url))
}

function normalizeArticleUrl(url) {
  const safeUrl = normalizeText(url)

  if (!isValidArticleUrl(safeUrl)) {
    return safeUrl
  }

  if (safeUrl.indexOf('mp.weixin.qq.com/') === -1) {
    return safeUrl
  }

  if (safeUrl.indexOf('#wechat_redirect') !== -1) {
    return safeUrl
  }

  return `${safeUrl}#wechat_redirect`
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

function buildRecommendationListData(list, currentRecommendationId) {
  return (list || []).map((item) => {
    const summary = normalizeText(item && item.summary)
    const updatedAt = Number(item && item.updatedAt) || Number(item && item.createdAt) || 0

    return {
      _id: item && item._id ? item._id : '',
      title: normalizeText(item && item.title) || '未命名推荐',
      summary,
      summaryText: summary || '暂无推荐简介',
      coverUrl: normalizeText(item && item.coverUrl),
      articleUrl: normalizeText(item && item.articleUrl),
      timeText: formatDateTime(updatedAt),
      isCurrent: !!(item && item._id && item._id === currentRecommendationId)
    }
  })
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    saving: false,
    uploadingCover: false,
    stats: {
      exposureCount: 0,
      clickCount: 0,
      clickRateText: '0%'
    },
    form: buildDefaultForm(),
    currentRecommendationId: '',
    recommendationList: [],
    recommendationPreviewList: [],
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad(options = {}) {
    this.pendingEditRecommendationId = normalizeText(options.recommendationId)
  },

  onShow() {
    this.loadRecommendationData()
  },

  onPullDownRefresh() {
    this.loadRecommendationData({
      stopPullDownRefresh: true
    })
  },

  loadRecommendationData(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBookRecommendationManageData'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '图书推荐数据加载失败')
      }

      const recommendation = result.recommendation || {}
      const currentRecommendationId = normalizeText(result.currentRecommendationId || recommendation._id)
      const recommendationList = buildRecommendationListData(result.recommendationList || [], currentRecommendationId)
      const exposureCount = Number(result.stats && result.stats.exposureCount) || 0
      const clickCount = Number(result.stats && result.stats.clickCount) || 0

      this.setData({
        loading: false,
        currentRecommendationId,
        recommendationList,
        recommendationPreviewList: recommendationList.slice(0, 3),
        form: buildDefaultForm(),
        stats: {
          exposureCount,
          clickCount,
          clickRateText: formatRateText(clickCount, exposureCount)
        }
      })

      if (this.pendingEditRecommendationId) {
        this.applyEditRecommendationById(this.pendingEditRecommendationId, recommendationList)
        this.pendingEditRecommendationId = ''
      }
    }).catch((error) => {
      console.error('getBookRecommendationManageData error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '图书推荐数据加载失败',
        form: buildDefaultForm(),
        currentRecommendationId: '',
        recommendationList: [],
        recommendationPreviewList: [],
        stats: {
          exposureCount: 0,
          clickCount: 0,
          clickRateText: '0%'
        }
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    this.setData({
      [`form.${field}`]: e.detail.value
    })
  },

  onChooseCoverTap() {
    if (this.data.uploadingCover) {
      return
    }

    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseCoverImage('camera')
          return
        }

        if (res.tapIndex === 1) {
          this.chooseCoverImage('album')
        }
      }
    })
  },

  chooseCoverImage(sourceType) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: [sourceType],
      success: (res) => {
        const tempFilePath = res.tempFilePaths && res.tempFilePaths[0]

        if (!tempFilePath) {
          return
        }

        this.uploadCoverImage(tempFilePath)
      }
    })
  },

  uploadCoverImage(tempFilePath) {
    this.setData({
      uploadingCover: true
    })

    wx.showLoading({
      title: '上传中...'
    })

    wx.cloud.uploadFile({
      cloudPath: buildRecommendationCoverCloudPath(tempFilePath),
      filePath: tempFilePath
    }).then((res) => {
      wx.hideLoading()
      this.setData({
        'form.coverUrl': res.fileID || ''
      })
      wx.showToast({
        title: '封面已上传',
        icon: 'success'
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('upload recommendation cover error:', error)
      wx.showToast({
        title: '封面上传失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        uploadingCover: false
      })
    })
  },

  onClearCoverTap() {
    this.setData({
      'form.coverUrl': ''
    })
  },

  applyRecommendationForm(item = {}) {
    this.setData({
      form: {
        _id: item._id || '',
        title: item.title || '',
        summary: item.summary || '',
        coverUrl: item.coverUrl || '',
        articleUrl: item.articleUrl || ''
      }
    })
  },

  applyEditRecommendationById(recommendationId, list = []) {
    const targetId = normalizeText(recommendationId)

    if (!targetId) {
      return
    }

    const target = (list || []).find((item) => normalizeText(item && item._id) === targetId)

    if (!target) {
      return
    }

    this.applyRecommendationForm(target)

    wx.nextTick(() => {
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 200
      })
    })
  },

  onEditRecommendationTap(e) {
    const item = e.currentTarget.dataset.item || {}
    this.applyRecommendationForm(item)
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 200
    })
  },

  onDeleteRecommendationTap(e) {
    const item = e.currentTarget.dataset.item || {}
    const recommendationId = normalizeText(item._id || this.data.form._id)
    const title = normalizeText(item.title || this.data.form.title) || '该推荐'

    if (!recommendationId) {
      wx.showToast({
        title: '当前没有可删除的推荐',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '删除推荐',
      content: `确认删除“${title}”吗？删除后不会保留在推荐列表中。`,
      confirmColor: '#2f6bff',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        wx.showLoading({
          title: '删除中...'
        })

        wx.cloud.callFunction({
          name: 'deleteBookRecommendation',
          data: {
            recommendationId
          }
        }).then((deleteRes) => {
          const result = deleteRes.result || {}

          wx.hideLoading()

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

          if (normalizeText(this.data.form._id) === recommendationId) {
            this.setData({
              form: buildDefaultForm()
            })
          }

          this.loadRecommendationData()
        }).catch((error) => {
          wx.hideLoading()
          console.error('deleteBookRecommendation error:', error)
          wx.showToast({
            title: '删除失败',
            icon: 'none'
          })
        })
      }
    })
  },

  onSaveTap() {
    const form = this.data.form || {}
    const title = normalizeText(form.title)
    const summary = normalizeText(form.summary)
    const articleUrl = normalizeArticleUrl(form.articleUrl)

    if (!title) {
      wx.showToast({
        title: '请填写推荐标题',
        icon: 'none'
      })
      return
    }

    if (!summary) {
      wx.showToast({
        title: '请填写推荐简介',
        icon: 'none'
      })
      return
    }

    if (!articleUrl) {
      wx.showToast({
        title: '请填写公众号文章链接',
        icon: 'none'
      })
      return
    }

    if (!isValidArticleUrl(articleUrl)) {
      wx.showToast({
        title: '请填写有效的文章链接',
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

    wx.showLoading({
      title: '保存中...'
    })

    wx.cloud.callFunction({
      name: 'saveBookRecommendation',
      data: {
        recommendationId: form._id || '',
        title,
        summary,
        coverUrl: form.coverUrl || '',
        articleUrl
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: '推荐已保存',
        icon: 'success'
      })

      this.setData({
        form: buildDefaultForm()
      })

      this.loadRecommendationData()
    }).catch((error) => {
      wx.hideLoading()
      console.error('saveBookRecommendation error:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        saving: false
      })
    })
  },

  goRecommendationList() {
    wx.navigateTo({
      url: '/pages/book-recommendation-list/book-recommendation-list'
    })
  }
})
