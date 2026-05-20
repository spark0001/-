const { fetchAccessDecision } = require('../../utils/profileSupplement')
const {
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization
} = require('../../utils/privacy')

Page({
  data: {
    loading: true,
    errorMessage: '',
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onShow() {
    this.ensurePrivacyAndRoute()
  },

  ensurePrivacyAndRoute() {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        this.setData({
          loading: false,
          errorMessage: '请先阅读并同意《用户隐私保护指引》后继续使用。'
        })
        return
      }

      this.routeByUserStatus()
    })
  },

  routeByUserStatus() {
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

      if (applicationInfo.hasApplication) {
        wx.reLaunch({
          url: '/pages/guest-status/guest-status'
        })
        return
      }

      wx.reLaunch({
        url: '/pages/apply/apply'
      })
    }).catch((error) => {
      console.error('index routeByUserStatus error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '加载失败，请稍后重试'
      })
    })
  },

  onRetryTap() {
    this.ensurePrivacyAndRoute()
  }
})
