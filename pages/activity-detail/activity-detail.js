const {
  SHARE_LANDING_ACTIVITY_DETAIL,
  buildShareAppMessage,
  buildShareTimeline,
  getShareOpenInfo,
  pickShareImage,
  showPageShareMenu
} = require('../../utils/share')
const {
  getCachedAccessDecision,
  fetchAccessDecision
} = require('../../utils/profileSupplement')
const {
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization
} = require('../../utils/privacy')

function buildDefaultActivity() {
  return {
    _id: '',
    title: '',
    timeText: '',
    activityMode: 'offline',
    activityModeText: '线下',
    activityType: 'normal',
    isRewardClaim: false,
    rewardLabel: '',
    isScheduled: false,
    publishTimeText: '',
    publishStatusText: '已发布',
    location: '待定',
    description: '暂无活动简介',
    theme: '',
    officialAccountUrl: '',
    coverUrl: '',
    organizerName: '',
    statusText: '',
    isRegistered: false,
    registrationCount: 0,
    registrationStatusText: '未报名',
    registerDisabledReason: '',
    canRegister: false,
    canCancel: false,
    canOperate: false,
    registerButtonText: '立即报名'
  }
}

function buildDefaultRewardClaimMembers() {
  return []
}

function buildDefaultDashboard() {
  return {
    canView: false,
    exposureUserCount: 0,
    detailClickUserCount: 0,
    registerUserCount: 0,
    attendanceUserCount: 0
  }
}

function buildDefaultAttendanceManage() {
  return {
    visible: false,
    attendeeList: [],
    filteredAttendeeList: [],
    counts: {
      all: 0,
      attended: 0,
      absent: 0
    }
  }
}

function buildDefaultRelatedContent() {
  return {
    readingLogCount: 0,
    readingLogs: [],
    lifeShareCount: 0,
    lifeShares: []
  }
}

function buildDefaultRewardShareContent() {
  return {
    rewardShareCount: 0,
    rewardShares: []
  }
}

function buildDefaultPublicContent() {
  return {
    activeTab: '',
    tabs: [],
    currentTab: null
  }
}

function buildDefaultContentManage() {
  return {
    visible: false,
    activeFilter: 'all',
    filterOptions: [],
    totalCount: 0,
    filteredTotalCount: 0,
    readingLogCount: 0,
    readingLogs: [],
    readingLogsFiltered: [],
    lifeShareCount: 0,
    lifeShares: [],
    lifeSharesFiltered: [],
    rewardShareCount: 0,
    rewardShares: [],
    rewardSharesFiltered: []
  }
}

const CONTENT_MANAGE_FILTER_OPTIONS = [
  {
    key: 'all',
    label: '全部'
  },
  {
    key: 'featured',
    label: '精选'
  },
  {
    key: 'blocked',
    label: '屏蔽'
  },
  {
    key: 'remaining',
    label: '剩余'
  }
]

const ACTIVITY_DETAIL_CACHE_PREFIX = 'activityDetailCache:'
// 活动详情缓存时间：2 分钟（原 30 秒太短，会导致频繁刷新）
const ACTIVITY_DETAIL_CACHE_TTL = 2 * 60 * 1000

function getActivityDetailCacheKey(activityId) {
  return `${ACTIVITY_DETAIL_CACHE_PREFIX}${activityId || ''}`
}

function readActivityDetailCache(activityId) {
  if (!activityId) {
    return null
  }

  try {
    const cache = wx.getStorageSync(getActivityDetailCacheKey(activityId))

    if (cache && cache.payload) {
      return cache
    }
  } catch (error) {
    console.error('readActivityDetailCache error:', error)
  }

  return null
}

function writeActivityDetailCache(activityId, payload) {
  if (!activityId || !payload) {
    return
  }

  try {
    wx.setStorageSync(getActivityDetailCacheKey(activityId), {
      updatedAt: Date.now(),
      payload
    })
  } catch (error) {
    console.error('writeActivityDetailCache error:', error)
  }
}

