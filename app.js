const { bindPrivacyLifecycle } = require('./utils/privacy')

const CLOUD_ENV_STORAGE_KEY = 'cloudEnvId'

function resolveCloudEnvId() {
  const cachedEnvId = typeof wx.getStorageSync === 'function'
    ? String(wx.getStorageSync(CLOUD_ENV_STORAGE_KEY) || '').trim()
    : ''

  if (cachedEnvId) {
    return cachedEnvId
  }

  return wx.cloud && wx.cloud.DYNAMIC_CURRENT_ENV
    ? wx.cloud.DYNAMIC_CURRENT_ENV
    : undefined
}

App({
  onLaunch() {
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    wx.login({
      success: (res) => {
        if (res.code) {
          console.log('wx.login success, code:', res.code)
        } else {
          console.error('wx.login failed:', res)
        }
      },
      fail: (error) => {
        console.error('wx.login failed:', error)
      }
    })

    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      const cloudEnvId = resolveCloudEnvId()
      wx.cloud.init({
        env: cloudEnvId,
        traceUser: true
      })
      this.globalData.cloudEnvId = cloudEnvId || ''
    }

    bindPrivacyLifecycle(this)
  },

  handleNeedPrivacyAuthorization(resolve, eventInfo = {}) {
    const pageStack = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const currentPage = pageStack[pageStack.length - 1]

    if (currentPage && typeof currentPage.openPrivacyReminder === 'function') {
      currentPage.openPrivacyReminder(resolve, eventInfo)
      return
    }

    if (typeof resolve === 'function') {
      resolve({
        event: 'disagree'
      })
    }

    wx.showToast({
      title: '请重新进入页面后授权',
      icon: 'none'
    })
  },

  globalData: {
    userInfo: null,
    cloudEnvId: ''
  }
})
