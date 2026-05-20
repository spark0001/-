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
    recordList: []
  },

  mergeLocalRecordPatch(recordList) {
    const patchMap = this.recordPatchMap || {}

    return (recordList || []).map((item) => {
      const recordKey = `${item.type || ''}:${item._id || ''}`
      const patch = patchMap[recordKey]

      return patch
        ? {
          ...item,
          ...patch
        }
        : item
    })
  },

  onShow() {
    this.loadRecordList()
  },

  onPullDownRefresh() {
    this.loadRecordList({
      stopPullDownRefresh: true
    })
  },

  loadRecordList(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getMyRecordList'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '获取记录失败')
      }

      this.setData({
        loading: false,
        recordList: this.buildRecordList(this.mergeLocalRecordPatch(result.records || []))
      })
    }).catch((error) => {
      console.error('getMyRecordList error:', error)
      this.setData({
        loading: false,
        errorMessage: '打卡记录加载失败，请稍后重试。',
        recordList: []
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  buildRecordList(recordList) {
    return (recordList || []).map((item, index) => {
      return {
        ...item,
        recordKey: `${item.type || 'reading'}-${item._id || index}`,
        typeClass: item.type === 'life' ? 'life' : 'reading',
        title: item.title || '未填写标题',
        summary: item.summary || '',
        createdAtText: formatDateTime(item.createdAt),
        imageUrl: item.imageUrl || '',
        hasImage: !!item.imageUrl
      }
    })
  },

  applyUpdatedRecord(updatedRecord) {
    if (!updatedRecord || !updatedRecord._id) {
      return
    }

    if (!this.recordPatchMap) {
      this.recordPatchMap = {}
    }

    this.recordPatchMap[`${updatedRecord.type || ''}:${updatedRecord._id || ''}`] = {
      ...updatedRecord
    }

    const nextRecordList = (this.data.recordList || []).map((item) => {
      if (item._id !== updatedRecord._id || item.type !== updatedRecord.type) {
        return item
      }

      return {
        ...item,
        ...updatedRecord,
        typeClass: updatedRecord.type === 'life' ? 'life' : 'reading',
        createdAtText: formatDateTime(updatedRecord.createdAt),
        imageUrl: updatedRecord.imageUrl || '',
        hasImage: !!updatedRecord.imageUrl
      }
    })

    this.setData({
      recordList: nextRecordList
    })
  },

  goRecordDetail(e) {
    const index = Number(e.currentTarget.dataset.index)
    const record = this.data.recordList[index]

    if (!record) {
      return
    }

    wx.navigateTo({
      url: '/pages/record-detail/record-detail',
      success: (navRes) => {
        navRes.eventChannel.emit('acceptRecordDetail', {
          record
        })
      }
    })
  },

  onEditRecordTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const record = this.data.recordList[index]

    if (!record) {
      return
    }

    if (record.type !== 'reading' && record.type !== 'life') {
      wx.showToast({
        title: '当前记录暂不支持编辑',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url: `/pages/edit-record/edit-record?id=${encodeURIComponent(record._id || '')}&type=${encodeURIComponent(record.type || '')}`,
      success: (navRes) => {
        if (navRes.eventChannel && navRes.eventChannel.on) {
          navRes.eventChannel.on('recordUpdated', ({ record: updatedRecord }) => {
            this.applyUpdatedRecord(updatedRecord)
            this.loadRecordList()
          })
        }

        if (navRes.eventChannel && navRes.eventChannel.emit) {
          navRes.eventChannel.emit('acceptEditableRecord', {
            record
          })
        }
      }
    })
  },

  onRetryTap() {
    this.loadRecordList()
  }
})
