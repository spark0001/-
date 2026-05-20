const { maybeShowLatestNotice, confirmLatestNotice } = require('../../utils/notice')
const {
  SHARE_LANDING_HOME,
  buildShareAppMessage,
  buildShareTimeline,
  pickShareImage,
  showPageShareMenu
} = require('../../utils/share')
const {
  getCachedAccessDecision,
  fetchAccessDecision,
  shouldPromptProfileSupplement,
  resolveLatestUserInfoForProfileSupplement
} = require('../../utils/profileSupplement')
const {
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization
} = require('../../utils/privacy')

function getActivityTimeDistance(item, currentTimestamp = Date.now()) {
  const startTimestamp = Number(item && item.sortTime) || 0
  const endTimestamp = Number(item && item.endSortTime) || startTimestamp

  if (!startTimestamp && !endTimestamp) {
    return Number.MAX_SAFE_INTEGER
  }

  if (currentTimestamp >= startTimestamp && currentTimestamp <= endTimestamp) {
    return 0
  }

  if (currentTimestamp < startTimestamp) {
    return startTimestamp - currentTimestamp
  }

  return Number.MAX_SAFE_INTEGER
}

function buildNearestOpenActivityList(list, limit = 2) {
  const currentTimestamp = Date.now()

  return (list || [])
    .filter((item) => {
      const endTimestamp = Number(item && item.endSortTime) || Number(item && item.sortTime) || 0

      return !!item && !item.isScheduled && !!endTimestamp && endTimestamp >= currentTimestamp
    })
    .slice()
    .sort((a, b) => {
      const distanceDiff = getActivityTimeDistance(a, currentTimestamp) - getActivityTimeDistance(b, currentTimestamp)

      if (distanceDiff !== 0) {
        return distanceDiff
      }

      return (Number(a && a.sortTime) || 0) - (Number(b && b.sortTime) || 0)
    })
    .slice(0, limit)
}

const DEFAULT_READING_INCENTIVE_PROGRESS = {
  activityId: '',
  activityTitle: '',
  targetCount: 0,
  completedCount: 0,
  remainingCount: 0,
  thresholdType: 'accumulated',
  requireOfflineAttendance: true,
  attended: false,
  isAchieved: false,
  ruleText: '当前还没有生效中的阅读激励规则。',
  attendanceText: '',
  statusText: '当前还没有生效中的阅读激励规则。',
  statusClass: '',
  progressSuffixText: '天打卡'
}