function isActivityDetailCacheFresh(cache) {
  const updatedAt = Number(cache && cache.updatedAt) || 0

  if (!updatedAt) {
    return false
  }

  return Date.now() - updatedAt < ACTIVITY_DETAIL_CACHE_TTL
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

function normalizeText(value) {
  return String(value == null ? '' : value).trim()
}

function isValidArticleUrl(url) {
  return /^https?:\/\//i.test(normalizeText(url))
}

function normalizeArticleUrl(url) {
  const safeUrl = normalizeText(url)

  if (!isValidArticleUrl(safeUrl)) {
    return ''
  }

  if (safeUrl.indexOf('mp.weixin.qq.com/') === -1 || safeUrl.indexOf('#wechat_redirect') !== -1) {
    return safeUrl
  }

  return `${safeUrl}#wechat_redirect`
}

function isMpArticleUrl(url) {
  return /^https?:\/\/mp\.weixin\.qq\.com\//i.test(normalizeText(url))
}

function buildActivityViewModel(activity) {
  const isRegistered = !!activity.isRegistered
  const canRegister = !!activity.canRegister
  const canCancel = activity.status === 'published' && !activity.isScheduled && isRegistered
  const canOperate = canRegister || canCancel

  return {
    _id: activity._id || '',
    title: activity.title || '',
    timeText: activity.timeText || activity.activityTime || '',
    activityMode: activity.activityMode || 'offline',
    activityModeText: activity.activityModeText || '线下',
    activityType: activity.activityType || 'normal',
    isRewardClaim: !!activity.isRewardClaim,
    rewardLabel: activity.rewardLabel || '',
    isScheduled: !!activity.isScheduled,
    publishTimeText: activity.publishTimeText || '',
    publishStatusText: activity.publishStatusText || '已发布',
    location: activity.location || '待定',
    description: activity.description || '暂无活动简介',
    theme: activity.theme || '',
    officialAccountUrl: activity.officialAccountUrl || '',
    coverUrl: activity.coverUrl || '',
    organizerName: activity.organizerName || activity.organizationName || activity.hostName || '',
    statusText: activity.isScheduled
      ? '预约中'
      : (activity.isEnded ? '已结束' : (activity.status === 'published' ? '报名中' : '暂不可报名')),
    isRegistered,
    registrationCount: Number(activity.registrationCount) || 0,
    registrationStatusText: activity.registrationStatusText || (isRegistered ? '已报名' : '未报名'),
    registerDisabledReason: activity.registerDisabledReason || '',
    canRegister,
    canCancel,
    canOperate,
    registerButtonText: isRegistered
      ? (canCancel ? '取消报名' : '暂不可报名')
      : (canRegister ? '立即报名' : '暂不可报名')
  }
}

function getContentStatusTag(item) {
  if (item && item.reviewStatus === 'blocked') {
    return {
      text: '已屏蔽',
      className: 'blocked'
    }
  }

  if (item && item.isFeatured) {
    return {
      text: '精选内容',
      className: 'featured'
    }
  }

  return {
    text: '普通内容',
    className: 'normal'
  }
}

function splitPublicContentList(list) {
  const featuredList = []
  const recentList = []

  ;(list || []).forEach((item) => {
    if (!item || item.reviewStatus === 'blocked') {
      return
    }

    if (item.isFeatured) {
      featuredList.push(item)
      return
    }

    if (recentList.length < 3) {
      recentList.push(item)
    }
  })

  return {
    featuredList,
    recentList
  }
}

function buildPublicContentTab(key, label, countText, list, emptyText) {
  const contentGroup = splitPublicContentList(list)

  return {
    key,
    label,
    countText,
    emptyText,
    featuredList: contentGroup.featuredList,
    recentList: contentGroup.recentList,
    hasVisibleContent: contentGroup.featuredList.length > 0 || contentGroup.recentList.length > 0
  }
}

function buildPublicContentViewModel(activity, relatedContent, rewardShareContent, activeTab) {
  const tabs = []
  const isRewardClaim = !!(activity && activity.isRewardClaim)

  if (isRewardClaim) {
    tabs.push(buildPublicContentTab(
      'reward',
      '晒晒你的奖励',
      `${Number(rewardShareContent.rewardShareCount) || 0}人次已晒奖励`,
      rewardShareContent.rewardShares || [],
      '暂无公开奖励晒单'
    ))
  } else {
    tabs.push(buildPublicContentTab(
      'reading',
      '阅读打卡',
      `${Number(relatedContent.readingLogCount) || 0}人次阅读打卡`,
      relatedContent.readingLogs || [],
      '暂无公开阅读打卡'
    ))
    tabs.push(buildPublicContentTab(
      'life',
      '生活分享',
      `${Number(relatedContent.lifeShareCount) || 0}人次分享生活`,
      relatedContent.lifeShares || [],
      '暂无公开生活分享'
    ))

    if (Number(rewardShareContent.rewardShareCount) > 0) {
      tabs.push(buildPublicContentTab(
        'reward',
        '晒晒你的奖励',
        `${Number(rewardShareContent.rewardShareCount) || 0}人次已晒奖励`,
        rewardShareContent.rewardShares || [],
        '暂无公开奖励晒单'
      ))
    }
  }

  const fallbackTab = (tabs.find((item) => item.hasVisibleContent) || tabs[0] || {}).key || ''
  const nextActiveTab = tabs.some((item) => item.key === activeTab)
    ? activeTab
    : fallbackTab

  return {
    activeTab: nextActiveTab,
    tabs,
    currentTab: tabs.find((item) => item.key === nextActiveTab) || null
  }
}

function buildRelatedContentViewModel(relatedContent) {
  return {
    readingLogCount: Number(relatedContent.readingLogCount) || 0,
    readingLogs: (relatedContent.readingLogs || []).map((item) => {
      const statusTag = getContentStatusTag(item)

      return {
        _id: item._id || '',
        type: item.type || 'reading',
        title: item.title || item.bookTitle || '阅读打卡',
        bookTitle: item.bookTitle || '未填写书名',
        author: item.author || '',
        summaryText: item.summaryText || '',
        previewText: item.previewText || item.summaryText || item.bookTitle || '阅读打卡',
        createdAtText: formatDateTime(item.createdAt),
        createdAt: Number(item.createdAt) || 0,
        imageUrl: item.imageUrl || '',
        hasImage: !!item.imageUrl,
        images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
        duration: Number(item.duration) || 0,
        pagesOrChapter: item.pagesOrChapter || '',
        insight: item.insight || '',
        excerpt: item.excerpt || '',
        activityId: item.activityId || '',
        activityTitle: item.activityTitle || '',
        isFeatured: item.isFeatured === true,
        reviewStatus: item.reviewStatus || 'normal',
        statusTagText: statusTag.text,
        statusTagClass: statusTag.className
      }
    }),
    lifeShareCount: Number(relatedContent.lifeShareCount) || 0,
    lifeShares: (relatedContent.lifeShares || []).map((item) => {
      const statusTag = getContentStatusTag(item)

      return {
        _id: item._id || '',
        type: item.type || 'life',
        title: item.title || '生活分享',
        content: item.content || '',
        previewText: item.previewText || item.content || item.title || '生活分享',
        createdAtText: formatDateTime(item.createdAt),
        createdAt: Number(item.createdAt) || 0,
        imageUrl: item.imageUrl || '',
        hasImage: !!item.imageUrl,
        images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
        activityId: item.activityId || '',
        activityTitle: item.activityTitle || '',
        isFeatured: item.isFeatured === true,
        reviewStatus: item.reviewStatus || 'normal',
        statusTagText: statusTag.text,
        statusTagClass: statusTag.className
      }
    })
  }
}

function buildRewardShareContentViewModel(rewardShareContent) {
  return {
    rewardShareCount: Number(rewardShareContent.rewardShareCount) || 0,
    rewardShares: (rewardShareContent.rewardShares || []).map((item) => {
      const statusTag = getContentStatusTag(item)

      return {
        _id: item._id || '',
        type: item.type || 'reward',
        title: item.title || '',
        content: item.content || '',
        previewText: item.previewText || item.content || item.title || '晒晒你的奖励',
        createdAtText: formatDateTime(item.createdAt),
        createdAt: Number(item.createdAt) || 0,
        imageUrl: item.imageUrl || '',
        hasImage: !!item.imageUrl,
        images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
        activityId: item.activityId || '',
        activityTitle: item.activityTitle || '',
        isFeatured: item.isFeatured === true,
        reviewStatus: item.reviewStatus || 'normal',
        statusTagText: statusTag.text,
        statusTagClass: statusTag.className
      }
    })
  }
}

function matchContentManageFilter(item, filterKey) {
  if (!item) {
    return false
  }

  if (filterKey === 'featured') {
    return item.reviewStatus !== 'blocked' && item.isFeatured === true
  }

  if (filterKey === 'blocked') {
    return item.reviewStatus === 'blocked'
  }

  if (filterKey === 'remaining') {
    return item.reviewStatus !== 'blocked' && item.isFeatured !== true
  }

  return true
}

function filterManagedContentList(list, filterKey) {
  return (list || []).filter((item) => matchContentManageFilter(item, filterKey)).map((item) => {
    return {
      ...item,
      manageCardClass: item.reviewStatus === 'blocked'
        ? 'manage-card-blocked'
        : (item.isFeatured ? 'manage-card-featured' : '')
    }
  })
}

function buildContentManageViewModel(contentManage, activeFilter = 'all') {
  const relatedContent = buildRelatedContentViewModel(contentManage || {})
  const rewardShareContent = buildRewardShareContentViewModel(contentManage || {})
  const readingLogs = relatedContent.readingLogs || []
  const lifeShares = relatedContent.lifeShares || []
  const rewardShares = rewardShareContent.rewardShares || []
  const readingLogsFiltered = filterManagedContentList(readingLogs, activeFilter)
  const lifeSharesFiltered = filterManagedContentList(lifeShares, activeFilter)
  const rewardSharesFiltered = filterManagedContentList(rewardShares, activeFilter)

  return {
    visible: !!(contentManage && contentManage.visible),
    activeFilter,
    filterOptions: CONTENT_MANAGE_FILTER_OPTIONS,
    totalCount: Number(contentManage && contentManage.totalCount) || 0,
    filteredTotalCount: readingLogsFiltered.length + lifeSharesFiltered.length + rewardSharesFiltered.length,
    readingLogCount: relatedContent.readingLogCount,
    readingLogs,
    readingLogsFiltered,
    lifeShareCount: relatedContent.lifeShareCount,
    lifeShares,
    lifeSharesFiltered,
    rewardShareCount: rewardShareContent.rewardShareCount,
    rewardShares,
    rewardSharesFiltered
  }
}

function buildAttendanceManageViewModel(attendanceManage, filterValue) {
  const attendeeList = (attendanceManage.attendeeList || []).map((item, index) => {
    const attended = !!item.attended

    return {
      attendeeKey: `${item.openid || 'attendee'}-${index}`,
      openid: item.openid || '',
      avatarUrl: item.avatarUrl || '',
      avatarText: item.avatarText || '读',
      displayName: item.displayName || '未命名成员',
      contact: item.contact || '',
      attended,
      attendanceStatusText: item.attendanceStatusText || (attended ? '已到场' : '缺席')
    }
  })
  const counts = {
    all: attendeeList.length,
    attended: attendeeList.filter((item) => item.attended).length,
    absent: attendeeList.filter((item) => !item.attended).length
  }
  let filteredAttendeeList = attendeeList

  if (filterValue === 'attended') {
    filteredAttendeeList = attendeeList.filter((item) => item.attended)
  } else if (filterValue === 'absent') {
    filteredAttendeeList = attendeeList.filter((item) => !item.attended)
  }

  return {
    visible: !!attendanceManage.visible,
    attendeeList,
    filteredAttendeeList,
    counts
  }
}

function buildActivityDetailPayload(result, attendanceFilter, publicContentActiveTab, contentManageActiveFilter) {
  const relatedContent = buildRelatedContentViewModel(result.relatedContent || buildDefaultRelatedContent())
  const rewardShareContent = buildRewardShareContentViewModel(result.rewardShareContent || buildDefaultRewardShareContent())
  const activity = buildActivityViewModel(result.activity || {})
  const publicContent = buildPublicContentViewModel(
    activity,
    relatedContent,
    rewardShareContent,
    publicContentActiveTab
  )

  return {
    activity,
    rewardClaimMembers: (result.rewardClaimMembers || []).map((item, index) => {
      return {
        memberKey: `${item.openid || 'member'}-${index}`,
        avatarUrl: item.avatarUrl || '',
        avatarText: item.avatarText || '读'
      }
    }),
    dashboard: result.dashboard || buildDefaultDashboard(),
    attendanceManage: buildAttendanceManageViewModel(result.attendanceManage || buildDefaultAttendanceManage(), attendanceFilter),
    relatedContent,
    rewardShareContent,
    publicContentActiveTab: publicContent.activeTab,
    publicContent,
    contentManage: buildContentManageViewModel(
      result.contentManage || buildDefaultContentManage(),
      contentManageActiveFilter || (result.contentManage && result.contentManage.activeFilter) || 'all'
    )
  }
}

Page({
  data: {
    activityId: '',
    loading: true,
    syncing: false,
    submitting: false,
    publicContentActiveTab: '',
    contentManageExpanded: false,
    contentStatusUpdatingKey: '',
    attendanceSubmittingOpenid: '',
    attendanceExpanded: false,
    attendanceFilter: 'all',
    errorMessage: '',
    activity: buildDefaultActivity(),
    rewardClaimMembers: buildDefaultRewardClaimMembers(),
    dashboard: buildDefaultDashboard(),
    attendanceManage: buildDefaultAttendanceManage(),
    relatedContent: buildDefaultRelatedContent(),
    rewardShareContent: buildDefaultRewardShareContent(),
    publicContent: buildDefaultPublicContent(),
    contentManage: buildDefaultContentManage(),
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad(options = {}) {
    showPageShareMenu()
    const activityId = options && options.id ? options.id : ''
    const shareOpenInfo = getShareOpenInfo(options)

    if (shareOpenInfo.fromShare && shareOpenInfo.shareLanding === SHARE_LANDING_ACTIVITY_DETAIL) {
      this.enterActivityDetailFromShare(activityId)
      return
    }

    this.bootstrapActivityDetail(activityId)
  },

  bootstrapActivityDetail(activityId) {
    const safeActivityId = normalizeText(activityId)

    if (!safeActivityId) {
      this.setData({
        loading: false,
        errorMessage: '未找到要查看的活动，请从首页活动列表进入。'
      })
      return
    }

    this.setData({
      activityId: safeActivityId
    })

    const cachedDetail = readActivityDetailCache(safeActivityId)

    if (cachedDetail && cachedDetail.payload) {
      this.setData({
        loading: false,
        syncing: !isActivityDetailCacheFresh(cachedDetail),
        errorMessage: '',
        ...cachedDetail.payload
      })

      if (!isActivityDetailCacheFresh(cachedDetail)) {
        this.getActivityDetail({
          silent: true
        })
      }
      return
    }

    this.getActivityDetail()
  },

  enterActivityDetailFromShare(activityId) {
    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        this.setData({
          loading: false,
          errorMessage: '请先阅读并同意《用户隐私保护指引》后继续查看活动详情。'
        })
        return
      }

      const cachedDecision = getCachedAccessDecision()

      if (cachedDecision) {
        if (cachedDecision.canAccess) {
          this.bootstrapActivityDetail(activityId)
          return
        }

        wx.reLaunch({
          url: cachedDecision.redirectUrl
        })
        return
      }

      fetchAccessDecision().then(({ userInfo, applicationInfo }) => {
        if (userInfo.status === 'approved') {
          this.bootstrapActivityDetail(activityId)
          return
        }

        wx.reLaunch({
          url: applicationInfo.hasApplication ? '/pages/guest-status/guest-status' : '/pages/apply/apply'
        })
      }).catch((error) => {
        console.error('activity detail share access error:', error)
        const fallbackDecision = getCachedAccessDecision()

        if (fallbackDecision) {
          if (fallbackDecision.canAccess) {
            this.bootstrapActivityDetail(activityId)
            return
          }

          wx.reLaunch({
            url: fallbackDecision.redirectUrl
          })
          return
        }

        wx.reLaunch({
          url: '/pages/apply/apply'
        })
      })
    })
  },

  onPullDownRefresh() {
    this.getActivityDetail({
      stopPullDownRefresh: true
    })
  },

  getActivityDetail(options = {}) {
    if (!this.data.activityId) {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
      return
    }

    const keepCurrentContent = !!(options.silent && this.data.activity && this.data.activity._id)

    this.setData({
      loading: !keepCurrentContent,
      syncing: keepCurrentContent,
      errorMessage: keepCurrentContent ? '' : ''
    })

    wx.cloud.callFunction({
      name: 'getActivityDetail',
      data: {
        activityId: this.data.activityId
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '获取活动详情失败')
      }

      const nextPayload = buildActivityDetailPayload(
        result,
        this.data.attendanceFilter,
        this.data.publicContentActiveTab,
        this.data.contentManage.activeFilter
      )

      this.setData({
        loading: false,
        syncing: false,
        ...nextPayload
      })

      writeActivityDetailCache(this.data.activityId, nextPayload)
    }).catch((error) => {
      console.error('getActivityDetail error:', error)

      if (keepCurrentContent) {
        this.setData({
          loading: false,
          syncing: false
        })
        return
      }

      this.setData({
        loading: false,
        syncing: false,
        errorMessage: error.message || '活动详情加载失败',
        activity: buildDefaultActivity(),
        rewardClaimMembers: buildDefaultRewardClaimMembers(),
        dashboard: buildDefaultDashboard(),
        attendanceManage: buildDefaultAttendanceManage(),
        relatedContent: buildDefaultRelatedContent(),
        rewardShareContent: buildDefaultRewardShareContent(),
        publicContent: buildDefaultPublicContent(),
        contentManage: buildDefaultContentManage()
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onRegisterTap() {
    if (this.data.submitting || !this.data.activityId || !this.data.activity.canOperate) {
      return
    }

    if (this.data.activity.isRegistered) {
      if (!this.data.activity.canCancel) {
        return
      }

      wx.showModal({
        title: '取消报名',
        content: '确定取消报名吗？',
        success: (res) => {
          if (res.confirm) {
            this.submitCancelRegistration()
          }
        }
      })
      return
    }

    this.submitRegister()
  },

  goReadingLog() {
    if (this.data.activity && this.data.activity._id && !this.data.activity.isRewardClaim) {
      wx.setStorageSync('quickAddReadingPreset', {
        activityId: this.data.activity._id,
        activityTitle: this.data.activity.title || ''
      })
    }

    wx.setStorageSync('quickAddTargetTab', 'reading')
    wx.switchTab({
      url: '/pages/quick-add/quick-add'
    })
  },

  copyOfficialAccountLink(articleUrl) {
    const safeUrl = normalizeArticleUrl(articleUrl)

    if (!safeUrl) {
      wx.showToast({
        title: '当前公众号链接无效',
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
          title: '当前公众号链接无法打开',
          icon: 'none'
        })
      }
    })
  },

  openOfficialAccountLink(articleUrl) {
    const safeUrl = normalizeArticleUrl(articleUrl)

    if (!safeUrl) {
      wx.showToast({
        title: '当前公众号链接无效',
        icon: 'none'
      })
      return
    }

    if (isMpArticleUrl(safeUrl)) {
      if (typeof wx.openOfficialAccountArticle !== 'function') {
        this.copyOfficialAccountLink(safeUrl)
        return
      }

      wx.openOfficialAccountArticle({
        url: safeUrl,
        fail: (error) => {
          console.error('openOfficialAccountArticle error:', error)
          this.copyOfficialAccountLink(safeUrl)
        }
      })
      return
    }

    wx.navigateTo({
      url: `/pages/web-view/web-view?title=${encodeURIComponent('相关公众号')}&url=${encodeURIComponent(safeUrl)}`
    })
  },

  onOfficialAccountTap() {
    this.openOfficialAccountLink(this.data.activity && this.data.activity.officialAccountUrl)
  },

  onToggleAttendanceExpand() {
    this.setData({
      attendanceExpanded: !this.data.attendanceExpanded
    })
  },

  onToggleContentManageExpand() {
    this.setData({
      contentManageExpanded: !this.data.contentManageExpanded
    })
  },

  onContentManageFilterChange(e) {
    const nextFilter = e.currentTarget.dataset.filter || 'all'

    if (!nextFilter || nextFilter === this.data.contentManage.activeFilter) {
      return
    }

    this.setData({
      contentManage: buildContentManageViewModel(this.data.contentManage, nextFilter)
    })
  },

  onPublicContentTabChange(e) {
    const nextTab = e.currentTarget.dataset.tab || ''

    if (!nextTab || nextTab === this.data.publicContentActiveTab) {
      return
    }

    const publicContent = buildPublicContentViewModel(
      this.data.activity,
      this.data.relatedContent,
      this.data.rewardShareContent,
      nextTab
    )

    this.setData({
      publicContentActiveTab: publicContent.activeTab,
      publicContent
    })
  },

  onAttendanceFilterChange(e) {
    const filterValue = e.currentTarget.dataset.filter || 'all'

    if (filterValue === this.data.attendanceFilter) {
      return
    }

    this.setData({
      attendanceFilter: filterValue,
      attendanceManage: buildAttendanceManageViewModel(this.data.attendanceManage, filterValue)
    })
  },

  onToggleAttendedTap(e) {
    const targetOpenid = e.currentTarget.dataset.openid || ''

    if (!targetOpenid || !this.data.activityId || this.data.attendanceSubmittingOpenid) {
      return
    }

    this.setData({
      attendanceSubmittingOpenid: targetOpenid
    })

    wx.cloud.callFunction({
      name: 'markActivityAttendance',
      data: {
        activityId: this.data.activityId,
        targetOpenid
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: result.message || '保存成功',
        icon: 'success'
      })

      this.getActivityDetail({
        silent: true
      })
    }).catch((error) => {
      console.error('markActivityAttendance error:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        attendanceSubmittingOpenid: ''
      })
    })
  },

  getRelatedRecordByScope(scope, index, recordId) {
    const safeRecordId = recordId || ''

    if (safeRecordId) {
      if (scope === 'reward') {
        return this.data.rewardShareContent.rewardShares.find((item) => item._id === safeRecordId) || null
      }

      if (scope === 'life') {
        return this.data.relatedContent.lifeShares.find((item) => item._id === safeRecordId) || null
      }

      return this.data.relatedContent.readingLogs.find((item) => item._id === safeRecordId) || null
    }

    const safeIndex = Number(index)

    if (!Number.isFinite(safeIndex) || safeIndex < 0) {
      return null
    }

    if (scope === 'reward') {
      return this.data.rewardShareContent.rewardShares[safeIndex] || null
    }

    if (scope === 'life') {
      return this.data.relatedContent.lifeShares[safeIndex] || null
    }

    return this.data.relatedContent.readingLogs[safeIndex] || null
  },

  getManagedRecordByScope(scope, index) {
    const safeIndex = Number(index)

    if (!Number.isFinite(safeIndex) || safeIndex < 0) {
      return null
    }

    if (scope === 'reward') {
      return this.data.contentManage.rewardSharesFiltered[safeIndex] || null
    }

    if (scope === 'life') {
      return this.data.contentManage.lifeSharesFiltered[safeIndex] || null
    }

    return this.data.contentManage.readingLogsFiltered[safeIndex] || null
  },

  goRelatedRecordDetail(e) {
    const scope = e.currentTarget.dataset.scope || 'reading'
    const recordId = e.currentTarget.dataset.recordId || ''
    const index = Number(e.currentTarget.dataset.index)
    const record = this.getRelatedRecordByScope(scope, index, recordId)

    if (!record) {
      return
    }

    wx.navigateTo({
      url: '/pages/record-detail/record-detail',
      success: (navRes) => {
        navRes.eventChannel.emit('acceptRecordDetail', {
          record
        })
      }
    })
  },

  updateContentStatus(record, data, successText) {
    if (!record || !record._id || this.data.contentStatusUpdatingKey) {
      return
    }

    const updatingKey = `${record.type}-${record._id}`

    this.setData({
      contentStatusUpdatingKey: updatingKey
    })

    wx.cloud.callFunction({
      name: 'updateActivityContentStatus',
      data: {
        recordId: record._id,
        recordType: record.type,
        activityId: this.data.activityId,
        ...data
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '内容状态保存失败')
      }

      wx.showToast({
        title: successText,
        icon: 'none'
      })

      this.getActivityDetail({
        silent: true
      })
    }).catch((error) => {
      console.error('updateActivityContentStatus error:', error)
      wx.showToast({
        title: error.message || '内容状态保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        contentStatusUpdatingKey: ''
      })
    })
  },

  onToggleContentBlockTap(e) {
    const scope = e.currentTarget.dataset.scope || 'reading'
    const index = Number(e.currentTarget.dataset.index)
    const record = this.getManagedRecordByScope(scope, index)

    if (!record) {
      return
    }

    this.updateContentStatus(record, {
      reviewStatus: record.reviewStatus === 'blocked' ? 'normal' : 'blocked'
    }, record.reviewStatus === 'blocked' ? '已取消屏蔽' : '已屏蔽内容')
  },

  onToggleContentFeatureTap(e) {
    const scope = e.currentTarget.dataset.scope || 'reading'
    const index = Number(e.currentTarget.dataset.index)
    const record = this.getManagedRecordByScope(scope, index)

    if (!record || record.reviewStatus === 'blocked') {
      return
    }

    this.updateContentStatus(record, {
      isFeatured: !record.isFeatured
    }, record.isFeatured ? '已取消精选' : '已设为精选')
  },

  submitRegister() {
    if (this.data.submitting || !this.data.activityId || !this.data.activity.canRegister) {
      return
    }

    this.setData({
      submitting: true
    })

    wx.showLoading({
      title: '报名中...'
    })

    wx.cloud.callFunction({
      name: 'registerActivity',
      data: {
        activityId: this.data.activityId
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '报名失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: '报名成功',
        icon: 'success'
      })

      this.getActivityDetail({
        silent: true
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('registerActivity error:', error)
      wx.showToast({
        title: '报名失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        submitting: false
      })
    })
  },

  submitCancelRegistration() {
    if (this.data.submitting || !this.data.activityId || !this.data.activity.canCancel) {
      return
    }

    this.setData({
      submitting: true
    })

    wx.showLoading({
      title: '取消中...'
    })

    wx.cloud.callFunction({
      name: 'cancelActivityRegistration',
      data: {
        activityId: this.data.activityId
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '取消报名失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: '已取消报名',
        icon: 'success'
      })

      this.getActivityDetail({
        silent: true
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('cancelActivityRegistration error:', error)
      wx.showToast({
        title: '取消报名失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        submitting: false
      })
    })
  },

  onRetryTap() {
    this.getActivityDetail()
  },

  getActivityShareConfig() {
    const activity = this.data.activity || buildDefaultActivity()
    const activityId = normalizeText(this.data.activityId || activity._id)
    const title = normalizeText(activity.title)

    return {
      title: title ? `活动详情｜${title}` : '活动详情｜校园读书会活动',
      path: '/pages/activity-detail/activity-detail',
      query: activityId ? { id: activityId } : {},
      shareLanding: SHARE_LANDING_ACTIVITY_DETAIL,
      imageUrl: pickShareImage(activity.coverUrl)
    }
  },

  onShareAppMessage() {
    return buildShareAppMessage(this.getActivityShareConfig())
  },

  onShareTimeline() {
    const shareConfig = this.getActivityShareConfig()
    return buildShareTimeline({
      title: shareConfig.title,
      query: shareConfig.query,
      shareLanding: shareConfig.shareLanding,
      imageUrl: shareConfig.imageUrl
    })
  }
})
