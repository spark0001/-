const CREATE_MANAGE_CACHE_KEY = 'createManageAccessCacheV1'

function buildAccessPayload(userInfo) {
  const safeUserInfo = userInfo || {}
  const adminApproved = safeUserInfo.role === 'admin' && safeUserInfo.status === 'approved'
  const manageVisible = !!safeUserInfo.superAdmin || adminApproved

  return {
    blindPoemManageVisible: manageVisible,
    poemPancakeManageVisible: manageVisible
  }
}

Page({
  data: {
    loading: true,
    syncing: false,
    errorMessage: '',
    blindPoemManageVisible: false,
    poemPancakeManageVisible: false,
    hasContent: false
  },

  onLoad() {
    this.hydrateManageAccessCache()
    this.loadManageAccess({
      silent: this.data.hasContent
    })
  },

  onPullDownRefresh() {
    this.loadManageAccess({
      stopPullDownRefresh: true
    })
  },

  hydrateManageAccessCache() {
    try {
      const cache = wx.getStorageSync(CREATE_MANAGE_CACHE_KEY) || {}
      const payload = cache.payload || null

      if (!payload) {
        return
      }

      this.setData({
        blindPoemManageVisible: !!payload.blindPoemManageVisible,
        poemPancakeManageVisible: !!payload.poemPancakeManageVisible,
        loading: false,
        syncing: false,
        errorMessage: '',
        hasContent: !!payload.blindPoemManageVisible || !!payload.poemPancakeManageVisible
      })
    } catch (error) {
      console.warn('hydrate create manage cache failed:', error)
    }
  },

  persistManageAccessCache() {
    try {
      wx.setStorageSync(CREATE_MANAGE_CACHE_KEY, {
        updatedAt: Date.now(),
        payload: {
          blindPoemManageVisible: this.data.blindPoemManageVisible,
          poemPancakeManageVisible: this.data.poemPancakeManageVisible
        }
      })
    } catch (error) {
      console.warn('persist create manage cache failed:', error)
    }
  },

  loadManageAccess(options = {}) {
    const silent = !!options.silent && this.data.hasContent

    this.setData({
      loading: !silent,
      syncing: silent,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getMyCenterData'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '创作互动管理权限加载失败')
      }

      const nextPayload = buildAccessPayload(result.userInfo || {})

      if (!nextPayload.blindPoemManageVisible && !nextPayload.poemPancakeManageVisible) {
        throw new Error('当前账号没有创作互动管理权限')
      }

      this.setData({
        loading: false,
        syncing: false,
        errorMessage: '',
        blindPoemManageVisible: nextPayload.blindPoemManageVisible,
        poemPancakeManageVisible: nextPayload.poemPancakeManageVisible,
        hasContent: true
      }, () => {
        this.persistManageAccessCache()
      })
    }).catch((error) => {
      console.error('loadCreateManageAccess error:', error)
      this.setData({
        loading: false,
        syncing: false,
        errorMessage: error.message || '创作互动管理权限加载失败'
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  goBlindPoemManage() {
    wx.navigateTo({
      url: '/pages/blind-poem-manage/blind-poem-manage'
    })
  },

  goPoemPancakeManage() {
    wx.navigateTo({
      url: '/pages/poem-pancake-manage/poem-pancake-manage'
    })
  }
})
