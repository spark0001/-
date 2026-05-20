function buildDefaultForm() {
  return {
    title: '',
    content: '',
    isActive: true
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDateTime(timestamp) {
  const safeTimestamp = Number(timestamp) || 0

  if (!safeTimestamp) {
    return '暂无时间'
  }

  const date = new Date(safeTimestamp)

  if (Number.isNaN(date.getTime())) {
    return '暂无时间'
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}`
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    saving: false,
    updatingNoticeId: '',
    deletingNoticeId: '',
    currentNotice: null,
    noticeHistoryList: [],
    editingSourceNoticeId: '',
    editingSourceTitle: '',
    form: buildDefaultForm()
  },

  onShow() {
    this.loadNoticeData()
  },

  onPullDownRefresh() {
    this.loadNoticeData({
      stopPullDownRefresh: true
    })
  },

  loadNoticeData(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getNoticeManageData'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '公告数据加载失败')
      }

      const notice = result.notice || null
      const noticeList = result.noticeList || []
      const currentNoticeId = notice ? (notice.noticeId || '') : ''

      this.setData({
        loading: false,
        currentNotice: notice ? {
          noticeId: notice.noticeId || '',
          title: notice.title || '',
          content: notice.content || '',
          updatedAtText: formatDateTime(notice.updatedAt),
          isActive: notice.isActive === true,
          isLatest: notice.isLatest !== false
        } : null,
        noticeHistoryList: noticeList.map((item) => ({
          noticeId: item.noticeId || '',
          title: item.title || '',
          content: item.content || '',
          summary: normalizeText(item.content).slice(0, 56) || '暂无公告内容',
          updatedAtText: formatDateTime(item.updatedAt),
          isActive: item.isActive === true,
          isLatest: item.isLatest === true || item.noticeId === currentNoticeId
        })),
        editingSourceNoticeId: '',
        editingSourceTitle: '',
        form: notice ? {
          title: notice.title || '',
          content: notice.content || '',
          isActive: notice.isActive !== false
        } : buildDefaultForm()
      })
    }).catch((error) => {
      console.error('getNoticeManageData error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '公告数据加载失败',
        currentNotice: null,
        noticeHistoryList: [],
        editingSourceNoticeId: '',
        editingSourceTitle: '',
        form: buildDefaultForm()
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    this.setData({
      [`form.${field}`]: e.detail.value
    })
  },

  onActiveChange(e) {
    this.setData({
      'form.isActive': !!(e.detail && e.detail.value)
    })
  },

  onEditNoticeTap(e) {
    const item = e.currentTarget.dataset.item || {}

    this.setData({
      editingSourceNoticeId: item.noticeId || '',
      editingSourceTitle: item.title || '',
      form: {
        title: item.title || '',
        content: item.content || '',
        isActive: item.isActive !== false
      }
    })

    wx.pageScrollTo({
      scrollTop: 0,
      duration: 200
    })
  },

  onToggleNoticeStatusTap(e) {
    const item = e.currentTarget.dataset.item || {}
    const noticeId = item.noticeId || ''

    if (!noticeId || this.data.updatingNoticeId || this.data.deletingNoticeId) {
      return
    }

    this.setData({
      updatingNoticeId: noticeId
    })

    wx.cloud.callFunction({
      name: 'updateNoticeStatus',
      data: {
        noticeId,
        isActive: !(item.isActive === true)
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        wx.showToast({
          title: result.message || '操作失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: result.message || '操作成功',
        icon: 'success'
      })

      this.loadNoticeData()
    }).catch((error) => {
      console.error('updateNoticeStatus error:', error)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        updatingNoticeId: ''
      })
    })
  },

  onDeleteNoticeTap(e) {
    const item = e.currentTarget.dataset.item || {}
    const noticeId = item.noticeId || ''
    const title = normalizeText(item.title) || '未命名公告'

    if (!noticeId || this.data.deletingNoticeId || this.data.updatingNoticeId) {
      return
    }

    wx.showModal({
      title: '删除公告',
      content: `确定删除“${title}”吗？删除后不可恢复。`,
      confirmColor: '#d14343',
      success: ({ confirm }) => {
        if (!confirm) {
          return
        }

        this.deleteNotice(noticeId)
      }
    })
  },

  deleteNotice(noticeId) {
    this.setData({
      deletingNoticeId: noticeId
    })

    wx.showLoading({
      title: '删除中...'
    })

    wx.cloud.callFunction({
      name: 'deleteNotice',
      data: {
        noticeId
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '删除失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: result.message || '删除成功',
        icon: 'success'
      })

      this.loadNoticeData()
    }).catch((error) => {
      wx.hideLoading()
      console.error('deleteNotice error:', error)
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        deletingNoticeId: ''
      })
    })
  },

  onSaveTap() {
    const form = this.data.form || {}
    const title = normalizeText(form.title)
    const content = normalizeText(form.content)

    if (!title) {
      wx.showToast({
        title: '请填写公告标题',
        icon: 'none'
      })
      return
    }

    if (!content) {
      wx.showToast({
        title: '请填写公告正文',
        icon: 'none'
      })
      return
    }

    if (this.data.saving) {
      return
    }

    this.setData({
      saving: true
    })

    wx.showLoading({
      title: '保存中...'
    })

    wx.cloud.callFunction({
      name: 'saveNotice',
      data: {
        title,
        content,
        isActive: form.isActive !== false
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: '公告已保存',
        icon: 'success'
      })

      this.loadNoticeData()
    }).catch((error) => {
      wx.hideLoading()
      console.error('saveNotice error:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        saving: false
      })
    })
  }
})
