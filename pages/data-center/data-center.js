const ACTIVITY_DIMENSION_OPTIONS = [
  { key: 'day', label: '天' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' }
]

const GAME_DIMENSION_OPTIONS = [
  { key: 'cycle', label: '活动周期' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' }
]

const ACTIVITY_METRIC_OPTIONS = [
  { key: 'exposureUserCount', label: '曝光人数', color: '#2f6df6', bgColor: '#eef4ff' },
  { key: 'detailClickUserCount', label: '详情点击人数', color: '#0ea5e9', bgColor: '#eef9ff' },
  { key: 'registerUserCount', label: '报名人数', color: '#f97316', bgColor: '#fff4ec' },
  { key: 'attendanceUserCount', label: '实际参与人数', color: '#16a34a', bgColor: '#eefaf2' },
  { key: 'readingLogCount', label: '阅读打卡人次', color: '#7c3aed', bgColor: '#f5efff' },
  { key: 'lifeShareCount', label: '生活分享人次', color: '#db2777', bgColor: '#fff0f7' }
]

const POEM_PANCAKE_METRIC_OPTIONS = [
  { key: 'exposureUserCount', label: '曝光人数', color: '#2f6df6', bgColor: '#eef4ff' },
  { key: 'detailClickUserCount', label: '点击人数', color: '#0ea5e9', bgColor: '#eef9ff' },
  { key: 'playUserCount', label: '游玩人数', color: '#f97316', bgColor: '#fff4ec' },
  { key: 'charCount', label: '字数统计', color: '#7c3aed', bgColor: '#f5efff' }
]

const FUNNEL_BLUE_COLORS = ['#2F5BFF', '#4D76FF', '#7395FF', '#A7BEFF']
const POSTER_SUMMARY_FUNNEL_WIDTHS = [100, 84, 68, 52]
const POSTER_CARD_FUNNEL_COLORS = ['#2F5BFF', '#7EA0FF']

function buildMetricList(metricOptions = ACTIVITY_METRIC_OPTIONS, selectedKeys = ['exposureUserCount', 'detailClickUserCount', 'registerUserCount']) {
  return (Array.isArray(metricOptions) ? metricOptions : []).map((item) => {
    return {
      ...item,
      checked: selectedKeys.indexOf(item.key) !== -1
    }
  })
}

function getAxisMax(maxValue) {
  if (!maxValue || maxValue <= 0) {
    return 4
  }

  if (maxValue <= 4) {
    return 4
  }

  return Math.ceil(maxValue / 4) * 4
}

function formatConversionRate(numerator, denominator) {
  if (!denominator) {
    return '0%'
  }

  const rate = (Number(numerator) || 0) / denominator * 100
  return `${rate.toFixed(rate < 10 ? 2 : 1)}%`
}

function buildDefaultFunnelOverview() {
  return {
    totalRateText: '0%',
    stageRates: []
  }
}

function buildDefaultGameStats() {
  return {
    exposureUserCount: 0,
    detailClickUserCount: 0,
    participantUserCount: 0,
    participationCount: 0,
    detailRateText: '0%',
    participantRateText: '0%'
  }
}

function buildDefaultPoemPancakeStats() {
  return {
    totalActivityCount: 0,
    exposureUserCount: 0,
    detailClickUserCount: 0,
    playUserCount: 0,
    totalCharCount: 0,
    detailRateText: '0%',
    playRateText: '0%'
  }
}

function buildDefaultPoemPancakeActivityCards() {
  return []
}

function buildDefaultRecommendationCards() {
  return []
}

function buildDefaultPosterSummary() {
  return {
    templateCount: 0,
    usedTemplateCount: 0,
    usageUserCount: 0,
    usageCount: 0
  }
}

function buildDefaultPosterCards() {
  return []
}

function buildDefaultPosterSummaryFunnelStages() {
  return [
    { key: 'usageCount', label: '生成次数', value: 0, widthPercent: POSTER_SUMMARY_FUNNEL_WIDTHS[0], color: FUNNEL_BLUE_COLORS[0] },
    { key: 'usageUserCount', label: '使用人数', value: 0, widthPercent: POSTER_SUMMARY_FUNNEL_WIDTHS[1], color: FUNNEL_BLUE_COLORS[1] },
    { key: 'usedTemplateCount', label: '已用模板', value: 0, widthPercent: POSTER_SUMMARY_FUNNEL_WIDTHS[2], color: FUNNEL_BLUE_COLORS[2] },
    { key: 'templateCount', label: '模板总数', value: 0, widthPercent: POSTER_SUMMARY_FUNNEL_WIDTHS[3], color: FUNNEL_BLUE_COLORS[3] }
  ]
}

function normalizeText(value) {
  return String(value || '').trim()
}

function buildPosterSummaryFunnelStages(summary) {
  const safeSummary = summary || buildDefaultPosterSummary()

  return [
    { key: 'usageCount', label: '生成次数', value: Number(safeSummary.usageCount) || 0, widthPercent: POSTER_SUMMARY_FUNNEL_WIDTHS[0], color: FUNNEL_BLUE_COLORS[0] },
    { key: 'usageUserCount', label: '使用人数', value: Number(safeSummary.usageUserCount) || 0, widthPercent: POSTER_SUMMARY_FUNNEL_WIDTHS[1], color: FUNNEL_BLUE_COLORS[1] },
    { key: 'usedTemplateCount', label: '已用模板', value: Number(safeSummary.usedTemplateCount) || 0, widthPercent: POSTER_SUMMARY_FUNNEL_WIDTHS[2], color: FUNNEL_BLUE_COLORS[2] },
    { key: 'templateCount', label: '模板总数', value: Number(safeSummary.templateCount) || 0, widthPercent: POSTER_SUMMARY_FUNNEL_WIDTHS[3], color: FUNNEL_BLUE_COLORS[3] }
  ]
}

function getPosterStatusText(card) {
  if (card && card.enabled) {
    return '已启用'
  }

  return card && card.source === 'builtin' ? '系统默认' : '未启用'
}

function buildPosterCardFunnelStages(card) {
  const usageCount = Number(card && card.usageCount) || 0
  const uniqueUserCount = Number(card && card.uniqueUserCount) || 0
  const uniqueUserWidth = usageCount > 0
    ? Math.max(uniqueUserCount > 0 ? Number(((uniqueUserCount / usageCount) * 100).toFixed(1)) : 0, uniqueUserCount > 0 ? 36 : 0)
    : 0

  return [
    {
      key: 'usageCount',
      label: '生成次数',
      value: usageCount,
      widthPercent: usageCount > 0 ? 100 : 0,
      color: POSTER_CARD_FUNNEL_COLORS[0]
    },
    {
      key: 'uniqueUserCount',
      label: '使用人数',
      value: uniqueUserCount,
      widthPercent: uniqueUserWidth,
      color: POSTER_CARD_FUNNEL_COLORS[1]
    }
  ]
}

function decoratePosterCards(cardList = []) {
  return (Array.isArray(cardList) ? cardList : []).map((item) => {
    const usageCount = Number(item && item.usageCount) || 0
    const uniqueUserCount = Number(item && item.uniqueUserCount) || 0

    return {
      ...item,
      usageCount,
      uniqueUserCount,
      statusText: getPosterStatusText(item),
      funnelStages: buildPosterCardFunnelStages({
        ...item,
        usageCount,
        uniqueUserCount
      })
    }
  })
}

Page({
  data: {
    viewMode: 'overview',
    overviewTab: 'activity',
    gameType: '',
    activityId: '',
    activityTitle: '',
    analyticsPageTitle: '',
    analyticsPageDesc: '',
    loading: true,
    errorMessage: '',
    activityCards: [],
    gameStats: buildDefaultGameStats(),
    gameFunnelStages: [],
    gameModeStats: [],
    poemPancakeStats: buildDefaultPoemPancakeStats(),
    poemPancakeFunnelStages: [],
    poemPancakeActivityCards: buildDefaultPoemPancakeActivityCards(),
    recommendationCards: buildDefaultRecommendationCards(),
    posterSummary: buildDefaultPosterSummary(),
    posterSummaryFunnelStages: buildDefaultPosterSummaryFunnelStages(),
    posterCards: buildDefaultPosterCards(),
    dimension: 'day',
    dimensionOptions: ACTIVITY_DIMENSION_OPTIONS,
    metrics: buildMetricList(ACTIVITY_METRIC_OPTIONS),
    analytics: null,
    funnelStages: [],
    funnelOverview: buildDefaultFunnelOverview(),
    lineChartWidth: 0,
    lineChartHeight: 260,
    funnelChartWidth: 0,
    funnelChartHeight: 260
  },

  onLoad(options = {}) {
    const activityId = options.id || ''
    const activityTitle = options.title ? decodeURIComponent(options.title) : ''
    const gameType = normalizeText(options.gameType)

    if (activityId) {
      this.setData({
        viewMode: 'activity',
        activityId,
        activityTitle,
        analyticsPageTitle: activityTitle || '活动数据中心',
        analyticsPageDesc: '按时间维度查看活动趋势，并用漏斗结构观察转化链路。',
        dimension: 'day',
        dimensionOptions: ACTIVITY_DIMENSION_OPTIONS,
        metrics: buildMetricList(ACTIVITY_METRIC_OPTIONS, ['exposureUserCount', 'detailClickUserCount', 'registerUserCount'])
      })
      this.loadAnalytics()
      return
    }

    if (gameType === 'poemPancake') {
      this.setData({
        viewMode: 'gameAnalytics',
        gameType,
        analyticsPageTitle: '诗词摊煎饼趋势分析',
        analyticsPageDesc: '按活动周期、周、月、年查看曝光、点击、游玩和字数统计表现。',
        dimension: 'cycle',
        dimensionOptions: GAME_DIMENSION_OPTIONS,
        metrics: buildMetricList(POEM_PANCAKE_METRIC_OPTIONS, ['exposureUserCount', 'detailClickUserCount', 'playUserCount', 'charCount'])
      })
      this.loadPoemPancakeAnalytics()
      return
    }

    this.setData({
      viewMode: 'overview'
    })
    this.loadOverviewData()
  },

  onReady() {
    if (this.data.viewMode !== 'overview') {
      this.prepareCanvasSize()
    }
  },

  onPullDownRefresh() {
    if (this.data.viewMode === 'activity') {
      this.loadAnalytics({
        stopPullDownRefresh: true
      })
      return
    }

    if (this.data.viewMode === 'gameAnalytics') {
      this.loadPoemPancakeAnalytics({
        stopPullDownRefresh: true
      })
      return
    }

    this.loadOverviewData({
      stopPullDownRefresh: true
    })
  },

  loadOverviewData(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getMyCenterData'
    }).then((res) => {
      const result = res.result || {}
      const userInfo = result.userInfo || {}

      if (!result.success) {
        throw new Error(result.message || '数据中心加载失败')
      }

      if (!userInfo.dataPermission || !(result.activityDataCenter && result.activityDataCenter.canView)) {
        throw new Error('当前账号无权限查看数据中心')
      }

      return Promise.all([
        Promise.resolve(result),
        wx.cloud.callFunction({
          name: 'getBlindPoemAnalytics'
        }),
        wx.cloud.callFunction({
          name: 'getPoemPancakeAnalytics'
        }),
        wx.cloud.callFunction({
          name: 'getBookRecommendationAnalytics'
        }),
        wx.cloud.callFunction({
          name: 'getPosterAnalytics'
        })
      ])
    }).then(async ([centerResult, blindRes, poemPancakeRes, recommendationRes, posterRes]) => {
      const blindResult = blindRes.result || {}
      const poemPancakeResult = poemPancakeRes.result || {}
      const recommendationResult = recommendationRes.result || {}
      const posterResult = posterRes.result || {}
      const stats = blindResult.stats || {}
      const poemPancakeSummary = poemPancakeResult.summary || buildDefaultPoemPancakeStats()
      const posterSummary = posterResult.summary || buildDefaultPosterSummary()

      if (!blindResult.success) {
        throw new Error(blindResult.message || '双盲作诗数据加载失败')
      }

      if (!poemPancakeResult.success) {
        throw new Error(poemPancakeResult.message || '诗词摊煎饼数据加载失败')
      }

      if (!recommendationResult.success) {
        throw new Error(recommendationResult.message || '图书推荐数据加载失败')
      }

      if (!posterResult.success) {
        throw new Error(posterResult.message || '海报数据加载失败')
      }

      const posterCards = await this.resolvePosterPreviewUrls(posterResult.posterCards || [])

      this.setData({
        loading: false,
        activityCards: (centerResult.activityDataCenter && centerResult.activityDataCenter.cards) || [],
        gameStats: {
          exposureUserCount: Number(stats.exposureUserCount) || 0,
          detailClickUserCount: Number(stats.detailClickUserCount) || 0,
          participantUserCount: Number(stats.participantUserCount) || 0,
          participationCount: Number(stats.participationCount) || 0,
          detailRateText: formatConversionRate(stats.detailClickUserCount, stats.exposureUserCount),
          participantRateText: formatConversionRate(stats.participantUserCount, stats.detailClickUserCount)
        },
        gameFunnelStages: (blindResult.funnelStages || []).map((item, index) => {
          const baseValue = Number(blindResult.funnelStages && blindResult.funnelStages[0] && blindResult.funnelStages[0].value) || 0
          const currentValue = Number(item && item.value) || 0

          return {
            ...item,
            value: currentValue,
            widthPercent: baseValue ? Math.max(32, Number(((currentValue / baseValue) * 100).toFixed(1))) : 32,
            colorClass: `stage-${index + 1}`
          }
        }),
        gameModeStats: blindResult.modeStats || [],
        poemPancakeStats: {
          totalActivityCount: Number(poemPancakeSummary.totalActivityCount) || 0,
          exposureUserCount: Number(poemPancakeSummary.exposureUserCount) || 0,
          detailClickUserCount: Number(poemPancakeSummary.detailClickUserCount) || 0,
          playUserCount: Number(poemPancakeSummary.playUserCount) || 0,
          totalCharCount: Number(poemPancakeSummary.totalCharCount) || 0,
          detailRateText: normalizeText(poemPancakeSummary.detailRateText) || formatConversionRate(poemPancakeSummary.detailClickUserCount, poemPancakeSummary.exposureUserCount),
          playRateText: normalizeText(poemPancakeSummary.playRateText) || formatConversionRate(poemPancakeSummary.playUserCount, poemPancakeSummary.detailClickUserCount)
        },
        poemPancakeFunnelStages: (poemPancakeResult.funnelStages || []).map((item, index) => {
          const baseValue = Number(poemPancakeResult.funnelStages && poemPancakeResult.funnelStages[0] && poemPancakeResult.funnelStages[0].value) || 0
          const currentValue = Number(item && item.value) || 0

          return {
            ...item,
            value: currentValue,
            widthPercent: baseValue ? Math.max(32, Number(((currentValue / baseValue) * 100).toFixed(1))) : 32,
            colorClass: `stage-${index + 1}`
          }
        }),
        poemPancakeActivityCards: poemPancakeResult.activityStats || [],
        recommendationCards: recommendationResult.recommendationCards || [],
        posterSummary,
        posterSummaryFunnelStages: buildPosterSummaryFunnelStages(posterSummary),
        posterCards
      })
    }).catch((error) => {
      console.error('load data center overview error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '数据中心加载失败',
        activityCards: [],
        gameStats: buildDefaultGameStats(),
        gameFunnelStages: [],
        gameModeStats: [],
        poemPancakeStats: buildDefaultPoemPancakeStats(),
        poemPancakeFunnelStages: [],
        poemPancakeActivityCards: buildDefaultPoemPancakeActivityCards(),
        recommendationCards: buildDefaultRecommendationCards(),
        posterSummary: buildDefaultPosterSummary(),
        posterSummaryFunnelStages: buildDefaultPosterSummaryFunnelStages(),
        posterCards: buildDefaultPosterCards()
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onOverviewTabChange(e) {
    const tab = e.currentTarget.dataset.tab

    if (!tab || tab === this.data.overviewTab) {
      return
    }

    this.setData({
      overviewTab: tab
    })
  },

  async resolvePosterPreviewUrls(cardList = []) {
    const safeCardList = Array.isArray(cardList) ? cardList : []
    const cloudFileIdList = Array.from(new Set(
      safeCardList
        .map((item) => normalizeText(item && item.previewImageUrl))
        .filter((item) => item.indexOf('cloud://') === 0)
    ))

    if (!cloudFileIdList.length) {
      return decoratePosterCards(safeCardList.map((item) => ({
        ...item,
        previewImageResolvedUrl: normalizeText(item && item.previewImageUrl)
      })))
    }

    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: cloudFileIdList
      })
      const tempUrlMap = {}

      ;(res.fileList || []).forEach((item) => {
        const fileId = normalizeText(item && item.fileID)

        if (fileId) {
          tempUrlMap[fileId] = normalizeText(item && item.tempFileURL)
        }
      })

      return decoratePosterCards(safeCardList.map((item) => {
        const previewImageUrl = normalizeText(item && item.previewImageUrl)

        return {
          ...item,
          previewImageResolvedUrl: tempUrlMap[previewImageUrl] || previewImageUrl
        }
      }))
    } catch (error) {
      console.error('resolve poster preview url error:', error)
      return decoratePosterCards(safeCardList.map((item) => ({
        ...item,
        previewImageResolvedUrl: normalizeText(item && item.previewImageUrl)
      })))
    }
  },

  goActivityAnalytics(e) {
    const activityId = e.currentTarget.dataset.id
    const activityTitle = e.currentTarget.dataset.title || ''

    if (!activityId) {
      return
    }

    wx.navigateTo({
      url: `/pages/data-center/data-center?id=${activityId}&title=${encodeURIComponent(activityTitle)}`
    })
  },

  goPoemPancakeAnalytics() {
    wx.navigateTo({
      url: '/pages/data-center/data-center?gameType=poemPancake'
    })
  },

  prepareCanvasSize() {
    wx.createSelectorQuery()
      .in(this)
      .select('.line-chart-box')
      .boundingClientRect()
      .select('.funnel-chart-box')
      .boundingClientRect()
      .exec((res) => {
        const lineRect = res && res[0]
        const funnelRect = res && res[1]

        if (!lineRect || !funnelRect) {
          return
        }

        this.setData({
          lineChartWidth: Math.floor(lineRect.width),
          funnelChartWidth: Math.floor(funnelRect.width)
        }, () => {
          this.drawChartsIfReady()
        })
      })
  },

  loadAnalytics(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getActivityAnalytics',
      data: {
        activityId: this.data.activityId,
        dimension: this.data.dimension
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '获取分析数据失败')
      }

      this.setData({
        loading: false,
        activityTitle: (result.activity && result.activity.title) || this.data.activityTitle,
        analyticsPageTitle: (result.activity && result.activity.title) || this.data.analyticsPageTitle,
        analytics: result.analytics || null,
        funnelStages: this.buildFunnelStages(result.analytics && result.analytics.funnelStages),
        funnelOverview: this.buildFunnelOverview(result.analytics && result.analytics.funnelStages)
      }, () => {
        this.prepareCanvasSize()
        this.drawChartsIfReady()
      })
    }).catch((error) => {
      console.error('getActivityAnalytics error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '数据分析加载失败',
        analytics: null,
        funnelStages: [],
        funnelOverview: buildDefaultFunnelOverview()
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  loadPoemPancakeAnalytics(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getPoemPancakeAnalytics',
      data: {
        dimension: this.data.dimension
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '诗词摊煎饼趋势数据加载失败')
      }

      this.setData({
        loading: false,
        analytics: result.analytics || null,
        funnelStages: this.buildFunnelStages(result.analytics && result.analytics.funnelStages),
        funnelOverview: this.buildFunnelOverview(result.analytics && result.analytics.funnelStages)
      }, () => {
        this.prepareCanvasSize()
        this.drawChartsIfReady()
      })
    }).catch((error) => {
      console.error('getPoemPancakeAnalytics error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '诗词摊煎饼趋势数据加载失败',
        analytics: null,
        funnelStages: [],
        funnelOverview: buildDefaultFunnelOverview()
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  buildFunnelStages(stageList) {
    return (stageList || []).map((item, index) => {
      return {
        ...item,
        color: FUNNEL_BLUE_COLORS[index] || FUNNEL_BLUE_COLORS[FUNNEL_BLUE_COLORS.length - 1]
      }
    })
  },

  buildFunnelOverview(stageList) {
    const safeStageList = stageList || []

    if (!safeStageList.length) {
      return buildDefaultFunnelOverview()
    }

    const firstStageValue = Number(safeStageList[0].value) || 0
    const lastStageValue = Number(safeStageList[safeStageList.length - 1].value) || 0

    return {
      totalRateText: formatConversionRate(lastStageValue, firstStageValue),
      stageRates: safeStageList.slice(1).map((item, index) => {
        const previousItem = safeStageList[index]

        return {
          key: `${previousItem.key}-${item.key}`,
          label: `${previousItem.label} → ${item.label}`,
          rateText: formatConversionRate(item.value, previousItem.value)
        }
      })
    }
  },

  onDimensionChange(e) {
    const dimension = e.currentTarget.dataset.dimension

    if (!dimension || dimension === this.data.dimension) {
      return
    }

    this.setData({
      dimension
    }, () => {
      if (this.data.viewMode === 'gameAnalytics') {
        this.loadPoemPancakeAnalytics()
        return
      }

      this.loadAnalytics()
    })
  },

  onMetricToggle(e) {
    const metricKey = e.currentTarget.dataset.key
    const metricList = (this.data.metrics || []).map((item) => {
      if (item.key !== metricKey) {
        return item
      }

      return {
        ...item,
        checked: !item.checked
      }
    })

    if (!metricList.some((item) => item.checked)) {
      wx.showToast({
        title: '至少保留一个指标',
        icon: 'none'
      })
      return
    }

    this.setData({
      metrics: metricList
    }, () => {
      this.drawChartsIfReady()
    })
  },

  getSelectedMetrics() {
    return (this.data.metrics || []).filter((item) => item.checked)
  },

  drawChartsIfReady() {
    if (this.data.viewMode === 'overview' || !this.data.analytics || !this.data.lineChartWidth || !this.data.funnelChartWidth) {
      return
    }

    this.drawLineChart()
    this.drawFunnelChart()
  },

  drawLineChart() {
    const analytics = this.data.analytics || {}
    const labels = analytics.labels || []
    const seriesMap = analytics.seriesMap || {}
    const metrics = this.getSelectedMetrics()
    const width = Number(this.data.lineChartWidth) || 0
    const height = Number(this.data.lineChartHeight) || 0
    const ctx = wx.createCanvasContext('lineChartCanvas')

    ctx.clearRect(0, 0, width, height)
    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, width, height)

    if (!labels.length || !metrics.length) {
      ctx.draw()
      return
    }

    const isDenseLabelDimension = analytics.dimension === 'day' || analytics.dimension === 'cycle'
    const padding = {
      left: 54,
      right: 20,
      top: 24,
      bottom: isDenseLabelDimension ? 72 : 42
    }
    const plotWidth = Math.max(1, width - padding.left - padding.right)
    const plotHeight = Math.max(1, height - padding.top - padding.bottom)
    const maxValue = metrics.reduce((result, item) => {
      const currentMax = Math.max(...(seriesMap[item.key] || [0]))
      return Math.max(result, currentMax)
    }, 0)
    const axisMax = getAxisMax(maxValue)

    ctx.setStrokeStyle('#e8edf5')
    ctx.setLineWidth(1)
    ctx.setFontSize(11)
    ctx.setFillStyle('#98a2b3')
    ctx.setTextAlign('right')

    for (let i = 0; i <= 4; i += 1) {
      const y = padding.top + plotHeight - (plotHeight / 4) * i
      const value = Math.round((axisMax / 4) * i)

      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(width - padding.right, y)
      ctx.stroke()
      ctx.fillText(String(value), padding.left - 8, y + 4)
    }

    ctx.setTextAlign('center')
    ctx.setFillStyle('#98a2b3')
    ctx.setFontSize(isDenseLabelDimension ? 8 : 11)
    const labelInterval = analytics.dimension === 'day'
      ? 1
      : (analytics.dimension === 'cycle'
        ? Math.max(1, Math.ceil(labels.length / 8))
        : Math.max(1, Math.ceil(labels.length / 6)))

    labels.forEach((label, index) => {
      if (index % labelInterval !== 0 && index !== labels.length - 1) {
        return
      }

      const x = labels.length === 1
        ? padding.left + plotWidth / 2
        : padding.left + (plotWidth / (labels.length - 1)) * index

      if (isDenseLabelDimension) {
        ctx.save()
        ctx.translate(x, height - 10)
        ctx.rotate(-Math.PI / 4)
        ctx.fillText(label, 0, 0)
        ctx.restore()
        return
      }

      ctx.fillText(label, x, height - 12)
    })

    metrics.forEach((metric) => {
      const values = seriesMap[metric.key] || []

      ctx.beginPath()
      ctx.setLineWidth(2)
      ctx.setStrokeStyle(metric.color)
      ctx.setLineCap('round')
      ctx.setLineJoin('round')

      values.forEach((value, index) => {
        const x = values.length === 1
          ? padding.left + plotWidth / 2
          : padding.left + (plotWidth / (values.length - 1)) * index
        const y = padding.top + plotHeight - (plotHeight * value / axisMax)

        if (index === 0) {
          ctx.moveTo(x, y)
          return
        }

        ctx.lineTo(x, y)
      })

      ctx.stroke()

      values.forEach((value, index) => {
        const x = values.length === 1
          ? padding.left + plotWidth / 2
          : padding.left + (plotWidth / (values.length - 1)) * index
        const y = padding.top + plotHeight - (plotHeight * value / axisMax)

        ctx.beginPath()
        ctx.setFillStyle('#ffffff')
        ctx.setStrokeStyle(metric.color)
        ctx.setLineWidth(2)
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      })
    })

    ctx.draw()
  },

  drawFunnelChart() {
    const stages = this.data.funnelStages || []
    const width = Number(this.data.funnelChartWidth) || 0
    const height = Number(this.data.funnelChartHeight) || 0
    const ctx = wx.createCanvasContext('funnelChartCanvas')

    ctx.clearRect(0, 0, width, height)
    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, width, height)

    if (!stages.length) {
      ctx.draw()
      return
    }

    const maxValue = Math.max(...stages.map((item) => Number(item.value) || 0), 1)
    const top = 18
    const bottom = 18
    const horizontalPadding = 18
    const maxWidth = width - horizontalPadding * 2
    const minWidth = maxWidth * 0.48
    const stageGap = 12
    const stageHeight = (height - top - bottom - stageGap * (stages.length - 1)) / stages.length
    const centerX = width / 2

    stages.forEach((item, index) => {
      const currentRatio = (Number(item.value) || 0) / maxValue
      const nextItem = stages[index + 1]
      const nextRatio = nextItem
        ? (Number(nextItem.value) || 0) / maxValue
        : Math.max(0.32, currentRatio * 0.82)
      const topWidth = minWidth + (maxWidth - minWidth) * currentRatio
      const bottomWidth = minWidth + (maxWidth - minWidth) * nextRatio
      const topY = top + (stageHeight + stageGap) * index
      const bottomY = topY + stageHeight

      ctx.beginPath()
      ctx.moveTo(centerX - topWidth / 2, topY)
      ctx.lineTo(centerX + topWidth / 2, topY)
      ctx.lineTo(centerX + bottomWidth / 2, bottomY)
      ctx.lineTo(centerX - bottomWidth / 2, bottomY)
      ctx.closePath()
      ctx.setFillStyle(item.color || '#667085')
      ctx.fill()

      ctx.setFillStyle('rgba(255, 255, 255, 0.96)')
      ctx.setTextAlign('center')
      ctx.setFontSize(12)
      ctx.fillText(item.label, centerX, topY + stageHeight / 2 - 6)
      ctx.setFontSize(18)
      ctx.fillText(String(item.value), centerX, topY + stageHeight / 2 + 18)
    })

    ctx.draw()
  },

  onRetryTap() {
    if (this.data.viewMode === 'activity') {
      this.loadAnalytics()
      return
    }

    if (this.data.viewMode === 'gameAnalytics') {
      this.loadPoemPancakeAnalytics()
      return
    }

    this.loadOverviewData()
  }
})
