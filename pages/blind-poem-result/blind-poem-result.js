const MODE_TEXT_MAP = {
  A: '模式A：双人各写一句',
  B: '模式B：上下句互写',
  C: '模式C：同题异写'
}
const {
  SHARE_LANDING_CREATE,
  buildShareAppMessage,
  buildShareTimeline,
  showPageShareMenu
} = require('../../utils/share')

const MODE_META_MAP = {
  A: {
    heroKicker: 'DUET POEM',
    modeShortLabel: '双句合诗',
    accentClass: 'accent-a'
  },
  B: {
    heroKicker: 'COUPLET MODE',
    modeShortLabel: '上下句互写',
    accentClass: 'accent-b'
  },
  C: {
    heroKicker: 'TWIN THEMES',
    modeShortLabel: '同题异写',
    accentClass: 'accent-c'
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function buildStatusMeta(statusText) {
  const safeStatusText = normalizeText(statusText)

  if (safeStatusText.indexOf('屏蔽') !== -1) {
    return {
      statusTagText: '内容受限',
      statusToneClass: 'tone-warning',
      resultToneClass: 'result-warning'
    }
  }

  if (safeStatusText.indexOf('等待') !== -1) {
    return {
      statusTagText: '等待完成',
      statusToneClass: 'tone-waiting',
      resultToneClass: 'result-waiting'
    }
  }

  return {
    statusTagText: '结果已生成',
    statusToneClass: 'tone-completed',
    resultToneClass: 'result-ready'
  }
}

function buildParticipantViewList(mode, participants) {
  const safeParticipants = Array.isArray(participants) ? participants : []
  const roleLabelList = mode === 'B'
    ? ['上句写作者', '下句写作者']
    : ['写作者甲', '写作者乙']

  return safeParticipants.map((item, index) => {
    const hasAvatar = !!normalizeText(item && item.avatarUrl)

    return {
      ...item,
      roleLabel: roleLabelList[index] || `写作者${index + 1}`,
      stateText: hasAvatar ? '头像已展示' : '使用默认代号'
    }
  })
}

function buildResultLeadText(statusTagText, mode) {
  if (statusTagText === '内容受限') {
    return '本轮作品包含受限内容，因此完整结果暂不对外展示。'
  }

  if (statusTagText === '等待完成') {
    return '另一位写作者完成后，这里会自动汇成完整结果。'
  }

  if (mode === 'C') {
    return '同一题面下的两份作品，已经在这里并排落定。'
  }

  if (mode === 'B') {
    return '上下句已经接上，整轮作品在这里合拢成篇。'
  }

  return '两位写作者的文字，已经在这一页彼此相遇。'
}

function buildDetailView(detail) {
  const safeDetail = detail && typeof detail === 'object' ? detail : {}
  const mode = normalizeText(safeDetail.mode).toUpperCase()
  const modeMeta = MODE_META_MAP[mode] || MODE_META_MAP.A
  const statusMeta = buildStatusMeta(safeDetail.statusText)
  const theme = normalizeText(safeDetail.theme)
  const imageryText = normalizeText(safeDetail.imageryText)

  return {
    ...safeDetail,
    ...modeMeta,
    ...statusMeta,
    theme,
    imageryText,
    promptTitle: normalizeText(safeDetail.promptTitle) || '双盲作诗',
    promptText: normalizeText(safeDetail.promptText) || '这一轮还没有公开题面。',
    createdAtText: normalizeText(safeDetail.createdAtText),
    myContent: normalizeText(safeDetail.myContent) || '你还没有提交作品。',
    partnerContent: normalizeText(safeDetail.partnerContent) || '另一位写作者还没有完成创作，稍后可回来刷新查看。',
    resultContent: normalizeText(safeDetail.resultContent) || '当前还未生成完整结果，等待另一位写作者提交后会在这里展示。',
    participants: buildParticipantViewList(mode, safeDetail.participants),
    resultLeadText: buildResultLeadText(statusMeta.statusTagText, mode)
  }
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    roundId: '',
    detail: null
  },

  onLoad(options = {}) {
    showPageShareMenu()
    this.setData({
      roundId: options.roundId || ''
    })
  },

  onShow() {
    if (this.data.roundId) {
      this.loadRoundDetail()
    }
  },

  onPullDownRefresh() {
    this.loadRoundDetail({
      stopPullDownRefresh: true
    })
  },

  loadRoundDetail(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBlindPoemRoundDetail',
      data: {
        roundId: this.data.roundId
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '加载结果失败')
      }

      const detail = result.detail || {}

      this.setData({
        loading: false,
        detail: buildDetailView({
          ...detail,
          modeText: MODE_TEXT_MAP[detail.mode] || detail.modeText || '双盲作诗'
        })
      })
    }).catch((error) => {
      console.error('getBlindPoemRoundDetail error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '加载结果失败',
        detail: null
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onRefreshTap() {
    this.loadRoundDetail()
  },

  onContinueTap() {
    const mode = this.data.detail && this.data.detail.mode

    if (!mode) {
      return
    }

    wx.redirectTo({
      url: `/pages/blind-poem-compose/blind-poem-compose?mode=${mode}`
    })
  },

  onMakePosterTap() {
    const detail = this.data.detail || null
    const roundId = detail && detail.roundId

    if (!roundId) {
      wx.showToast({
        title: '当前结果还没准备好',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/blind-poem-poster/blind-poem-poster?roundId=${encodeURIComponent(roundId)}`,
      success: (res) => {
        if (res && res.eventChannel && detail) {
          res.eventChannel.emit('acceptBlindPoemPosterDetail', {
            detail
          })
        }
      }
    })
  },

  goHistory() {
    wx.navigateTo({
      url: '/pages/blind-poem-history/blind-poem-history'
    })
  },

  getBlindPoemResultShareConfig() {
    const detail = this.data.detail || {}
    const promptTitle = normalizeText(detail.promptTitle)
    const modeText = normalizeText(detail.modeText)

    return {
      title: promptTitle
        ? `双盲作诗结果｜${promptTitle}`
        : (modeText ? `双盲作诗结果｜${modeText}` : '双盲作诗结果｜来看看这一轮创作'),
      path: '/pages/create/create',
      shareLanding: SHARE_LANDING_CREATE
    }
  },

  onShareAppMessage() {
    return buildShareAppMessage(this.getBlindPoemResultShareConfig())
  },

  onShareTimeline() {
    const shareConfig = this.getBlindPoemResultShareConfig()
    return buildShareTimeline({
      title: shareConfig.title,
      shareLanding: shareConfig.shareLanding
    })
  }
})
