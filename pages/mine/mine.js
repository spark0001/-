const {
  getCachedAccessDecision,
  setCachedAccessDecision,
  fetchAccessDecision,
  shouldPromptProfileSupplement
} = require('../../utils/profileSupplement')
const {
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization
} = require('../../utils/privacy')
const {
  SHARE_LANDING_HOME,
  buildShareAppMessage,
  buildShareTimeline,
  pickShareImage,
  showPageShareMenu
} = require('../../utils/share')

const DEFAULT_PROFILE = {
  displayName: '读者同学',
  subtitle: '还没有提交报名信息',
  avatarUrl: '',
  avatarText: '读',
  signatureText: '未填写个性签名',
  signatureFilled: false,
  roleText: '访客',
  userStatusText: '未报名',
  userStatusClass: 'neutral',
  createdAtText: '暂无'
}

const DEFAULT_APPLICATION = {
  hasApplication: false,
  statusText: '未提交报名',
  statusClass: 'neutral',
  name: '暂无',
  gradeMajor: '暂无',
  contact: '未填写',
  reason: '',
  createdAtText: '暂无'
}

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1
const HEATMAP_WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const DEFAULT_READING = {
  periodLabel: '本期',
  activityId: '',
  activityTitle: '',
  ruleText: '当前还没有生效中的阅读激励规则。',
  totalLogs: 0,
  completedCount: 0,
  remainingCount: 0,
  totalDuration: 0,
  targetCount: 0,
  thresholdType: 'accumulated',
  requireOfflineAttendance: true,
  attended: false,
  attendanceText: '',
  isAchieved: false,
  progressText: '当前还没有生效中的阅读激励规则。',
  progressTextClass: '',
  latestLog: null,
  currentStats: [],
  totalStats: [],
  recentWeekBars: [],
  recentWeekAverageText: '0分钟',
  recentWeekPeakText: '0分钟',
  monthlyFavorites: [],
  currentMonth: CURRENT_MONTH,
  currentMonthLabel: `${CURRENT_MONTH}月`,
  currentMonthFavoriteSubtitle: `${CURRENT_MONTH}月阅读时间最长的书籍`,
  annualFavoriteSubtitle: '每个月阅读时间最长的书籍',
  currentMonthFavorite: {
    month: CURRENT_MONTH,
    monthLabel: `${CURRENT_MONTH}月`,
    hasData: false,
    bookTitle: '',
    shortTitle: '',
    durationMinutes: 0,
    durationText: '暂无数据',
    coverStyle: ''
  },
  currentMonthHeatmap: {
    month: CURRENT_MONTH,
    monthLabel: `${CURRENT_MONTH}月`,
    cells: []
  },
  heatmapMonthSubtitle: `${CURRENT_MONTH}月每日阅读时长分布`,
  heatmapYearSubtitle: `${CURRENT_YEAR}年每日阅读时长分布`,
  annualHeatmapMonths: [],
  annualHeatmapYear: CURRENT_YEAR
}

const DEFAULT_DATA_CENTER = {
  canView: false,
  cards: []
}

const DEFAULT_RECORD_LIST = []
const MINE_PAGE_CACHE_KEY = 'minePageCacheV1'
const MINE_SILENT_REFRESH_INTERVAL = 30000

function normalizeText(value) {
  return String(value || '').trim()
}

