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

Page({
  data: {
    loading: true,
    errorMessage: '',
    reviewingId: '',
    list: []
  },

  onShow() {
    this.loadPendingApplications()
  },

  onPullDownRefresh() {
    this.loadPendingApplications({
      stopPullDownRefresh: true
    })
  },

  loadPendingApplications(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getPendingApplications'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '获取待审核申请失败')
      }

      this.setData({
        loading: false,
        list: (result.list || []).map((item) => {
          return {
            ...item,
            createdAtText: formatDateTime(item.createdAt)
          }
        })
      })
    }).catch((error) => {
      console.error('getPendingApplications error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '当前账号无法查看申请审核'
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onReviewTap(e) {
    const applicationId = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    const name = e.currentTarget.dataset.name || '该成员'

    if (!applicationId || !action || this.data.reviewingId) {
      return
    }

    const actionText = action === 'approve' ? '通过' : '拒绝'

    wx.showModal({
      title: `确认${actionText}`,
      content: `是否确认${actionText}${name}的申请？`,
      confirmText: action === 'approve' ? '确认通过' : '确认拒绝',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.submitReview(applicationId, action)
        }
      }
    })
  },

  submitReview(applicationId, action) {
    this.setData({
      reviewingId: applicationId
    })

    wx.showLoading({
      title: '处理中...'
    })

    wx.cloud.callFunction({
      name: 'reviewApplication',
      data: {
        applicationId,
        action
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '处理失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: action === 'approve' ? '已通过' : '已拒绝',
        icon: 'success'
      })

      this.loadPendingApplications()
    }).catch((error) => {
      wx.hideLoading()
      console.error('reviewApplication error:', error)
      wx.showToast({
        title: '处理失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        reviewingId: ''
      })
    })
  }
})
