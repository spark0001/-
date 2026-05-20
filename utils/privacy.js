const DEFAULT_PRIVACY_CONTRACT_NAME = '用户隐私保护指引'
const DEFAULT_PRIVACY_TITLE = '温馨提示'
const DEFAULT_PRIVACY_INTRO_TEXT = '为了完成读书会报名审核、活动参与、图片上传与个人资料展示，请先阅读并同意《用户隐私保护指引》。我们只会在提供读书会服务所必需的范围内使用你提供的信息。'
const DEFAULT_AGREE_BUTTON_ID = 'privacy-agree-button'

function normalizeText(value) {
  return String(value || '').trim()
}

function isPrivacyCancelError(error) {
  const errorMessage = normalizeText(error && error.errMsg).toLowerCase()

  return (
    errorMessage.indexOf('cancel') !== -1
    || errorMessage.indexOf('deny') !== -1
    || errorMessage.indexOf('disagree') !== -1
  )
}

function buildPrivacyReminderData(overrides = {}) {
  return {
    privacyReminderVisible: false,
    privacyContractName: DEFAULT_PRIVACY_CONTRACT_NAME,
    privacyReminderTitle: DEFAULT_PRIVACY_TITLE,
    privacyIntroText: DEFAULT_PRIVACY_INTRO_TEXT,
    privacyConfirmText: '同意并继续',
    privacyCancelText: '暂不同意',
    ...overrides
  }
}

function flushPrivacyResolverQueue(pageInstance, payload) {
  const resolverQueue = Array.isArray(pageInstance._privacyResolverQueue)
    ? pageInstance._privacyResolverQueue.slice()
    : []

  pageInstance._privacyResolverQueue = []

  resolverQueue.forEach((resolve) => {
    try {
      resolve(payload)
    } catch (error) {
      console.error('resolve privacy authorization error:', error)
    }
  })
}

const privacyReminderMethods = {
  openPrivacyReminder(resolve, eventInfo = {}) {
    if (!Array.isArray(this._privacyResolverQueue)) {
      this._privacyResolverQueue = []
    }

    if (typeof resolve === 'function') {
      this._privacyResolverQueue.push(resolve)
    }

    const nextContractName = normalizeText(eventInfo.privacyContractName) || DEFAULT_PRIVACY_CONTRACT_NAME

    this.setData({
      privacyReminderVisible: true,
      privacyContractName: nextContractName
    })
  },

  closePrivacyReminder() {
    this.setData({
      privacyReminderVisible: false
    })
  },

  onPrivacyReminderAgree(e) {
    const detail = e && e.detail && typeof e.detail === 'object' ? e.detail : {}

    this.setData({
      privacyReminderVisible: false
    })

    flushPrivacyResolverQueue(this, {
      event: 'agree',
      buttonId: normalizeText(detail.buttonId) || DEFAULT_AGREE_BUTTON_ID
    })
  },

  onPrivacyReminderDisagree() {
    this.setData({
      privacyReminderVisible: false
    })

    flushPrivacyResolverQueue(this, {
      event: 'disagree'
    })
  },

  onPrivacyReminderViewContract() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({
        title: '当前基础库暂不支持查看',
        icon: 'none'
      })
      return
    }

    wx.openPrivacyContract({
      fail: (error) => {
        console.error('openPrivacyContract error:', error)
        wx.showToast({
          title: '隐私指引打开失败',
          icon: 'none'
        })
      }
    })
  }
}

function requestPrivacyAuthorization() {
  return new Promise((resolve) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve(true)
      return
    }

    wx.requirePrivacyAuthorize({
      success: () => {
        resolve(true)
      },
      fail: (error) => {
        if (!isPrivacyCancelError(error)) {
          console.error('requirePrivacyAuthorize error:', error)
        }

        resolve(false)
      }
    })
  })
}

function bindPrivacyLifecycle(app) {
  if (!app || typeof wx.onNeedPrivacyAuthorization !== 'function') {
    return
  }

  wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
    if (typeof app.handleNeedPrivacyAuthorization === 'function') {
      app.handleNeedPrivacyAuthorization(resolve, eventInfo)
      return
    }

    if (typeof resolve === 'function') {
      resolve({
        event: 'disagree'
      })
    }
  })
}

module.exports = {
  DEFAULT_AGREE_BUTTON_ID,
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization,
  bindPrivacyLifecycle
}
