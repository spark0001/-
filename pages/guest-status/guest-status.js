const { fetchAccessDecision } = require('../../utils/profileSupplement')
const { maybeShowLatestNotice, confirmLatestNotice } = require('../../utils/notice')

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

function getStatusText(status) {
  if (status === 'approved') {
    return '已通过'
  }

  if (status === 'rejected') {
    return '未通过'
  }

  return '审核中'
}

function getStatusClass(status) {
  if (status === 'approved') {
    return 'approved'
  }

  if (status === 'rejected') {
    return 'rejected'
  }

  return 'pending'
}

function getStatusButtonText(status) {
  if (status === 'rejected') {
    return '报名信息审核未通过'
  }

  return '已报名成功，等待审核'
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    statusText: '审核中',
    statusClass: 'pending',
    statusButtonText: '已报名成功，等待审核',
    name: '',
    gradeMajor: '',
    createdAtText: '暂无',
    noticePromptVisible: false,
    noticePromptTitle: '',
    noticePromptContent: '',
    noticePromptNoticeId: ''
  },

  onLoad() {
    this.noticePromptShowing = false
    this.noticePromptHandled = false
  },

  onShow() {
    this.loadStatus()
  },

  onPullDownRefresh() {
    this.loadStatus({
      stopPullDownRefresh: true
    })
  },

  loadStatus(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    fetchAccessDecision().then(({ userInfo, applicationInfo }) => {
      if (userInfo.status === 'approved') {
        wx.switchTab({
          url: '/pages/home/home'
        })
        return
      }

      if (!applicationInfo.hasApplication) {
        wx.reLaunch({
          url: '/pages/apply/apply'
        })
        return
      }

      const status = applicationInfo.status || 'pending'

      this.setData({
        loading: false,
        statusText: getStatusText(status),
        statusClass: getStatusClass(status),
        statusButtonText: getStatusButtonText(status),
        name: applicationInfo.name || '',
        gradeMajor: applicationInfo.gradeMajor || '',
        createdAtText: formatDateTime(applicationInfo.createdAt)
      }, () => {
        this.maybeShowLatestNotice()
      })
    }).catch((error) => {
      console.error('guest-status loadStatus error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '报名状态加载失败'
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  maybeShowLatestNotice() {
    return maybeShowLatestNotice(this)
  },

  onNoticePromptConfirm() {
    return confirmLatestNotice(this)
  },

  noop() {}
})
