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
    actioningKey: '',
    list: []
  },

  onShow() {
    this.loadVisitorApplications()
  },

  onPullDownRefresh() {
    this.loadVisitorApplications({
      stopPullDownRefresh: true
    })
  },

  loadVisitorApplications(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getVisitorApplications'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '获取外来访客申请失败')
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
      console.error('getVisitorApplications error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '当前账号无法查看外来访客申请'
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onActionTap(e) {
    const applicationId = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    const name = e.currentTarget.dataset.name || '该访客'

    if (!applicationId || !action || this.data.actioningKey) {
      return
    }

    const isApproveAction = action === 'approve'
    const title = isApproveAction ? '通过审核' : '删除记录'
    const content = isApproveAction
      ? `确认直接通过 ${name} 的访客申请吗？通过后将跳过正常口令审核，直接可进入小程序。`
      : `确认删除 ${name} 的访客记录吗？删除后该记录将不再保留在访客列表中。`

    wx.showModal({
      title,
      content,
      confirmText: isApproveAction ? '确认通过' : '确认删除',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.submitAction(applicationId, action)
        }
      }
    })
  },

  submitAction(applicationId, action) {
    const actioningKey = `${action}-${applicationId}`

    this.setData({
      actioningKey
    })

    wx.showLoading({
      title: action === 'approve' ? '通过中...' : '删除中...'
    })

    wx.cloud.callFunction({
      name: 'manageVisitorApplication',
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
        title: action === 'approve' ? '已通过' : '已删除',
        icon: 'success'
      })

      this.loadVisitorApplications()
    }).catch((error) => {
      wx.hideLoading()
      console.error('manageVisitorApplication error:', error)
      wx.showToast({
        title: '处理失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        actioningKey: ''
      })
    })
  }
})
