const {
  buildSharePosterSource,
  cacheSharePosterSource
} = require('../../utils/readingPoster')
const {
  SHARE_LANDING_HOME,
  buildShareAppMessage,
  pickShareImage,
  showPageShareMenu
} = require('../../utils/share')

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

function normalizeText(value) {
  return String(value == null ? '' : value).trim()
}

function truncateText(value, maxLength = 48) {
  const safeValue = normalizeText(value)

  if (!safeValue) {
    return ''
  }

  return safeValue.length > maxLength
    ? `${safeValue.slice(0, maxLength - 1)}…`
    : safeValue
}

function formatReadingBookTitle(value) {
  const safeValue = normalizeText(value)
  return safeValue ? `《${safeValue}》` : ''
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    record: null
  },

  onLoad() {
    showPageShareMenu({
      timeline: false
    })
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()

    if (eventChannel && eventChannel.on) {
      eventChannel.on('acceptRecordDetail', ({ record }) => {
        this.setRecordData(record)
      })
      return
    }

    this.setData({
      loading: false,
      errorMessage: '未获取到记录详情，请返回列表重试。'
    })
  },

  setRecordData(record) {
    if (!record) {
      this.setData({
        loading: false,
        errorMessage: '未获取到记录详情，请返回列表重试。'
      })
      return
    }

    const images = Array.isArray(record.images) ? record.images.filter(Boolean) : []
    const recordType = record.type === 'life'
      ? 'life'
      : (record.type === 'reward' ? 'reward' : 'reading')
    const bookTitle = normalizeText(record.bookTitle)
    const contentTitle = normalizeText(record.contentTitle)
    const insight = normalizeText(record.insight)
    const excerpt = normalizeText(record.excerpt)
    const summary = normalizeText(record.summary)
    const content = normalizeText(record.content)
    const plainTitle = normalizeText(record.title)
    const heroTitle = recordType === 'reading'
      ? (
        formatReadingBookTitle(bookTitle)
        || plainTitle
        || '阅读打卡记录'
      )
      : (
        plainTitle
        || (recordType === 'reward' ? '奖励晒单' : '生活分享')
      )
    const heroSummary = recordType === 'reading'
      ? truncateText(contentTitle || excerpt || insight || summary, 40)
      : truncateText(content || summary, 54)

    this.setData({
      loading: false,
      errorMessage: '',
      record: {
        ...record,
        type: recordType,
        typeText: recordType === 'life'
          ? '生活分享'
          : (recordType === 'reward' ? '晒晒你的奖励' : '阅读打卡'),
        title: recordType === 'reading'
          ? (
            contentTitle
            || excerpt
            || insight
            || plainTitle
            || bookTitle
            || '未填写标题'
          )
          : (plainTitle || (recordType === 'reward' ? '晒晒你的奖励' : '未填写标题')),
        heroTitle,
        heroSummary,
        bookTitleText: bookTitle || '未填写书名',
        contentTitleText: contentTitle,
        insightText: insight,
        excerptText: excerpt,
        contentText: content || '暂无内容',
        createdAtText: formatDateTime(record.createdAt),
        durationText: recordType === 'reading' && record.duration ? `${Number(record.duration) || 0} 分钟` : '',
        activityTitleText: normalizeText(record.activityTitle) || '未关联活动',
        images,
        hasImages: images.length > 0
      }
    })
  },

  onRetryTap() {
    wx.navigateBack({
      delta: 1
    })
  },

  onGeneratePosterTap() {
    const record = this.data.record

    if (!record) {
      return
    }

    const posterSource = buildSharePosterSource(record)
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

  onPreviewImageTap(e) {
    const url = normalizeText(e.currentTarget.dataset.url)
    const record = this.data.record || {}
    const urls = Array.isArray(record.images) ? record.images.filter(Boolean) : []

    if (!url || !urls.length) {
      return
    }

    wx.previewImage({
      current: url,
      urls
    })
  },

  getRecordShareConfig() {
    const record = this.data.record || {}
    const recordTitle = normalizeText(record.heroTitle || record.title || record.bookTitle)
    const typeText = normalizeText(record.typeText) || '读书会记录'

    return {
      title: recordTitle ? `${typeText}｜${recordTitle}` : `${typeText}｜来自校园读书会`,
      path: '/pages/home/home',
      shareLanding: SHARE_LANDING_HOME,
      imageUrl: pickShareImage(record.imageUrl, (record.images || [])[0])
    }
  },

  onShareAppMessage() {
    return buildShareAppMessage(this.getRecordShareConfig())
  }
})
