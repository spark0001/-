const { setCachedAccessDecision } = require('../../utils/profileSupplement')

function buildDefaultProfileForm() {
  return {
    name: '',
    contact: '',
    gradeMajor: '',
    birthday: '',
    signature: ''
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function getProfileFieldValue(userInfo, applicationInfo, fieldName) {
  const userValue = normalizeText(userInfo && userInfo[fieldName])
  const applicationValue = normalizeText(applicationInfo && applicationInfo[fieldName])

  if (userInfo && userInfo.status === 'approved') {
    return userValue || applicationValue
  }

  return userValue || applicationValue
}

function buildProfileForm(userInfo, applicationInfo) {
  return {
    name: getProfileFieldValue(userInfo, applicationInfo, 'name'),
    contact: getProfileFieldValue(userInfo, applicationInfo, 'contact'),
    gradeMajor: getProfileFieldValue(userInfo, applicationInfo, 'gradeMajor'),
    birthday: normalizeText(userInfo && userInfo.birthday),
    signature: normalizeText(userInfo && userInfo.signature)
  }
}

function normalizeProfileForm(form) {
  return {
    name: normalizeText(form.name),
    contact: normalizeText(form.contact),
    gradeMajor: normalizeText(form.gradeMajor),
    birthday: normalizeText(form.birthday),
    signature: normalizeText(form.signature)
  }
}

Page({
  data: {
    loading: true,
    saving: false,
    editing: false,
    errorMessage: '',
    form: buildDefaultProfileForm()
  },

  onShow() {
    this.loadProfileData()
  },

  onPullDownRefresh() {
    this.loadProfileData({
      stopPullDownRefresh: true
    })
  },

  loadProfileData(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getMyCenterData'
    }).then((res) => {
      const result = res.result || {}
      const userInfo = result.userInfo || {}
      const applicationInfo = result.applicationInfo || {}

      if (!result.success) {
        throw new Error(result.message || '获取用户资料失败')
      }

      if (userInfo.status !== 'approved') {
        throw new Error('仅已通过审核的用户可查看用户资料')
      }

      this.latestUserInfo = userInfo
      this.latestApplicationInfo = applicationInfo
      setCachedAccessDecision(userInfo, applicationInfo)

      this.setData({
        loading: false,
        editing: false,
        form: buildProfileForm(userInfo, applicationInfo)
      })
    }).catch((error) => {
      console.error('get profile data error:', error)
      this.setData({
        loading: false,
        editing: false,
        errorMessage: error.message || '用户资料加载失败'
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onEditTap() {
    this.setData({
      editing: true
    })
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    this.setData({
      [`form.${field}`]: e.detail.value
    })
  },

  onBirthdayChange(e) {
    this.setData({
      'form.birthday': e.detail.value
    })
  },

  backToPreviousPage() {
    const pageStack = getCurrentPages()

    if (Array.isArray(pageStack) && pageStack.length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    wx.switchTab({
      url: '/pages/mine/mine'
    })
  },

  onSaveTap() {
    if (this.data.saving || !this.data.editing) {
      return
    }

    const form = normalizeProfileForm(this.data.form)

    if (!form.name) {
      wx.showToast({
        title: '请填写姓名',
        icon: 'none'
      })
      return
    }

    if (!form.gradeMajor) {
      wx.showToast({
        title: '请填写年级/专业',
        icon: 'none'
      })
      return
    }

    this.setData({
      saving: true
    })

    wx.showLoading({
      title: '保存中...'
    })

    wx.cloud.callFunction({
      name: 'updateMyUserInfo',
      data: {
        name: form.name,
        contact: form.contact,
        gradeMajor: form.gradeMajor,
        birthday: form.birthday,
        signature: form.signature
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        this.setData({
          saving: false
        })

        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        })
        return
      }

      this.setData({
        form,
        editing: false,
        saving: false
      })

      this.latestUserInfo = {
        ...(this.latestUserInfo || {}),
        name: form.name,
        contact: form.contact,
        gradeMajor: form.gradeMajor,
        birthday: form.birthday,
        signature: form.signature,
        status: 'approved',
        profileSupplementPrompted: true,
        updatedAt: Date.now()
      }
      setCachedAccessDecision(this.latestUserInfo, this.latestApplicationInfo || {})

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.backToPreviousPage()
    }).catch((error) => {
      wx.hideLoading()
      console.error('updateMyUserInfo error:', error)
      this.setData({
        saving: false
      })
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    })
  },

  onRetryTap() {
    this.loadProfileData()
  }
})