Page({
  data: {
    progress: DEFAULT_READING_INCENTIVE_PROGRESS,
    recommendation: {
      _id: '',
      title: '',
      summary: '',
      coverUrl: '',
      articleUrl: '',
      hasRecommendation: false
    },
    recommendationLoading: false,
    activityList: [],
    activityLoading: false,
    coverErrorMap: {},
    noticePromptVisible: false,
    noticePromptTitle: '',
    noticePromptContent: '',
    noticePromptNoticeId: '',
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  normalizeText(value) {
    return String(value || '').trim()
  },

  getReadingIncentiveTargetCount(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  },

  getReadingIncentiveThresholdType(value) {
    return value === 'consecutive' ? 'consecutive' : 'accumulated'
  },

  buildReadingIncentiveRuleText(activityTitle, targetCount, thresholdType, requireOfflineAttendance) {
    const safeActivityTitle = this.normalizeText(activityTitle)

    if (!safeActivityTitle || !targetCount) {
      return '当前还没有生效中的阅读激励规则。'
    }

    const actionText = this.getReadingIncentiveThresholdType(thresholdType) === 'consecutive'
      ? '连续打卡'
      : '累计打卡'
    const requirementText = requireOfflineAttendance === false
      ? '可领奖'
      : '且线下到场可领奖'

    return `${actionText}【${safeActivityTitle}】${targetCount}天${requirementText}`
  },

  buildReadingIncentiveStatusText(progress) {
    const activityId = this.normalizeText(progress && progress.activityId)
    const activityTitle = this.normalizeText(progress && progress.activityTitle) || '当前活动'
    const targetCount = this.getReadingIncentiveTargetCount(progress && progress.targetCount)
    const thresholdType = this.getReadingIncentiveThresholdType(progress && progress.thresholdType)
    const requireOfflineAttendance = !(progress && progress.requireOfflineAttendance === false)
    const remainingCount = Math.max(0, Number(progress && progress.remainingCount) || 0)
    const attended = !!(progress && progress.attended)
    const isAchieved = !!(progress && progress.isAchieved)
    const progressText = thresholdType === 'consecutive'
      ? `连续打卡${targetCount}天`
      : `累计打卡${targetCount}天`

    if (!activityId || !targetCount) {
      return '当前还没有生效中的阅读激励规则。'
    }

    if (isAchieved) {
      return requireOfflineAttendance
        ? `已满足【${activityTitle}】${progressText}，且线下已到场，可领取本期阅读激励。`
        : `已满足【${activityTitle}】${progressText}，可领取本期阅读激励。`
    }

    if (remainingCount > 0) {
      const remainingText = thresholdType === 'consecutive'
        ? `距离连续达标还差 ${remainingCount} 天`
        : `距离达标还差 ${remainingCount} 天`

      if (!requireOfflineAttendance) {
        return `${remainingText}。`
      }

      return attended
        ? `${remainingText}，已线下到场。`
        : `${remainingText}，且需线下到场。`
    }

    if (!requireOfflineAttendance) {
      return `已完成【${activityTitle}】${progressText}。`
    }

    return attended
      ? `已完成【${activityTitle}】${progressText}，且线下已到场。`
      : `已完成【${activityTitle}】${progressText}，仍需线下到场。`
  },

  buildReadingIncentiveProgress(result = {}) {
    const activityId = this.normalizeText(result.activityId)
    const activityTitle = this.normalizeText(result.activityTitle)
    const thresholdType = this.getReadingIncentiveThresholdType(result.thresholdType)
    const requireOfflineAttendance = !(result && result.requireOfflineAttendance === false)
    const targetCount = this.getReadingIncentiveTargetCount(result.targetCount)
    const completedCount = Math.max(0, Number(result.completedCount) || 0)
    const remainingCount = Number.isFinite(Number(result.remainingCount))
      ? Math.max(0, Number(result.remainingCount))
      : Math.max(0, targetCount - completedCount)
    const attended = result.attended === true
    const isAchieved = result.isAchieved === true

    return {
      activityId,
      activityTitle,
      thresholdType,
      requireOfflineAttendance,
      targetCount,
      completedCount,
      remainingCount,
      attended,
      isAchieved,
      ruleText: this.buildReadingIncentiveRuleText(activityTitle, targetCount, thresholdType, requireOfflineAttendance),
      attendanceText: requireOfflineAttendance && activityId
        ? `到场状态：${attended ? '已到场' : '未到场'}`
        : '',
      statusText: this.buildReadingIncentiveStatusText({
        activityId,
        activityTitle,
        thresholdType,
        requireOfflineAttendance,
        targetCount,
        remainingCount,
        attended,
        isAchieved
      }),
      statusClass: isAchieved ? 'success-text' : '',
      progressSuffixText: thresholdType === 'consecutive' ? '天连续打卡' : '天打卡'
    }
  },

  buildReadingLogUrl(activityId, activityTitle) {
    const safeActivityId = this.normalizeText(activityId)

    if (!safeActivityId) {
      return '/pages/reading-log/reading-log'
    }

    return `/pages/reading-log/reading-log?activityId=${encodeURIComponent(safeActivityId)}&activityTitle=${encodeURIComponent(this.normalizeText(activityTitle))}`
  },

  isMpArticleUrl(url) {
    return /^https?:\/\/mp\.weixin\.qq\.com\//i.test(this.normalizeText(url))
  },

  copyRecommendationLink(articleUrl) {
    const safeUrl = this.normalizeText(articleUrl)

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

  onLoad() {
    showPageShareMenu()
    this.reportedExposureMap = {}
    this.reportedRecommendationExposureMap = {}
    this.profileSupplementPromptShowing = false
    this.profileSupplementPromptHandled = false
    this.noticePromptShowing = false
    this.noticePromptHandled = false
  },

  onShow() {
    this.syncTabBarSelected(0)

    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        return
      }

      this.ensureApprovedAccess().then((canAccess) => {
        if (!canAccess) {
          return
        }

        this.getMonthlyGiftProgress()
        this.getBookRecommendation()
        this.getActivityList()
      })
    })
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

  ensureApprovedAccess() {
    const cachedDecision = getCachedAccessDecision()

    if (cachedDecision) {
      if (cachedDecision.canAccess) {
        this.runApprovedEntryPrompts(cachedDecision.userInfo || {})
        return Promise.resolve(true)
      }

      wx.reLaunch({
        url: cachedDecision.redirectUrl
      })
      return Promise.resolve(false)
    }

    return fetchAccessDecision().then(({ userInfo, applicationInfo }) => {
      if (userInfo.status === 'approved') {
        this.runApprovedEntryPrompts(userInfo)
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
      console.error('home ensureApprovedAccess error:', error)
      const fallbackDecision = getCachedAccessDecision()

      if (fallbackDecision && fallbackDecision.canAccess) {
        this.runApprovedEntryPrompts(fallbackDecision.userInfo || {})
        return true
      }

      wx.reLaunch({
        url: fallbackDecision ? fallbackDecision.redirectUrl : '/pages/apply/apply'
      })
      return false
    })
  },

  getMonthlyGiftProgress() {
    wx.cloud.callFunction({
      name: 'getMonthlyGiftProgress'
    }).then((res) => {
      const result = res.result || {}

      if (result.success) {
        this.setData({
          progress: this.buildReadingIncentiveProgress(result)
        })
        return
      }

      this.setData({
        progress: DEFAULT_READING_INCENTIVE_PROGRESS
      })
    }).catch(() => {
      this.setData({
        progress: DEFAULT_READING_INCENTIVE_PROGRESS
      })
    })
  },

  maybeShowLatestNotice() {
    return maybeShowLatestNotice(this)
  },

  onNoticePromptConfirm() {
    return confirmLatestNotice(this)
  },

  noop() {},

  runApprovedEntryPrompts(userInfo) {
    return this.maybePromptProfileSupplement(userInfo).finally(() => {
      this.maybeShowLatestNotice()
    })
  },

  maybePromptProfileSupplement(userInfo) {
    if (this.profileSupplementPromptShowing || this.profileSupplementPromptHandled) {
      return Promise.resolve(false)
    }

    return resolveLatestUserInfoForProfileSupplement(userInfo).then((latestUserInfo) => {
      if (!shouldPromptProfileSupplement(latestUserInfo)) {
        return false
      }

      this.profileSupplementPromptShowing = true
      this.profileSupplementPromptHandled = true

      return new Promise((resolve) => {
        wx.showModal({
          title: '补充个人信息',
          content: '你的生日和个性签名还未完善，是否现在去补充？',
          cancelText: '取消',
          confirmText: '去补充',
          complete: () => {
            this.profileSupplementPromptShowing = false
          },
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/profile/profile'
              })
            }

            resolve(true)
          },
          fail: () => {
            resolve(false)
          }
        })
      })
    })
  },

  getActivityList() {
    this.setData({
      activityLoading: true
    })

    wx.cloud.callFunction({
      name: 'getActivityList',
      data: {
        limit: 100,
        includePast: true
      }
    }).then((res) => {
      const result = res.result || {}
      const list = result.success ? buildNearestOpenActivityList(result.list || []) : []

      this.setData({
        activityList: this.buildActivityListData(list),
        coverErrorMap: {}
      }, () => {
        if (list.length) {
          wx.nextTick(() => {
            this.reportActivityExposure(list)
          })
        }
      })
    }).catch((error) => {
      console.error('getActivityList error:', error)
      this.setData({
        activityList: []
      })
    }).finally(() => {
      this.setData({
        activityLoading: false
      })
    })
  },

  getBookRecommendation() {
    this.setData({
      recommendationLoading: true
    })

    wx.cloud.callFunction({
      name: 'getBookRecommendation'
    }).then((res) => {
      const result = res.result || {}
      const recommendation = result.success && result.recommendation
        ? result.recommendation
        : null

      this.setData({
        recommendation: recommendation ? {
          _id: recommendation._id || '',
          title: recommendation.title || '图书推荐',
          summary: recommendation.summary || '',
          coverUrl: recommendation.coverUrl || '',
          articleUrl: recommendation.articleUrl || '',
          hasRecommendation: true
        } : {
          _id: '',
          title: '',
          summary: '',
          coverUrl: '',
          articleUrl: '',
          hasRecommendation: false
        }
      }, () => {
        if (recommendation && recommendation._id) {
          this.reportBookRecommendationExposure(recommendation._id)
        }
      })
    }).catch((error) => {
      console.error('getBookRecommendation error:', error)
      this.setData({
        recommendation: {
          _id: '',
          title: '',
          summary: '',
          coverUrl: '',
          articleUrl: '',
          hasRecommendation: false
        }
      })
    }).finally(() => {
      this.setData({
        recommendationLoading: false
      })
    })
  },

  getTemplateNumber(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  },

  canUseActivityCover(url) {
    const safeUrl = this.normalizeText(url)

    if (!safeUrl) {
      return false
    }

    if (/^https?:\/\//i.test(safeUrl) && /[?&]sign=/i.test(safeUrl)) {
      return false
    }

    return true
  },

  getTemplate1ThumbMaxOffset(scalePercent) {
    const safeScalePercent = Math.min(240, Math.max(100, Number(scalePercent) || 100))
    return 200 * (safeScalePercent / 100 - 1) / 2
  },

  getTemplate2TextFieldOption(fieldKey) {
    const optionMap = {
      title: {
        label: '标题',
        defaultText: '活动标题',
        defaultY: 74,
        defaultFontSize: 28
      },
      time: {
        label: '时间',
        defaultText: '时间待定',
        defaultY: 122,
        defaultFontSize: 22
      },
      location: {
        label: '地点',
        defaultText: '地点待定',
        defaultY: 156,
        defaultFontSize: 22
      },
      theme: {
        label: '主题',
        defaultText: '主题待定',
        defaultY: 190,
        defaultFontSize: 22
      }
    }

    return optionMap[fieldKey] || optionMap.title
  },

  buildTemplate2TextField(fieldKey, textGroup, textWidth, textValue) {
    const option = this.getTemplate2TextFieldOption(fieldKey)
    const fieldConfig = textGroup && textGroup[fieldKey] && typeof textGroup[fieldKey] === 'object'
      ? textGroup[fieldKey]
      : {}
    const visibleFieldName = `show${fieldKey.charAt(0).toUpperCase()}${fieldKey.slice(1)}`
    const visible = typeof fieldConfig.visible === 'boolean'
      ? fieldConfig.visible
      : (typeof textGroup[visibleFieldName] === 'boolean' ? textGroup[visibleFieldName] : true)
    const x = Math.max(0, this.getTemplateNumber(fieldConfig.x, 24))
    const y = Math.max(0, this.getTemplateNumber(fieldConfig.y, option.defaultY))
    const fontSize = Math.max(18, this.getTemplateNumber(fieldConfig.fontSize, option.defaultFontSize))
    const color = fieldConfig.color || textGroup.color || '#222222'

    return {
      fieldKey,
      text: textValue || option.defaultText,
      visible,
      style: [
        `left:${x}rpx`,
        `top:${y}rpx`,
        `width:${textWidth}rpx`,
        `font-size:${fontSize}rpx`,
        `color:${color}`,
        `font-weight:${fieldKey === 'title' ? 700 : 500}`
      ].join(';')
    }
  },

  buildTemplate1Data(item) {
    const displayConfig = item && item.displayConfig && typeof item.displayConfig === 'object'
      ? item.displayConfig
      : {}
    const templateData = displayConfig.templateData && typeof displayConfig.templateData === 'object'
      ? displayConfig.templateData
      : {}
    const thumbElement = templateData.thumbElement && typeof templateData.thumbElement === 'object'
      ? templateData.thumbElement
      : {}
    const scalePercent = Math.min(240, Math.max(100, this.getTemplateNumber(thumbElement.scalePercent, 100)))
    const maxOffset = this.getTemplate1ThumbMaxOffset(scalePercent)
    const thumbX = Math.min(maxOffset, Math.max(-maxOffset, this.getTemplateNumber(thumbElement.x, 0)))
    const thumbY = Math.min(maxOffset, Math.max(-maxOffset, this.getTemplateNumber(thumbElement.y, 0)))

    return {
      imageStyle: [
        `transform: translate(${thumbX}rpx, ${thumbY}rpx) scale(${scalePercent / 100})`,
        'transform-origin:center center;'
      ].join(';')
    }
  },

  buildTemplateShapeStyle(shape) {
    const x = this.getTemplateNumber(shape && shape.x, 20)
    const y = this.getTemplateNumber(shape && shape.y, 20)
    const width = Math.max(20, this.getTemplateNumber(shape && shape.width, 80))
    const height = Math.max(20, this.getTemplateNumber(shape && shape.height, 80))
    const color = (shape && shape.color) || '#4D76FF'
    const opacity = Math.min(100, Math.max(0, this.getTemplateNumber(shape && shape.opacity, 100))) / 100
    const shapeType = shape && shape.shapeType ? shape.shapeType : 'rect'

    if (shapeType === 'triangle') {
      return {
        shapeKey: shape && shape.shapeId ? shape.shapeId : `${shapeType}-${x}-${y}`,
        shapeClass: 'triangle',
        shapeText: '',
        style: [
          `left:${x}rpx`,
          `top:${y}rpx`,
          'width:0',
          'height:0',
          `opacity:${opacity}`,
          `border-left:${width / 2}rpx solid transparent`,
          `border-right:${width / 2}rpx solid transparent`,
          `border-bottom:${height}rpx solid ${color}`
        ].join(';')
      }
    }

    if (shapeType === 'star') {
      const fontSize = Math.max(24, Math.min(width, height))

      return {
        shapeKey: shape && shape.shapeId ? shape.shapeId : `${shapeType}-${x}-${y}`,
        shapeClass: 'star',
        shapeText: '★',
        style: [
          `left:${x}rpx`,
          `top:${y}rpx`,
          `width:${width}rpx`,
          `height:${height}rpx`,
          `color:${color}`,
          `opacity:${opacity}`,
          `font-size:${fontSize}rpx`
        ].join(';')
      }
    }

    return {
      shapeKey: shape && shape.shapeId ? shape.shapeId : `${shapeType}-${x}-${y}`,
      shapeClass: shapeType === 'circle' ? 'circle' : 'rect',
      shapeText: '',
      style: [
        `left:${x}rpx`,
        `top:${y}rpx`,
        `width:${width}rpx`,
        `height:${height}rpx`,
        `background:${color}`,
        `opacity:${opacity}`
      ].join(';')
    }
  },

  buildTemplate2Data(item) {
    const displayConfig = item && item.displayConfig && typeof item.displayConfig === 'object'
      ? item.displayConfig
      : {}
    const templateData = displayConfig.templateData && typeof displayConfig.templateData === 'object'
      ? displayConfig.templateData
      : {}
    const safeShapes = Array.isArray(templateData.shapes) ? templateData.shapes : []
    const backgroundColor = templateData.backgroundColor || '#f5f7fc'
    const imageElement = templateData.imageElement && typeof templateData.imageElement === 'object'
      ? templateData.imageElement
      : (templateData.image && typeof templateData.image === 'object' ? templateData.image : {})
    const textGroup = templateData.textGroup && typeof templateData.textGroup === 'object'
      ? templateData.textGroup
      : {}
    const imageUrl = imageElement.url || imageElement.imageUrl || ''
    const imageX = this.getTemplateNumber(imageElement.x, 372)
    const imageY = this.getTemplateNumber(imageElement.y, 62)
    const imageWidth = Math.max(40, this.getTemplateNumber(imageElement.width, 150))
    const imageHeight = Math.max(40, this.getTemplateNumber(imageElement.height, 150))
    const textWidth = Math.max(120, this.getTemplateNumber(textGroup.width, 280))
    const textFields = [
      this.buildTemplate2TextField('title', textGroup, textWidth, item.title || '活动标题'),
      this.buildTemplate2TextField('time', textGroup, textWidth, item.timeText || '时间待定'),
      this.buildTemplate2TextField('location', textGroup, textWidth, item.location || '地点待定'),
      this.buildTemplate2TextField('theme', textGroup, textWidth, item.theme || '主题待定')
    ]

    return {
      stageStyle: `background:${backgroundColor};`,
      shapes: safeShapes.map((shape) => this.buildTemplateShapeStyle(shape)),
      imageUrl,
      hasImage: !!imageUrl,
      imageStyle: [
        `left:${imageX}rpx`,
        `top:${imageY}rpx`,
        `width:${imageWidth}rpx`,
        `height:${imageHeight}rpx`
      ].join(';'),
      textFields
    }
  },

  buildTemplate3Data(item) {
    const displayConfig = item && item.displayConfig && typeof item.displayConfig === 'object'
      ? item.displayConfig
      : {}
    const templateData = displayConfig.templateData && typeof displayConfig.templateData === 'object'
      ? displayConfig.templateData
      : {}
    const imageElement = templateData.imageElement && typeof templateData.imageElement === 'object'
      ? templateData.imageElement
      : (templateData.image && typeof templateData.image === 'object' ? templateData.image : {})
    const imageUrl = imageElement.url || imageElement.imageUrl || ''

    return {
      imageUrl,
      hasImage: !!imageUrl
    }
  },

  buildActivityListData(list) {
    return (list || []).map((item) => {
      const displayConfig = item && item.displayConfig && typeof item.displayConfig === 'object'
        ? item.displayConfig
        : {}
      const rawTemplateType = item && item.templateType
        ? item.templateType
        : displayConfig.templateType
      let templateType = 'template1'

      if (rawTemplateType === 'template2') {
        templateType = 'template2'
      } else if (rawTemplateType === 'template3') {
        templateType = 'template3'
      }

      return {
        ...item,
        templateType,
        hasCover: this.canUseActivityCover(item.coverUrl),
        template1Data: this.buildTemplate1Data(item),
        template2Data: this.buildTemplate2Data(item),
        template3Data: this.buildTemplate3Data(item)
      }
    })
  },

  getActivityShareImage(item) {
    const safeItem = item && typeof item === 'object' ? item : {}
    const displayConfig = safeItem.displayConfig && typeof safeItem.displayConfig === 'object'
      ? safeItem.displayConfig
      : {}
    const templateData = displayConfig.templateData && typeof displayConfig.templateData === 'object'
      ? displayConfig.templateData
      : {}
    const imageElement = templateData.imageElement && typeof templateData.imageElement === 'object'
      ? templateData.imageElement
      : (templateData.image && typeof templateData.image === 'object' ? templateData.image : {})
    const coverUrl = this.canUseActivityCover(safeItem.coverUrl)
      ? this.normalizeText(safeItem.coverUrl)
      : ''
    const template2ImageUrl = this.normalizeText(safeItem.template2Data && safeItem.template2Data.imageUrl)
    const template3ImageUrl = this.normalizeText(safeItem.template3Data && safeItem.template3Data.imageUrl)
    const fallbackImageUrl = this.normalizeText(imageElement.url || imageElement.imageUrl)

    return pickShareImage(
      coverUrl,
      template2ImageUrl,
      template3ImageUrl,
      fallbackImageUrl
    )
  },

  getHomeShareImage() {
    const activityList = Array.isArray(this.data.activityList) ? this.data.activityList : []

    for (let index = 0; index < activityList.length; index += 1) {
      const imageUrl = this.getActivityShareImage(activityList[index])

      if (imageUrl) {
        return imageUrl
      }
    }

    return pickShareImage(this.data.recommendation && this.data.recommendation.coverUrl)
  },

  onActivityCoverError(e) {
    const activityId = e.currentTarget.dataset.id

    if (!activityId) {
      return
    }

    this.setData({
      [`coverErrorMap.${activityId}`]: true
    })
  },

  reportActivityExposure(list) {
    const activityIds = (list || [])
      .map((item) => item && item._id)
      .filter((id) => id && !this.reportedExposureMap[id])

    if (!activityIds.length) {
      return
    }

    activityIds.forEach((id) => {
      this.reportedExposureMap[id] = true
    })

    wx.cloud.callFunction({
      name: 'reportActivityEvent',
      data: {
        eventType: 'exposure',
        activityIds
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        console.error('report exposure event failed:', result)
      }
    }).catch((error) => {
      console.error('report exposure event error:', error)
    })
  },

  reportActivityDetailClick(activityId) {
    if (!activityId) {
      return Promise.resolve()
    }

    return wx.cloud.callFunction({
      name: 'reportActivityEvent',
      data: {
        eventType: 'detail_click',
        activityId
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        console.error('report detail click event failed:', result)
      }
    }).catch((error) => {
      console.error('report detail click event error:', error)
    })
  },

  reportBookRecommendationEvent(recommendationId, eventType) {
    if (!recommendationId || !eventType) {
      return Promise.resolve()
    }

    return wx.cloud.callFunction({
      name: 'reportBookRecommendationEvent',
      data: {
        recommendationId,
        eventType
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        console.error(`report ${eventType} recommendation event failed:`, result)
      }
    }).catch((error) => {
      console.error(`report ${eventType} recommendation event error:`, error)
    })
  },

  reportBookRecommendationExposure(recommendationId) {
    if (!recommendationId || this.reportedRecommendationExposureMap[recommendationId]) {
      return
    }

    this.reportedRecommendationExposureMap[recommendationId] = true
    this.reportBookRecommendationEvent(recommendationId, 'exposure')
  },

  goBookRecommendation() {
    const recommendation = this.data.recommendation || {}
    const recommendationId = recommendation._id
    const articleUrl = recommendation.articleUrl

    if (!recommendationId || !articleUrl) {
      wx.showToast({
        title: '当前暂无可查看的推荐内容',
        icon: 'none'
      })
      return
    }

    this.reportBookRecommendationEvent(recommendationId, 'click')

    if (this.isMpArticleUrl(articleUrl)) {
      this.openMpArticle(articleUrl)
      return
    }

    wx.navigateTo({
      url: `/pages/web-view/web-view?title=${encodeURIComponent(recommendation.title || '图书推荐')}&url=${encodeURIComponent(articleUrl)}`
    })
  },

  goBookRecommendationList() {
    wx.navigateTo({
      url: '/pages/book-recommendation-list/book-recommendation-list'
    })
  },

  goReadingLog() {
    const progress = this.data.progress || DEFAULT_READING_INCENTIVE_PROGRESS
    const activityId = this.normalizeText(progress.activityId)
    const activityTitle = this.normalizeText(progress.activityTitle)

    wx.setStorageSync('quickAddTargetTab', 'reading')

    if (activityId) {
      wx.setStorageSync('quickAddReadingPreset', {
        activityId,
        activityTitle
      })
    } else {
      wx.removeStorageSync('quickAddReadingPreset')
    }

    wx.switchTab({
      url: '/pages/quick-add/quick-add'
    })
  },

  goActivityListPage() {
    wx.navigateTo({
      url: '/pages/activity-list/activity-list'
    })
  },

  getHomeShareConfig() {
    return {
      title: '校园读书会｜阅读打卡、主题活动与创作互动',
      path: '/pages/home/home',
      shareLanding: SHARE_LANDING_HOME,
      imageUrl: this.getHomeShareImage()
    }
  },

  onShareAppMessage() {
    return buildShareAppMessage(this.getHomeShareConfig())
  },

  onShareTimeline() {
    const shareConfig = this.getHomeShareConfig()
    return buildShareTimeline({
      title: shareConfig.title,
      shareLanding: shareConfig.shareLanding,
      imageUrl: shareConfig.imageUrl
    })
  },

  navigateToActivityDetail(activityId) {
    wx.navigateTo({
      url: `/pages/activity-detail/activity-detail?id=${activityId}`
    })
  },

  goCurrentReadingActivityDetail() {
    const progress = this.data.progress || DEFAULT_READING_INCENTIVE_PROGRESS
    const activityId = this.normalizeText(progress && progress.activityId)

    if (!activityId) {
      wx.showToast({
        title: '当前还没有关联活动',
        icon: 'none'
      })
      return
    }

    let hasNavigated = false
    const safeNavigate = () => {
      if (hasNavigated) {
        return
      }

      hasNavigated = true
      this.navigateToActivityDetail(activityId)
    }

    this.reportActivityDetailClick(activityId).finally(safeNavigate)
    setTimeout(safeNavigate, 200)
  },

  goActivityDetail(e) {
    const activityId = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.id
      : ''
    const targetId = activityId || (this.data.activityList[0] && this.data.activityList[0]._id)

    if (!targetId) {
      wx.showToast({
        title: '暂无活动可查看',
        icon: 'none'
      })
      return
    }

    let hasNavigated = false
    const safeNavigate = () => {
      if (hasNavigated) {
        return
      }

      hasNavigated = true
      this.navigateToActivityDetail(targetId)
    }

    this.reportActivityDetailClick(targetId).finally(safeNavigate)
    setTimeout(safeNavigate, 200)
  }
})
