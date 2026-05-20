const {
  buildPrivacyReminderData,
  privacyReminderMethods
} = require('../../utils/privacy')

const DEFAULT_ACTIVITY_OPTION = {
  _id: '',
  title: '不关联活动'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return '暂无'
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return '暂无'
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function formatDayKey(value) {
  const safeValue = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? safeValue : ''
}

function deriveAutoReadingContentTitle(insight, excerpt) {
  const safeInsight = normalizeText(insight)
  const safeExcerpt = normalizeText(excerpt)

  if (safeInsight) {
    return '感悟'
  }

  if (safeExcerpt) {
    return '摘抄'
  }

  return ''
}

function deriveLegacyAutoReadingContentTitle(insight, excerpt) {
  const safeInsight = normalizeText(insight)
  const safeExcerpt = normalizeText(excerpt)
  return safeInsight || safeExcerpt || ''
}

function resolveEditableReadingContentTitle(record = {}) {
  const storedContentTitle = normalizeText(record.contentTitle || record.title)
  const autoContentTitle = deriveAutoReadingContentTitle(record.insight, record.excerpt)
  const legacyAutoContentTitle = deriveLegacyAutoReadingContentTitle(record.insight, record.excerpt)
  const safeInsight = normalizeText(record.insight)
  const safeExcerpt = normalizeText(record.excerpt)

  if (!storedContentTitle) {
    return ''
  }

  if (
    storedContentTitle === autoContentTitle
    || storedContentTitle === legacyAutoContentTitle
    || storedContentTitle === safeInsight
    || storedContentTitle === safeExcerpt
    || storedContentTitle === '感悟'
    || storedContentTitle === '摘抄'
  ) {
    return ''
  }

  return storedContentTitle
}

function buildReadingContentTitleHint(form = {}) {
  const explicitTitle = normalizeText(form.contentTitle)
  const autoTitle = deriveAutoReadingContentTitle(form.insight, form.excerpt)

  if (explicitTitle) {
    return '当前使用手动填写的内容标题'
  }

  if (autoTitle) {
    return `留空时将自动使用：${autoTitle}`
  }

  return '留空时会按“有感悟就写感悟，否则有摘抄就写摘抄”自动生成标题'
}

function buildDefaultReadingForm(activityOption = DEFAULT_ACTIVITY_OPTION, activityIndex = 0) {
  const safeActivityOption = activityOption && typeof activityOption === 'object'
    ? activityOption
    : DEFAULT_ACTIVITY_OPTION
  const activityId = normalizeText(safeActivityOption._id)

  return {
    bookTitle: '',
    contentTitle: '',
    author: '',
    duration: '',
    pagesOrChapter: '',
    insight: '',
    excerpt: '',
    images: [],
    activityIndex,
    activityId,
    activityTitle: activityId ? normalizeText(safeActivityOption.title) : ''
  }
}

function buildDefaultLifeForm(activityOption = DEFAULT_ACTIVITY_OPTION, activityIndex = 0) {
  const safeActivityOption = activityOption && typeof activityOption === 'object'
    ? activityOption
    : DEFAULT_ACTIVITY_OPTION
  const activityId = normalizeText(safeActivityOption._id)

  return {
    title: '',
    content: '',
    images: [],
    activityIndex,
    activityId,
    activityTitle: activityId ? normalizeText(safeActivityOption.title) : ''
  }
}

function buildReadingForm(record = {}, activityOption = null, activityIndex = 0) {
  const safeActivityOption = activityOption && typeof activityOption === 'object'
    ? activityOption
    : {
      _id: normalizeText(record.activityId),
      title: normalizeText(record.activityTitle)
    }
  const activityId = normalizeText(safeActivityOption._id)

  return {
    bookTitle: normalizeText(record.bookTitle),
    contentTitle: resolveEditableReadingContentTitle(record),
    author: normalizeText(record.author),
    duration: record.duration ? String(record.duration) : '',
    pagesOrChapter: normalizeText(record.pagesOrChapter),
    insight: normalizeText(record.insight),
    excerpt: normalizeText(record.excerpt),
    images: Array.isArray(record.images) ? record.images.filter(Boolean) : [],
    activityIndex,
    activityId,
    activityTitle: activityId ? normalizeText(safeActivityOption.title) : ''
  }
}

function buildLifeForm(record = {}, activityOption = null, activityIndex = 0) {
  const safeActivityOption = activityOption && typeof activityOption === 'object'
    ? activityOption
    : {
      _id: normalizeText(record.activityId),
      title: normalizeText(record.activityTitle)
    }
  const activityId = normalizeText(safeActivityOption._id)

  return {
    title: normalizeText(record.titleText || record.title),
    content: normalizeText(record.content),
    images: Array.isArray(record.images) ? record.images.filter(Boolean) : [],
    activityIndex,
    activityId,
    activityTitle: activityId ? normalizeText(safeActivityOption.title) : ''
  }
}

function getActivityOptionIndex(optionList, activityId) {
  const safeActivityId = normalizeText(activityId)

  if (!safeActivityId) {
    return 0
  }

  const targetIndex = (optionList || []).findIndex((item) => {
    return normalizeText(item && item._id) === safeActivityId
  })

  return targetIndex >= 0 ? targetIndex : 0
}

function getFileExtension(filePath) {
  const safePath = String(filePath || '')
  const dotIndex = safePath.lastIndexOf('.')

  if (dotIndex === -1) {
    return 'png'
  }

  return safePath.slice(dotIndex + 1).toLowerCase()
}

function buildReadingImageCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  return `reading-logs/${Date.now()}-${Math.floor(Math.random() * 100000)}.${extension}`
}

function buildLifeImageCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  return `life-shares/${Date.now()}-${Math.floor(Math.random() * 100000)}.${extension}`
}

function isRemoteImage(filePath) {
  const safePath = String(filePath || '')
  return /^cloud:\/\//.test(safePath) || /^https?:\/\//.test(safePath)
}

Page({
  data: {
    loading: true,
    saving: false,
    recordLoaded: false,
    errorMessage: '',
    recordId: '',
    recordType: '',
    originalCreatedAtText: '',
    originalDayKeyText: '',
    activityOptions: [DEFAULT_ACTIVITY_OPTION],
    activityTitleOptions: [DEFAULT_ACTIVITY_OPTION.title],
    activitiesLoading: false,
    readingInsightCount: 0,
    readingExcerptCount: 0,
    lifeContentCount: 0,
    contentTitleHintText: buildReadingContentTitleHint(),
    readingForm: buildDefaultReadingForm(),
    lifeForm: buildDefaultLifeForm(),
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad(options = {}) {
    this.recordId = normalizeText(options.id)
    this.recordType = normalizeText(options.type)
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    this.openerEventChannel = eventChannel || null

    if (eventChannel && eventChannel.on) {
      eventChannel.on('acceptEditableRecord', ({ record }) => {
        if (record) {
          this.applyRecord(record)
        }
      })
    }

    setTimeout(() => {
      if (!this.data.recordLoaded) {
        this.loadRecordById()
      }
    }, 60)
  },

  loadRecordById() {
    if (!this.recordId) {
      this.setData({
        loading: false,
        errorMessage: '未获取到要编辑的记录，请返回后重试。'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getMyRecordList'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '获取记录失败')
      }

      const record = (result.records || []).find((item) => {
        return normalizeText(item && item._id) === this.recordId
          && normalizeText(item && item.type) === this.recordType
      })

      if (!record) {
        throw new Error('未找到这条记录')
      }

      this.applyRecord(record)
    }).catch((error) => {
      console.error('load editable record error:', error)
      this.setData({
        loading: false,
        recordLoaded: false,
        errorMessage: '记录加载失败，请稍后重试。'
      })
    })
  },

  applyRecord(record) {
    const recordType = normalizeText(record && record.type)

    if (recordType !== 'reading' && recordType !== 'life') {
      this.setData({
        loading: false,
        recordLoaded: false,
        errorMessage: '当前记录暂不支持编辑。'
      })
      return
    }

    this.recordId = normalizeText(record && record._id)
    this.recordType = recordType
    this.originalCreatedAt = Number(record && record.createdAt) || 0
    this.originalDayKey = recordType === 'reading' ? formatDayKey(record && record.dayKey) : ''
    const nextReadingForm = buildReadingForm(record)

    this.setData({
      loading: false,
      recordLoaded: true,
      errorMessage: '',
      recordId: this.recordId,
      recordType,
      originalCreatedAtText: formatDateTime(record && record.createdAt),
      originalDayKeyText: recordType === 'reading' ? formatDayKey(record && record.dayKey) : '',
      contentTitleHintText: buildReadingContentTitleHint(nextReadingForm),
      readingForm: nextReadingForm,
      lifeForm: buildLifeForm(record),
      readingInsightCount: String((record && record.insight) || '').length,
      readingExcerptCount: String((record && record.excerpt) || '').length,
      lifeContentCount: String((record && record.content) || '').length
    }, () => {
      this.loadActivityOptions()
    })
  },

  loadActivityOptions() {
    const recordType = this.data.recordType

    if (recordType !== 'reading' && recordType !== 'life') {
      return
    }

    this.setData({
      activitiesLoading: true
    })

    const currentForm = recordType === 'reading' ? this.data.readingForm : this.data.lifeForm
    const currentActivityId = normalizeText(currentForm && currentForm.activityId)
    const currentActivityTitle = normalizeText(currentForm && currentForm.activityTitle)

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
      const hasCurrentActivity = normalActivityList.some((item) => {
        return normalizeText(item && item._id) === currentActivityId
      })
      const activityOptions = [DEFAULT_ACTIVITY_OPTION]
        .concat(
          currentActivityId && !hasCurrentActivity
            ? [{
              _id: currentActivityId,
              title: currentActivityTitle || '原已关联活动'
            }]
            : []
        )
        .concat(normalActivityList.map((item) => {
          return {
            _id: item._id || '',
            title: item.title || '未命名活动'
          }
        }))
      const activityIndex = getActivityOptionIndex(activityOptions, currentActivityId)
      const selectedActivity = activityOptions[activityIndex] || activityOptions[0]

      this.setData({
        activityOptions,
        activityTitleOptions: activityOptions.map((item) => item.title),
        ...(recordType === 'reading'
          ? {
            readingForm: buildReadingForm(this.data.readingForm, selectedActivity, activityIndex),
            contentTitleHintText: buildReadingContentTitleHint(
              buildReadingForm(this.data.readingForm, selectedActivity, activityIndex)
            )
          }
          : {
            lifeForm: buildLifeForm(this.data.lifeForm, selectedActivity, activityIndex)
          })
      })
    }).catch((error) => {
      console.error('edit-record getActivityList error:', error)
    }).finally(() => {
      this.setData({
        activitiesLoading: false
      })
    })
  },

  onRetryTap() {
    this.loadRecordById()
  },

  onReadingInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    const nextValue = e.detail.value

    this.setData({
      [`readingForm.${field}`]: nextValue,
      contentTitleHintText: field === 'contentTitle' || field === 'insight' || field === 'excerpt'
        ? buildReadingContentTitleHint({
          ...this.data.readingForm,
          [field]: nextValue
        })
        : this.data.contentTitleHintText,
      readingInsightCount: field === 'insight' ? String(nextValue || '').length : this.data.readingInsightCount,
      readingExcerptCount: field === 'excerpt' ? String(nextValue || '').length : this.data.readingExcerptCount
    })
  },

  onLifeInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    const nextValue = e.detail.value

    this.setData({
      [`lifeForm.${field}`]: nextValue,
      lifeContentCount: field === 'content' ? String(nextValue || '').length : this.data.lifeContentCount
    })
  },

  onActivityChange(e) {
    const activityIndex = Number(e.detail.value) || 0
    const selectedActivity = this.data.activityOptions[activityIndex] || this.data.activityOptions[0]
    const formKey = this.data.recordType === 'life' ? 'lifeForm' : 'readingForm'

    this.setData({
      [`${formKey}.activityIndex`]: activityIndex,
      [`${formKey}.activityId`]: normalizeText(selectedActivity && selectedActivity._id),
      [`${formKey}.activityTitle`]: normalizeText(selectedActivity && selectedActivity._id)
        ? normalizeText(selectedActivity && selectedActivity.title)
        : ''
    })
  },

  onChooseImages(e) {
    const scope = normalizeText(e.currentTarget.dataset.scope) || this.data.recordType
    const formKey = scope === 'life' ? 'lifeForm' : 'readingForm'
    const form = this.data[formKey] || {}
    const currentImages = Array.isArray(form.images) ? form.images : []
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
          tempFiles.map((item) => item && item.tempFilePath).filter(Boolean)
        )

        this.setData({
          [`${formKey}.images`]: nextImages
        })
      }
    })
  },

  onPreviewImage(e) {
    const url = normalizeText(e.currentTarget.dataset.url)
    const scope = normalizeText(e.currentTarget.dataset.scope) || this.data.recordType
    const formKey = scope === 'life' ? 'lifeForm' : 'readingForm'
    const urls = ((this.data[formKey] || {}).images || []).filter(Boolean)

    if (!url || !urls.length) {
      return
    }

    wx.previewImage({
      current: url,
      urls
    })
  },

  onRemoveImage(e) {
    const scope = normalizeText(e.currentTarget.dataset.scope) || this.data.recordType
    const index = Number(e.currentTarget.dataset.index)
    const formKey = scope === 'life' ? 'lifeForm' : 'readingForm'
    const imageList = (((this.data[formKey] || {}).images) || []).slice()

    if (Number.isNaN(index) || index < 0 || index >= imageList.length) {
      return
    }

    imageList.splice(index, 1)

    this.setData({
      [`${formKey}.images`]: imageList
    })
  },

  uploadImages(imageList, pathBuilder) {
    const safeList = Array.isArray(imageList) ? imageList.filter(Boolean) : []

    if (!safeList.length) {
      return Promise.resolve([])
    }

    return Promise.all(safeList.map((filePath) => {
      if (isRemoteImage(filePath)) {
        return Promise.resolve(filePath)
      }

      return wx.cloud.uploadFile({
        cloudPath: pathBuilder(filePath),
        filePath
      }).then((res) => res.fileID)
    }))
  },

  onSaveTap() {
    if (this.data.saving || !this.data.recordLoaded) {
      return
    }

    if (this.data.recordType === 'life') {
      this.saveLifeRecord()
      return
    }

    this.saveReadingRecord()
  },

  saveReadingRecord() {
    const form = this.data.readingForm || {}
    const bookTitle = normalizeText(form.bookTitle)
    const contentTitle = normalizeText(form.contentTitle)
    const durationText = normalizeText(form.duration)
    const insight = normalizeText(form.insight)
    const excerpt = normalizeText(form.excerpt)
    const resolvedContentTitle = contentTitle || deriveAutoReadingContentTitle(insight, excerpt)

    if (!bookTitle) {
      wx.showToast({
        title: '请填写书名',
        icon: 'none'
      })
      return
    }

    if (!durationText) {
      wx.showToast({
        title: '请填写阅读时长',
        icon: 'none'
      })
      return
    }

    if (Number(durationText) <= 0) {
      wx.showToast({
        title: '阅读时长必须大于0',
        icon: 'none'
      })
      return
    }

    if (!insight && !excerpt) {
      wx.showToast({
        title: '感悟和摘抄请至少填写一项',
        icon: 'none'
      })
      return
    }

    this.setData({
      saving: true
    })

    wx.showLoading({
      title: '保存中...'
    })

    this.uploadImages(form.images, buildReadingImageCloudPath).then((images) => {
      return wx.cloud.callFunction({
        name: 'updateReadingLog',
        data: {
          recordId: this.data.recordId,
          bookTitle,
          contentTitle,
          author: form.author,
          duration: form.duration,
          pagesOrChapter: form.pagesOrChapter,
          insight: form.insight,
          excerpt: form.excerpt,
          images,
          activityId: form.activityId,
          activityTitle: form.activityTitle
        }
      }).then((res) => ({
        res,
        images
      }))
    }).then(({ res, images }) => {
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
        title: '修改已保存',
        icon: 'success'
      })

      if (this.openerEventChannel && this.openerEventChannel.emit) {
        this.openerEventChannel.emit('recordUpdated', {
          record: {
            _id: this.data.recordId,
            type: 'reading',
            typeText: '阅读打卡',
            title: resolvedContentTitle || bookTitle || '未填写标题',
            summary: insight || excerpt,
            createdAt: this.originalCreatedAt,
            dayKey: result.dayKey || this.originalDayKey,
            imageUrl: images[0] || '',
            images,
            bookTitle,
            contentTitle: resolvedContentTitle,
            author: normalizeText(form.author),
            duration: Number(form.duration) || 0,
            pagesOrChapter: normalizeText(form.pagesOrChapter),
            insight,
            excerpt,
            activityId: normalizeText(form.activityId),
            activityTitle: normalizeText(form.activityTitle),
            content: ''
          }
        })
      }

      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        })
      }, 500)
    }).catch((error) => {
      wx.hideLoading()
      console.error('updateReadingLog error:', error)
      wx.showToast({
        title: '保存失败，请稍后重试',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        saving: false
      })
    })
  },

  saveLifeRecord() {
    const form = this.data.lifeForm || {}
    const content = normalizeText(form.content)

    if (!content) {
      wx.showToast({
        title: '请填写分享内容',
        icon: 'none'
      })
      return
    }

    this.setData({
      saving: true
    })

    wx.showLoading({
      title: '保存中...'
    })

    this.uploadImages(form.images, buildLifeImageCloudPath).then((images) => {
      return wx.cloud.callFunction({
        name: 'updateLifeShare',
        data: {
          recordId: this.data.recordId,
          title: form.title,
          content: form.content,
          images,
          activityId: form.activityId,
          activityTitle: form.activityTitle
        }
      }).then((res) => ({
        res,
        images
      }))
    }).then(({ res, images }) => {
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
        title: '修改已保存',
        icon: 'success'
      })

      if (this.openerEventChannel && this.openerEventChannel.emit) {
        this.openerEventChannel.emit('recordUpdated', {
          record: {
            _id: this.data.recordId,
            type: 'life',
            typeText: '生活分享',
            title: normalizeText(form.title) || '生活分享',
            summary: content,
            createdAt: this.originalCreatedAt,
            dayKey: '',
            imageUrl: images[0] || '',
            images,
            bookTitle: '',
            contentTitle: '',
            author: '',
            duration: 0,
            pagesOrChapter: '',
            insight: '',
            excerpt: '',
            activityId: normalizeText(form.activityId),
            activityTitle: normalizeText(form.activityTitle),
            titleText: normalizeText(form.title),
            content
          }
        })
      }

      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        })
      }, 500)
    }).catch((error) => {
      wx.hideLoading()
      console.error('updateLifeShare error:', error)
      wx.showToast({
        title: '保存失败，请稍后重试',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        saving: false
      })
    })
  }
})