function buildDefaultHeatmapDetail() {
  return {
    visible: false,
    dateText: '',
    durationText: ''
  }
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDate(timestamp) {
  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${formatDate(timestamp)} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`
}

function formatDurationCompact(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0)

  if (!safeMinutes) {
    return ''
  }

  if (safeMinutes >= 60) {
    const hourValue = safeMinutes / 60
    const precision = hourValue >= 10 ? 0 : 1
    return `${Number(hourValue.toFixed(precision))}h`
  }

  return `${safeMinutes}m`
}

function formatDurationHourMinute(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0)
  const hourPart = Math.floor(safeMinutes / 60)
  const minutePart = safeMinutes % 60

  if (hourPart <= 0) {
    return `${minutePart}m`
  }

  if (minutePart <= 0) {
    return `${hourPart}h`
  }

  return `${hourPart}h${minutePart}m`
}

function formatDurationLong(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0)
  const hourPart = Math.floor(safeMinutes / 60)
  const minutePart = safeMinutes % 60

  if (hourPart <= 0) {
    return `${minutePart}分钟`
  }

  if (minutePart <= 0) {
    return `${hourPart}小时`
  }

  return `${hourPart}小时${minutePart}分`
}

function truncateText(value, maxLength = 9) {
  const safeValue = normalizeText(value)

  if (!safeValue) {
    return ''
  }

  return safeValue.length > maxLength
    ? `${safeValue.slice(0, maxLength - 1)}…`
    : safeValue
}

function getBarLevel(durationMinutes, maxDuration) {
  if (!durationMinutes || maxDuration <= 0) {
    return 0
  }

  const ratio = durationMinutes / maxDuration

  if (ratio >= 0.75) {
    return 4
  }

  if (ratio >= 0.5) {
    return 3
  }

  if (ratio >= 0.25) {
    return 2
  }

  return 1
}

function getMonthlyFavoriteStyle(index) {
  const backgroundList = [
    'background: linear-gradient(160deg, #5f93ff 0%, #2f6dff 100%);',
    'background: linear-gradient(160deg, #6ca9ff 0%, #4d7fff 100%);',
    'background: linear-gradient(160deg, #76b7ff 0%, #3f86ff 100%);',
    'background: linear-gradient(160deg, #88c6ff 0%, #5e8fff 100%);'
  ]

  return backgroundList[index % backgroundList.length]
}

function buildReadingStatCards(summary, firstLabel = '打卡次数') {
  const totalLogs = Number(summary && summary.totalLogs) || 0
  const completedCount = Number(summary && summary.completedCount) || 0
  const totalDuration = Number(summary && summary.totalDuration) || 0

  return [
    {
      key: 'totalLogs',
      label: firstLabel,
      value: String(totalLogs)
    },
    {
      key: 'completedCount',
      label: '打卡天数',
      value: String(completedCount)
    },
    {
      key: 'totalDuration',
      label: '累计分钟',
      value: String(totalDuration)
    }
  ]
}

function buildMonthLabel(month) {
  return `${Number(month) || 1}月`
}

function buildCurrentLocalDayKey() {
  const currentDate = new Date()

  return `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())}`
}

function buildHeatmapDateText(year, month, day) {
  if (!year || !month || !day) {
    return ''
  }

  return `${year}年${buildMonthLabel(month)}${Number(day)}日`
}

function buildHeatmapCellClass(level, isPlaceholder) {
  if (isPlaceholder) {
    return 'heatmap-cell placeholder'
  }

  return `heatmap-cell level-${Number(level) || 0}`
}

function buildEmptyHeatmapMonth(month = CURRENT_MONTH, year = CURRENT_YEAR) {
  const safeYear = Number(year) || CURRENT_YEAR
  const safeMonth = Number(month) || CURRENT_MONTH
  const firstDay = new Date(Date.UTC(safeYear, safeMonth - 1, 1))
  const firstWeekday = firstDay.getUTCDay()
  const daysInMonth = new Date(Date.UTC(safeYear, safeMonth, 0)).getUTCDate()
  const cells = []

  for (let emptyIndex = 0; emptyIndex < firstWeekday; emptyIndex += 1) {
    cells.push({
      key: `empty-${safeYear}-${safeMonth}-${emptyIndex}`,
      day: 0,
      dayText: '',
      dateText: '',
      durationMinutes: 0,
      durationText: '0分钟',
      level: 0,
      isPlaceholder: true,
      cellClass: buildHeatmapCellClass(0, true)
    })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      key: `${safeYear}-${padNumber(safeMonth)}-${padNumber(day)}`,
      day,
      dayText: String(day),
      dateText: buildHeatmapDateText(safeYear, safeMonth, day),
      durationMinutes: 0,
      durationText: '0分钟',
      level: 0,
      isPlaceholder: false,
      cellClass: buildHeatmapCellClass(0, false)
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `tail-${safeYear}-${safeMonth}-${cells.length}`,
      day: 0,
      dayText: '',
      dateText: '',
      durationMinutes: 0,
      durationText: '0分钟',
      level: 0,
      isPlaceholder: true,
      cellClass: buildHeatmapCellClass(0, true)
    })
  }

  while (cells.length < 35) {
    cells.push({
      key: `pad-${safeYear}-${safeMonth}-${cells.length}`,
      day: 0,
      dayText: '',
      dateText: '',
      durationMinutes: 0,
      durationText: '0分钟',
      level: 0,
      isPlaceholder: true,
      cellClass: buildHeatmapCellClass(0, true)
    })
  }

  return {
    month: safeMonth,
    monthLabel: buildMonthLabel(safeMonth),
    cells
  }
}

function getAvatarText(name) {
  const safeName = (name || '').trim()
  return safeName ? safeName.slice(0, 1) : '读'
}

function getRoleText(role, superAdmin) {
  if (superAdmin) {
    return '超级管理员'
  }

  const roleMap = {
    admin: '管理员',
    member: '正式成员',
    guest: '访客'
  }

  return roleMap[role] || '访客'
}

function getUserStatusMeta(status, hasUserRecord) {
  if (!hasUserRecord) {
    return {
      text: '未报名',
      className: 'neutral'
    }
  }

  const statusMap = {
    pending: {
      text: '待审核',
      className: 'pending'
    },
    approved: {
      text: '已通过',
      className: 'approved'
    },
    rejected: {
      text: '未通过',
      className: 'rejected'
    }
  }

  return statusMap[status] || {
    text: '状态未知',
    className: 'neutral'
  }
}

function getApplicationStatusMeta(status, hasApplication) {
  if (!hasApplication) {
    return {
      text: '未提交报名',
      className: 'neutral'
    }
  }

  const statusMap = {
    pending: {
      text: '审核中',
      className: 'pending'
    },
    approved: {
      text: '已通过',
      className: 'approved'
    },
    rejected: {
      text: '未通过',
      className: 'rejected'
    }
  }

  return statusMap[status] || {
    text: '状态未知',
    className: 'neutral'
  }
}

function getReadingTargetCount(readingSummary) {
  const parsed = Number(readingSummary && readingSummary.targetCount)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function getReadingThresholdType(readingSummary) {
  return readingSummary && readingSummary.thresholdType === 'consecutive'
    ? 'consecutive'
    : 'accumulated'
}

function getReadingRuleText(readingSummary) {
  const activityTitle = normalizeText(readingSummary && readingSummary.activityTitle)
  const targetCount = getReadingTargetCount(readingSummary)
  const thresholdType = getReadingThresholdType(readingSummary)
  const requireOfflineAttendance = !(readingSummary && readingSummary.requireOfflineAttendance === false)

  if (!activityTitle || !targetCount) {
    return '当前还没有生效中的阅读激励规则。'
  }

  const actionText = thresholdType === 'consecutive' ? '连续打卡' : '累计打卡'
  const requirementText = requireOfflineAttendance ? '且线下到场可领奖' : '可领奖'

  return `${actionText}【${activityTitle}】${targetCount}天${requirementText}`
}

function getReadingAttendanceText(readingSummary) {
  const activityId = normalizeText(readingSummary && readingSummary.activityId)

  if (!activityId || readingSummary && readingSummary.requireOfflineAttendance === false) {
    return ''
  }

  return `到场状态：${readingSummary && readingSummary.attended === true ? '已到场' : '未到场'}`
}

function getReadingProgressText(readingSummary) {
  const activityId = normalizeText(readingSummary && readingSummary.activityId)
  const activityTitle = normalizeText(readingSummary && readingSummary.activityTitle) || '当前活动'
  const targetCount = getReadingTargetCount(readingSummary)
  const thresholdType = getReadingThresholdType(readingSummary)
  const requireOfflineAttendance = !(readingSummary && readingSummary.requireOfflineAttendance === false)
  const remainingCount = Number.isFinite(Number(readingSummary && readingSummary.remainingCount))
    ? Math.max(0, Number(readingSummary && readingSummary.remainingCount))
    : Math.max(0, targetCount - (Number(readingSummary && readingSummary.completedCount) || 0))
  const progressText = thresholdType === 'consecutive'
    ? `连续打卡${targetCount}天`
    : `累计打卡${targetCount}天`

  if (!activityId || !targetCount) {
    return '当前还没有生效中的阅读激励规则。'
  }

  if (readingSummary && readingSummary.isAchieved) {
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

    return readingSummary && readingSummary.attended === true
      ? `${remainingText}，已线下到场。`
      : `${remainingText}，且需线下到场。`
  }

  if (!requireOfflineAttendance) {
    return `已完成【${activityTitle}】${progressText}。`
  }

  return readingSummary && readingSummary.attended === true
    ? `已完成【${activityTitle}】${progressText}，且线下已到场。`
    : `已完成【${activityTitle}】${progressText}，仍需线下到场。`
}

function getProfileFieldValue(userInfo, applicationInfo, fieldName) {

  const userValue = String((userInfo && userInfo[fieldName]) || '').trim()
  const applicationValue = String((applicationInfo && applicationInfo[fieldName]) || '').trim()

  // 已通过审核用户 → 只用 users 表
  if (userInfo && userInfo.status === 'approved') {
    return userValue
  }

  // 未审核用户 → 用申请表
  return applicationValue || userValue
}

Page({
  data: {
    loading: true,
    syncing: false,
    hasContent: false,
    errorMessage: '',
    profile: DEFAULT_PROFILE,
    application: DEFAULT_APPLICATION,
    reading: DEFAULT_READING,
    readingViewMode: 'current',
    readingFavoriteViewMode: 'month',
    readingHeatmapViewMode: 'month',
    readingMonthHeatmapDetail: buildDefaultHeatmapDetail(),
    readingMonthHeatmapSelectedKey: '',
    heatmapWeekdayLabels: HEATMAP_WEEKDAY_LABELS,
    recordList: DEFAULT_RECORD_LIST,
    dataCenter: DEFAULT_DATA_CENTER,
    dataCenterVisible: false,
    activityPublishVisible: false,
    bookRecommendationManageVisible: false,
    blindPoemManageVisible: false,
    posterManageVisible: false,
    blindPoemAnalyticsVisible: false,
    applicationReviewVisible: false,
    visitorApplicationVisible: false,
    noticeManageVisible: false,
    permissionManageVisible: false,
    rewardManageVisible: false,
    superAdminVisible: false,
    approvedUserVisible: false,
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad() {
    showPageShareMenu()
    this.profileSupplementPromptShowing = false
    this.profileSupplementPromptHandled = false
    this.hydrateMineCache()
  },

  onShow() {
    this.syncTabBarSelected(3)

    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        return
      }

      this.ensureMineAccess().then((canAccess) => {
        if (!canAccess) {
          return
        }

        const now = Date.now()
        const shouldSkipRefresh = this.data.hasContent
          && this.lastMineRefreshAt
          && (now - this.lastMineRefreshAt) < MINE_SILENT_REFRESH_INTERVAL

        if (shouldSkipRefresh) {
          return
        }

        this.loadMyCenterData({
          silent: this.data.hasContent
        })
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

  onPullDownRefresh() {
    this.ensureMineAccess({
      stopPullDownRefresh: true
    }).then((canAccess) => {
      if (!canAccess) {
        return
      }

      this.loadMyCenterData({
        force: true,
        silent: this.data.hasContent,
        stopPullDownRefresh: true
      })
    })
  },

  ensureMineAccess(options = {}) {
    const cachedDecision = getCachedAccessDecision()

    if (cachedDecision) {
      if (cachedDecision.canAccess) {
        if (options.stopPullDownRefresh) {
          wx.stopPullDownRefresh()
        }

        return Promise.resolve(true)
      }

      wx.reLaunch({
        url: cachedDecision.redirectUrl
      })

      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }

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
      console.error('mine ensureMineAccess error:', error)
      const fallbackDecision = getCachedAccessDecision()

      if (fallbackDecision && fallbackDecision.canAccess) {
        return true
      }

      wx.reLaunch({
        url: fallbackDecision ? fallbackDecision.redirectUrl : '/pages/apply/apply'
      })
      return false
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  loadMyCenterData(options = {}) {
    const silent = !!options.silent && this.data.hasContent
    this.lastMineRefreshAt = Date.now()

    this.setData({
      loading: !silent,
      syncing: silent,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getMyCenterData'
    }).then((res) => {
      const result = res.result || {}
      const userInfo = result.userInfo || {}
      const applicationInfo = result.applicationInfo || {}

      if (!result.success) {
        throw new Error(result.message || '获取数据失败')
      }

      setCachedAccessDecision(userInfo, applicationInfo)

      const pagePayload = this.buildMinePagePayload(result, userInfo, applicationInfo)

      this.setData({
        loading: false,
        syncing: false,
        errorMessage: '',
        hasContent: true,
        ...pagePayload
      }, () => {
        this.persistMineCache()
        this.maybePromptProfileSupplement(userInfo)
      })
    }).catch((error) => {
      console.error('getMyCenterData error:', error)

      if (this.data.hasContent) {
        this.setData({
          loading: false,
          syncing: false,
          errorMessage: '最新数据刷新失败，当前先显示缓存内容。'
        })
      } else {
        this.setData({
          loading: false,
          syncing: false,
          hasContent: false,
          errorMessage: '我的页面数据加载失败，请稍后重试。',
          profile: DEFAULT_PROFILE,
          application: DEFAULT_APPLICATION,
          reading: DEFAULT_READING,
          readingViewMode: 'current',
          readingFavoriteViewMode: 'month',
          readingHeatmapViewMode: 'month',
          readingMonthHeatmapDetail: buildDefaultHeatmapDetail(),
          readingMonthHeatmapSelectedKey: '',
          recordList: DEFAULT_RECORD_LIST,
          dataCenter: DEFAULT_DATA_CENTER,
          dataCenterVisible: false,
          activityPublishVisible: false,
          bookRecommendationManageVisible: false,
          blindPoemManageVisible: false,
          posterManageVisible: false,
          blindPoemAnalyticsVisible: false,
          applicationReviewVisible: false,
          visitorApplicationVisible: false,
          noticeManageVisible: false,
          permissionManageVisible: false,
          rewardManageVisible: false,
          superAdminVisible: false,
          approvedUserVisible: false
        })
      }
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  buildMinePagePayload(result, userInfo, applicationInfo) {
    return {
      profile: this.buildProfileData(userInfo, applicationInfo),
      application: this.buildApplicationData(applicationInfo),
      reading: this.buildReadingData(result.readingSummary || {}),
      readingViewMode: this.data.readingViewMode || 'current',
      readingFavoriteViewMode: this.data.readingFavoriteViewMode || 'month',
      readingHeatmapViewMode: this.data.readingHeatmapViewMode || 'month',
      readingMonthHeatmapDetail: buildDefaultHeatmapDetail(),
      readingMonthHeatmapSelectedKey: '',
      recordList: this.buildRecordListData(result.myRecordList || []),
      dataCenter: this.buildDataCenterData(result.activityDataCenter || {}),
      dataCenterVisible: !!userInfo.dataPermission,
      activityPublishVisible: !!userInfo.activityPermission,
      bookRecommendationManageVisible: !!userInfo.bookRecommendationPermission,
      blindPoemManageVisible: !!userInfo.superAdmin || (userInfo.role === 'admin' && userInfo.status === 'approved'),
      posterManageVisible: !!userInfo.superAdmin || (!!userInfo.posterManagePermission && userInfo.role === 'admin' && userInfo.status === 'approved'),
      blindPoemAnalyticsVisible: !!userInfo.dataPermission,
      applicationReviewVisible: !!userInfo.superAdmin || !!userInfo.applicationReviewPermission,
      visitorApplicationVisible: !!userInfo.superAdmin,
      noticeManageVisible: !!userInfo.superAdmin,
      permissionManageVisible: !!userInfo.superAdmin,
      rewardManageVisible: !!userInfo.rewardPermission,
      superAdminVisible: !!userInfo.superAdmin,
      approvedUserVisible: userInfo.status === 'approved'
    }
  },

  hydrateMineCache() {
    try {
      const cache = wx.getStorageSync(MINE_PAGE_CACHE_KEY) || {}
      const payload = cache.payload || null

      if (!payload) {
        return
      }

      this.lastMineRefreshAt = Number(cache.updatedAt) || 0

      this.setData({
        ...payload,
        loading: false,
        syncing: false,
        hasContent: true,
        errorMessage: '',
        readingMonthHeatmapDetail: buildDefaultHeatmapDetail(),
        readingMonthHeatmapSelectedKey: ''
      })
    } catch (error) {
      console.warn('hydrate mine cache failed:', error)
    }
  },

  persistMineCache() {
    try {
      wx.setStorageSync(MINE_PAGE_CACHE_KEY, {
        updatedAt: Date.now(),
        payload: {
          profile: this.data.profile,
          application: this.data.application,
          reading: this.data.reading,
          readingViewMode: this.data.readingViewMode,
          readingFavoriteViewMode: this.data.readingFavoriteViewMode,
          readingHeatmapViewMode: this.data.readingHeatmapViewMode,
          recordList: this.data.recordList,
          dataCenter: this.data.dataCenter,
          dataCenterVisible: this.data.dataCenterVisible,
          activityPublishVisible: this.data.activityPublishVisible,
          bookRecommendationManageVisible: this.data.bookRecommendationManageVisible,
          blindPoemManageVisible: this.data.blindPoemManageVisible,
          posterManageVisible: this.data.posterManageVisible,
          blindPoemAnalyticsVisible: this.data.blindPoemAnalyticsVisible,
          applicationReviewVisible: this.data.applicationReviewVisible,
          visitorApplicationVisible: this.data.visitorApplicationVisible,
          noticeManageVisible: this.data.noticeManageVisible,
          permissionManageVisible: this.data.permissionManageVisible,
          rewardManageVisible: this.data.rewardManageVisible,
          superAdminVisible: this.data.superAdminVisible,
          approvedUserVisible: this.data.approvedUserVisible
        }
      })
    } catch (error) {
      console.warn('persist mine cache failed:', error)
    }
  },

  buildProfileData(userInfo, applicationInfo) {
    const hasUserRecord = !!userInfo.hasUserRecord
    const userStatusMeta = getUserStatusMeta(userInfo.status, hasUserRecord)
    const resolvedName = getProfileFieldValue(userInfo, applicationInfo, 'name')
    const resolvedGradeMajor = getProfileFieldValue(userInfo, applicationInfo, 'gradeMajor')
    const displayName = (userInfo.nickName || resolvedName || '读者同学').trim() || '读者同学'

    let subtitle = '还没有提交报名信息'

    if (applicationInfo.hasApplication) {
      subtitle = applicationInfo.gradeMajor || '已提交报名信息，等待审核'
    }

    if (hasUserRecord && userInfo.status === 'approved') {
      subtitle = resolvedGradeMajor || '已加入校园读书会'
    }

    const signatureText = String(userInfo.signature || '').trim()

    return {
      displayName,
      subtitle,
      avatarUrl: userInfo.avatarUrl || '',
      avatarText: getAvatarText(displayName),
      signatureText: signatureText || '未填写个性签名',
      signatureFilled: !!signatureText,
      roleText: getRoleText(userInfo.role, userInfo.superAdmin),
      userStatusText: userStatusMeta.text,
      userStatusClass: userStatusMeta.className,
      createdAtText: formatDate(userInfo.createdAt) || '暂无'
    }
  },

  buildApplicationData(applicationInfo) {
    const hasApplication = !!applicationInfo.hasApplication
    const statusMeta = getApplicationStatusMeta(applicationInfo.status, hasApplication)

    return {
      hasApplication,
      statusText: statusMeta.text,
      statusClass: statusMeta.className,
      name: applicationInfo.name || '暂无',
      gradeMajor: applicationInfo.gradeMajor || '暂无',
      contact: applicationInfo.contact || '未填写',
      reason: applicationInfo.reason || '',
      createdAtText: formatDateTime(applicationInfo.createdAt) || '暂无'
    }
  },

  buildRecentWeekBars(dayList) {
    const safeList = Array.isArray(dayList) ? dayList : []
    const maxDuration = safeList.reduce((maxValue, item) => {
      return Math.max(maxValue, Number(item && item.durationMinutes) || 0)
    }, 0)
    const currentDayKey = buildCurrentLocalDayKey()

    return safeList.map((item) => {
      const durationMinutes = Number(item && item.durationMinutes) || 0
      const level = getBarLevel(durationMinutes, maxDuration)
      const isToday = (item && item.dayKey) === currentDayKey

      return {
        dayKey: item.dayKey || '',
        weekdayLabel: item.weekdayLabel || '',
        durationMinutes,
        durationText: formatDurationCompact(durationMinutes),
        isToday,
        hasValue: durationMinutes > 0,
        heightRpx: durationMinutes > 0
          ? Math.max(28, Math.round((durationMinutes / (maxDuration || 1)) * 190))
          : 12,
        fillClass: isToday
          ? `reading-bar-fill ${durationMinutes > 0 ? 'today' : 'today-empty'}`
          : (durationMinutes > 0
            ? `reading-bar-fill level-${level}`
            : 'reading-bar-fill empty'),
        dayClass: isToday ? 'reading-bar-day today' : 'reading-bar-day'
      }
    })
  },

  buildMonthlyFavoriteData(monthlyFavorites) {
    return (Array.isArray(monthlyFavorites) ? monthlyFavorites : []).map((item, index) => {
      const monthLabel = item && item.monthLabel ? item.monthLabel : `${index + 1}月`
      const hasData = !!(item && item.hasData)
      const bookTitle = item && item.bookTitle ? item.bookTitle : ''
      const durationMinutes = Number(item && item.durationMinutes) || 0

      return {
        month: Number(item && item.month) || (index + 1),
        monthLabel,
        hasData,
        bookTitle,
        shortTitle: truncateText(bookTitle, 8),
        durationMinutes,
        durationText: formatDurationHourMinute(durationMinutes),
        coverStyle: getMonthlyFavoriteStyle(index)
      }
    })
  },

  buildCurrentMonthFavoriteData(monthlyFavorites, currentMonth = CURRENT_MONTH) {
    const matchedFavorite = (Array.isArray(monthlyFavorites) ? monthlyFavorites : []).find((item) => {
      return Number(item && item.month) === Number(currentMonth)
    })

    if (matchedFavorite) {
      return matchedFavorite
    }

    return {
      month: currentMonth,
      monthLabel: buildMonthLabel(currentMonth),
      hasData: false,
      bookTitle: '',
      shortTitle: '',
      durationMinutes: 0,
      durationText: '暂无数据',
      coverStyle: ''
    }
  },

  buildAnnualHeatmapData(annualHeatmap) {
    const heatmapYear = Number(annualHeatmap && annualHeatmap.year) || CURRENT_YEAR
    const monthList = Array.isArray(annualHeatmap && annualHeatmap.months)
      ? annualHeatmap.months
      : []

    return monthList.map((monthItem, monthIndex) => {
      const month = Number(monthItem && monthItem.month) || (monthIndex + 1)
      const monthLabel = monthItem && monthItem.monthLabel ? monthItem.monthLabel : `${monthIndex + 1}月`

      return {
        month,
        monthLabel,
        cells: (Array.isArray(monthItem && monthItem.cells) ? monthItem.cells : []).map((cell, cellIndex) => {
          const level = Number(cell && cell.level) || 0
          const isPlaceholder = !!(cell && cell.isPlaceholder)
          const day = Number(cell && cell.day) || 0
          const durationMinutes = Number(cell && cell.durationMinutes) || 0
          const key = cell && cell.key ? cell.key : `cell-${monthIndex}-${cellIndex}`

          return {
            key,
            day,
            dayText: !isPlaceholder && day ? String(day) : '',
            dateText: !isPlaceholder && day ? buildHeatmapDateText(heatmapYear, month, day) : '',
            durationMinutes,
            durationText: formatDurationLong(durationMinutes),
            level,
            isPlaceholder,
            cellClass: buildHeatmapCellClass(level, isPlaceholder)
          }
        })
      }
    })
  },

  buildCurrentMonthHeatmapData(annualHeatmapMonths, currentMonth = CURRENT_MONTH, heatmapYear = CURRENT_YEAR) {
    const matchedMonth = (Array.isArray(annualHeatmapMonths) ? annualHeatmapMonths : []).find((item) => {
      return Number(item && item.month) === Number(currentMonth)
    })

    return matchedMonth || buildEmptyHeatmapMonth(currentMonth, heatmapYear)
  },

  buildReadingData(readingSummary) {
    const totalLogs = Number(readingSummary.totalLogs) || 0
    const completedCount = Number(readingSummary.completedCount) || 0
    const targetCount = getReadingTargetCount(readingSummary)
    const remainingCount = Number.isFinite(Number(readingSummary.remainingCount))
      ? Number(readingSummary.remainingCount)
      : (completedCount >= targetCount ? 0 : targetCount - completedCount)
    const totalDuration = Number(readingSummary.totalDuration) || 0
    const isAchieved = !!readingSummary.isAchieved
    const activityId = normalizeText(readingSummary.activityId)
    const activityTitle = normalizeText(readingSummary.activityTitle)
    const thresholdType = getReadingThresholdType(readingSummary)
    const requireOfflineAttendance = !(readingSummary && readingSummary.requireOfflineAttendance === false)
    const attended = !!readingSummary.attended
    const totalSummary = readingSummary.totalSummary || {}
    const recentWeek = readingSummary.recentWeek || {}
    const annualHeatmap = readingSummary.annualHeatmap || {}
    const annualHeatmapYear = Number(annualHeatmap.year) || Number(readingSummary.currentYear) || CURRENT_YEAR
    const currentMonth = Number(readingSummary.currentMonth)
      || Number(String(readingSummary.monthKey || '').slice(5, 7))
      || CURRENT_MONTH
    const currentMonthLabel = buildMonthLabel(currentMonth)
    const monthlyFavorites = this.buildMonthlyFavoriteData(readingSummary.monthlyFavorites || [])
    const annualHeatmapMonths = this.buildAnnualHeatmapData(annualHeatmap)
    const currentStats = buildReadingStatCards({
      totalLogs,
      completedCount,
      totalDuration
    }, '打卡次数')

    if (currentStats[1]) {
      currentStats[1].label = thresholdType === 'consecutive' ? '连续天数' : '打卡天数'
    }

    const latestLog = readingSummary.latestLog ? {
      bookTitle: readingSummary.latestLog.bookTitle || '未填写书名',
      authorText: readingSummary.latestLog.author || '作者未填写',
      durationText: `${Number(readingSummary.latestLog.duration) || 0} 分钟`,
      pagesOrChapterText: readingSummary.latestLog.pagesOrChapter || '',
      insight: readingSummary.latestLog.insight || '',
      excerpt: readingSummary.latestLog.excerpt || '',
      createdAtText: formatDateTime(readingSummary.latestLog.createdAt) || '暂无'
    } : null

    return {
      periodLabel: '本期',
      activityId,
      activityTitle,
      thresholdType,
      requireOfflineAttendance,
      ruleText: getReadingRuleText({
        activityId,
        activityTitle,
        targetCount,
        thresholdType,
        requireOfflineAttendance
      }),
      totalLogs,
      completedCount,
      remainingCount,
      totalDuration,
      targetCount,
      attended,
      attendanceText: getReadingAttendanceText({
        activityId,
        requireOfflineAttendance,
        attended
      }),
      isAchieved,
      currentStats,
      totalStats: buildReadingStatCards(totalSummary, '打卡次数'),
      progressText: getReadingProgressText({
        activityId,
        activityTitle,
        completedCount,
        targetCount,
        thresholdType,
        requireOfflineAttendance,
        remainingCount,
        attended,
        isAchieved
      }),
      progressTextClass: isAchieved ? 'success-text' : '',
      latestLog,
      recentWeekBars: this.buildRecentWeekBars(recentWeek.days || []),
      recentWeekAverageText: formatDurationLong(recentWeek.averageDuration),
      recentWeekPeakText: formatDurationLong(recentWeek.peakDuration),
      monthlyFavorites,
      currentMonth,
      currentMonthLabel,
      currentMonthFavoriteSubtitle: `${currentMonthLabel}阅读时间最长的书籍`,
      annualFavoriteSubtitle: '每个月阅读时间最长的书籍',
      currentMonthFavorite: this.buildCurrentMonthFavoriteData(monthlyFavorites, currentMonth),
      annualHeatmapMonths,
      currentMonthHeatmap: this.buildCurrentMonthHeatmapData(annualHeatmapMonths, currentMonth, annualHeatmapYear),
      heatmapMonthSubtitle: `${currentMonthLabel}每日阅读时长分布`,
      heatmapYearSubtitle: `${annualHeatmapYear}年每日阅读时长分布`,
      annualHeatmapYear
    }
  },

  buildRecordListData(recordList) {
    return (recordList || []).map((item, index) => {
      return {
        ...item,
        _id: item._id || '',
        recordKey: `${item.type || 'reading'}-${item.createdAt || 0}-${index}`,
        type: item.type || 'reading',
        typeText: item.typeText || '阅读打卡',
        typeClass: item.type === 'life' ? 'life' : (item.type === 'reward' ? 'reward' : 'reading'),
        title: item.title || '未填写标题',
        summary: item.summary || item.content || '',
        createdAtText: formatDateTime(item.createdAt) || '暂无',
        imageUrl: item.imageUrl || (((item.images || [])[0]) || ''),
        hasImage: !!(item.imageUrl || (((item.images || [])[0]) || ''))
      }
    })
  },

  buildDataCenterData(activityDataCenter) {
    if (!activityDataCenter.canView) {
      return DEFAULT_DATA_CENTER
    }

    return {
      canView: true,
      cards: (activityDataCenter.cards || []).map((item) => {
        return {
          activityId: item.activityId || '',
          title: item.title || '未命名活动',
          timeText: item.timeText || '时间待定',
          exposureUserCount: Number(item.exposureUserCount) || 0,
          detailClickUserCount: Number(item.detailClickUserCount) || 0,
          registerUserCount: Number(item.registerUserCount) || 0,
          attendanceUserCount: Number(item.attendanceUserCount) || 0,
          clickRateText: item.clickRateText || '0%',
          registerConversionRateText: item.registerConversionRateText || '0%'
        }
      })
    }
  },

  onRetryTap() {
    this.loadMyCenterData({
      force: true,
      silent: this.data.hasContent
    })
  },

  onReadingViewChange(e) {
    const viewMode = e.currentTarget.dataset.view

    if (viewMode !== 'current' && viewMode !== 'total') {
      return
    }

    if (viewMode === this.data.readingViewMode) {
      return
    }

    this.setData({
      readingViewMode: viewMode
    }, () => {
      if (this.data.hasContent) {
        this.persistMineCache()
      }
    })
  },

  onReadingFavoriteViewChange(e) {
    const viewMode = e.currentTarget.dataset.view

    if (viewMode !== 'month' && viewMode !== 'year') {
      return
    }

    if (viewMode === this.data.readingFavoriteViewMode) {
      return
    }

    this.setData({
      readingFavoriteViewMode: viewMode
    }, () => {
      if (this.data.hasContent) {
        this.persistMineCache()
      }
    })
  },

  onReadingHeatmapViewChange(e) {
    const viewMode = e.currentTarget.dataset.view

    if (viewMode !== 'month' && viewMode !== 'year') {
      return
    }

    if (viewMode === this.data.readingHeatmapViewMode) {
      return
    }

    this.setData({
      readingHeatmapViewMode: viewMode,
      readingMonthHeatmapDetail: buildDefaultHeatmapDetail(),
      readingMonthHeatmapSelectedKey: ''
    }, () => {
      if (this.data.hasContent) {
        this.persistMineCache()
      }
    })
  },

  onReadingMonthHeatmapCellTap(e) {
    const dataset = e.currentTarget.dataset || {}
    const isPlaceholder = dataset.placeholder === true || dataset.placeholder === 'true'

    if (isPlaceholder) {
      return
    }

    const key = dataset.key || ''

    if (!key) {
      return
    }

    if (key === this.data.readingMonthHeatmapSelectedKey) {
      this.setData({
        readingMonthHeatmapDetail: buildDefaultHeatmapDetail(),
        readingMonthHeatmapSelectedKey: ''
      })
      return
    }

    this.setData({
      readingMonthHeatmapSelectedKey: key,
      readingMonthHeatmapDetail: {
        visible: true,
        dateText: dataset.dateText || '',
        durationText: dataset.durationText || '0分钟'
      }
    })
  },

  shouldPromptProfileSupplement(userInfo) {
    return shouldPromptProfileSupplement(userInfo)
  },

  maybePromptProfileSupplement(userInfo) {
    if (!this.shouldPromptProfileSupplement(userInfo) || this.profileSupplementPromptShowing || this.profileSupplementPromptHandled) {
      return
    }

    this.profileSupplementPromptShowing = true
    this.profileSupplementPromptHandled = true

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
          this.goProfile()
        }
      }
    })
  },

  onAvatarTap() {
    if (this.data.loading) {
      return
    }

    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseAvatarImage('camera')
          return
        }

        if (res.tapIndex === 1) {
          this.chooseAvatarImage('album')
        }
      }
    })
  },

  chooseAvatarImage(sourceType) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: [sourceType],
      success: (res) => {
        const tempFilePath = res.tempFilePaths && res.tempFilePaths[0]

        if (!tempFilePath) {
          return
        }

        wx.navigateTo({
          url: '/pages/avatar-editor/avatar-editor',
          success: (navRes) => {
            navRes.eventChannel.emit('acceptAvatarImage', {
              tempFilePath
            })
          }
        })
      }
    })
  },

  goApply() {
    wx.navigateTo({
      url: '/pages/apply/apply'
    })
  },

  goMyRecords() {
    wx.navigateTo({
      url: '/pages/my-records/my-records'
    })
  },

  goRecordDetail(e) {
    const index = Number(e.currentTarget.dataset.index)
    const record = this.data.recordList[index]

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

  goReadingLog() {
    const reading = this.data.reading || DEFAULT_READING
    const activityId = normalizeText(reading.activityId)
    const activityTitle = normalizeText(reading.activityTitle)
    const url = activityId
      ? `/pages/reading-log/reading-log?activityId=${encodeURIComponent(activityId)}&activityTitle=${encodeURIComponent(activityTitle)}`
      : '/pages/reading-log/reading-log'

    wx.navigateTo({
      url
    })
  },

  goProfile() {
    wx.navigateTo({
      url: '/pages/profile/profile'
    })
  },

  goAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    })
  },

  goCreateManage() {
    wx.navigateTo({
      url: '/pages/create-manage/create-manage'
    })
  },

  goPosterManage() {
    wx.navigateTo({
      url: '/pages/poster-manage/poster-manage'
    })
  },

  goDataCenterHome() {
    wx.navigateTo({
      url: '/pages/data-center/data-center'
    })
  },

  goDataCenter(e) {
    const activityId = e.currentTarget.dataset.id
    const activityTitle = e.currentTarget.dataset.title || ''

    if (!activityId) {
      return
    }

    wx.navigateTo({
      url: `/pages/data-center/data-center?id=${activityId}&title=${encodeURIComponent(activityTitle)}`
    })
  },

  goApplicationReview() {
    wx.navigateTo({
      url: '/pages/application-review/application-review'
    })
  },

  goVisitorApplicationList() {
    wx.navigateTo({
      url: '/pages/visitor-application-list/visitor-application-list'
    })
  },

  goNoticeManage() {
    wx.navigateTo({
      url: '/pages/notice-manage/notice-manage'
    })
  },

  goPermissionManage() {
    wx.navigateTo({
      url: '/pages/permission-manage/permission-manage'
    })
  },

  goRewardManage() {
    wx.navigateTo({
      url: '/pages/reward-manage/reward-manage'
    })
  },

  goBookRecommendationManage() {
    wx.navigateTo({
      url: '/pages/book-recommendation-manage/book-recommendation-manage'
    })
  },

  goBlindPoemManage() {
    wx.navigateTo({
      url: '/pages/blind-poem-manage/blind-poem-manage'
    })
  },

  goBlindPoemAnalytics() {
    wx.navigateTo({
      url: '/pages/blind-poem-analytics/blind-poem-analytics'
    })
  },

  getMineShareConfig() {
    return {
      title: '校园读书会｜阅读打卡、主题活动与创作互动',
      path: '/pages/home/home',
      shareLanding: SHARE_LANDING_HOME,
      imageUrl: pickShareImage((this.data.profile || DEFAULT_PROFILE).avatarUrl)
    }
  },

  onShareAppMessage() {
    return buildShareAppMessage(this.getMineShareConfig())
  },

  onShareTimeline() {
    const shareConfig = this.getMineShareConfig()
    return buildShareTimeline({
      title: shareConfig.title,
      shareLanding: shareConfig.shareLanding,
      imageUrl: shareConfig.imageUrl
    })
  }
})
