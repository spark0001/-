const { fetchAccessDecision } = require('../../utils/profileSupplement')
const { maybeShowLatestNotice, confirmLatestNotice } = require('../../utils/notice')
const {
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization
} = require('../../utils/privacy')

Page({
  data: {
    form: {
      name: '',
      gradeMajor: '',
      reason: '',
      contact: '',
      applyPassphrase: ''
    },
    loading: false,
    noticePromptVisible: false,
    noticePromptTitle: '',
    noticePromptContent: '',
    noticePromptNoticeId: '',
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad() {
    this.noticePromptShowing = false
    this.noticePromptHandled = false
  },

  onShow() {
    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        return
      }

      fetchAccessDecision().then(({ userInfo, applicationInfo }) => {
        if (userInfo.status === 'approved') {
          wx.switchTab({
            url: '/pages/home/home'
          })
          return
        }

        if (applicationInfo.hasApplication) {
          wx.redirectTo({
            url: '/pages/guest-status/guest-status'
          })
          return
        }

        this.maybeShowLatestNotice()
      }).catch((error) => {
        console.error('apply fetchAccessDecision error:', error)
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

  onNameInput(e) {
    this.setData({
      'form.name': e.detail.value
    })
  },

  onGradeMajorInput(e) {
    this.setData({
      'form.gradeMajor': e.detail.value
    })
  },

  onReasonInput(e) {
    this.setData({
      'form.reason': e.detail.value
    })
  },

  onContactInput(e) {
    this.setData({
      'form.contact': e.detail.value
    })
  },

  onApplyPassphraseInput(e) {
    this.setData({
      'form.applyPassphrase': e.detail.value
    })
  },

  onSubmit() {
    const form = this.data.form
    const name = form.name || ''
    const gradeMajor = form.gradeMajor || ''
    const reason = form.reason || ''
    const contact = form.contact || ''
    const applyPassphrase = form.applyPassphrase || ''

    if (!name.trim()) {
      wx.showToast({
        title: '请填写姓名',
        icon: 'none'
      })
      return
    }

    if (!gradeMajor.trim()) {
      wx.showToast({
        title: '请填写年级/专业',
        icon: 'none'
      })
      return
    }

    if (!reason.trim()) {
      wx.showToast({
        title: '请填写申请理由',
        icon: 'none'
      })
      return
    }

    if (this.data.loading) {
      return
    }

    this.setData({
      loading: true
    })

    wx.showLoading({
      title: '提交中...'
    })

    wx.cloud.callFunction({
      name: 'submitApplication',
      data: {
        name: name,
        gradeMajor: gradeMajor,
        reason: reason,
        contact: contact,
        applyPassphrase: applyPassphrase
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (result.success) {
        wx.showToast({
          title: '报名已提交',
          icon: 'success'
        })

        this.setData({
          form: {
            name: '',
            gradeMajor: '',
            reason: '',
            contact: '',
            applyPassphrase: ''
          }
        })

        setTimeout(() => {
          wx.redirectTo({
            url: '/pages/guest-status/guest-status'
          })
        }, 400)
      } else {
        wx.showToast({
          title: result.message || '提交失败',
          icon: 'none'
        })
      }
    }).catch((error) => {
      wx.hideLoading()
      wx.showToast({
        title: '云函数调用失败',
        icon: 'none'
      })
      console.error('submitApplication error:', error)
    }).finally(() => {
      this.setData({
        loading: false
      })
    })
  }
})
