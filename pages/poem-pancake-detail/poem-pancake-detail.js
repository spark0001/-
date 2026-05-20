const {
  buildPrivacyReminderData,
  privacyReminderMethods,
  requestPrivacyAuthorization
} = require('../../utils/privacy')
const {
  SHARE_LANDING_CREATE,
  buildShareAppMessage,
  buildShareTimeline,
  showPageShareMenu
} = require('../../utils/share')
const {
  buildBoardRows,
  buildContributionRateText,
  buildMyCellKeyMap,
  decorateActivityTimeState,
  normalizeText
} = require('../../utils/poemPancake')
const {
  RESERVATION_SYNC_INTERVAL,
  RESERVATION_SYNC_ERROR_BACKOFF,
  POST_SUBMIT_SYNC_DELAY,
  shouldAutoSubmitChar,
  getAutoSubmitDelay,
  decorateBoardRowsWithEditor,
  buildDetailViewModel
} = require('./model')
const {
  getPoemPancakeActivityDetail,
  reportPoemPancakeDetailClick,
  reservePoemPancakeCell,
  releasePoemPancakeCellReservation,
  submitPoemPancakeCell
} = require('./service')

Page({
  data: {
    ...buildPrivacyReminderData(),
    loading: true,
    syncing: false,
    submitting: false,
    errorMessage: '',
    activityId: '',
    activity: null,
    cellsMap: {},
    reservedCellMap: {},
    displayBounds: null,
    boardRows: [],
    boardWidthRpx: 840,
    boardHeightRpx: 840,
    myCellKeyList: [],
    myReservedCellKey: '',
    myCharCount: 0,
    totalChars: 0,
    contributionRateText: '0%',
    reserveDurationMs: 1500,
    reserving: false,
    editingCellKey: '',
    editingRowIndex: 0,
    editingColIndex: 0,
    editorContent: '',
    editorPlaceholder: '',
    editorOriginalContent: '',
    editorCanDelete: false,
    editorSelectionStart: 0,
    editorSelectionEnd: 0
  },

  ...privacyReminderMethods,

  onLoad(options = {}) {
    showPageShareMenu()
    this.isPageActive = true
    this.detailRequestInFlight = false
    this.latestDetailRequestId = 0
    this.localMutationVersion = 0
    this.nextReservationSyncAllowedAt = 0
    this.setData({
      activityId: normalizeText(options.activityId)
    })
    this.detailClickReported = false
  },

  onShow() {
    this.isPageActive = true
    this.startClockRefresh()
    requestPrivacyAuthorization().then((granted) => {
      if (!granted) {
        return
      }

      this.maybeReportDetailClick()
      this.loadDetail({
        silent: !!this.data.activity
      })
    })
  },

  onHide() {
    this.isPageActive = false
    this.stopClockRefresh()
    this.stopReservationSync()
    this.releaseCurrentReservation({
      silent: true
    })
  },

  onUnload() {
    this.isPageActive = false
    this.stopClockRefresh()
    this.clearEditorSubmitTimer()
    this.stopReservationSync()
    this.releaseCurrentReservation({
      silent: true
    })
  },

  onPullDownRefresh() {
    this.loadDetail({
      silent: !!this.data.activity,
      stopPullDownRefresh: true
    })
  },

  loadDetail(options = {}) {
    if (!this.data.activityId) {
      this.setData({
        loading: false,
        errorMessage: '缺少活动信息'
      })
      return
    }

    if (this.detailRequestInFlight) {
      return
    }

    const silent = !!options.silent && !!this.data.activity
    const requestId = this.latestDetailRequestId + 1
    const mutationVersionAtRequest = this.localMutationVersion
    this.latestDetailRequestId = requestId
    this.detailRequestInFlight = true

    this.safeSetData({
      loading: !silent,
      syncing: silent,
      errorMessage: ''
    })

    getPoemPancakeActivityDetail(this.data.activityId).then((result) => {
      if (!this.isRequestStillUsable(requestId, mutationVersionAtRequest)) {
        return
      }

      if (!result.success) {
        throw new Error(result.message || '活动详情加载失败')
      }

      this.safeSetData({
        loading: false,
        syncing: false,
        errorMessage: '',
        ...buildDetailViewModel(result, {
          editingCellKey: options.preserveEditor ? this.data.editingCellKey : ''
        })
      }, () => {
        this.startReservationSync()
      })
    }).catch((error) => {
      if (!this.isPageActive || requestId !== this.latestDetailRequestId) {
        return
      }

      console.error('getPoemPancakeActivityDetail error:', error)
      if (options.fromReservationSync) {
        this.nextReservationSyncAllowedAt = Date.now() + RESERVATION_SYNC_ERROR_BACKOFF
        this.stopReservationSync()
      }
      this.safeSetData({
        loading: false,
        syncing: false,
        errorMessage: error.message || '活动详情加载失败'
      })
    }).finally(() => {
      this.detailRequestInFlight = false
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  maybeReportDetailClick() {
    if (this.detailClickReported || !this.data.activityId) {
      return
    }

    reportPoemPancakeDetailClick(this.data.activityId).then(() => {
      this.detailClickReported = true
    }).catch((error) => {
      console.warn('report poem pancake detail click error:', error)
    })
  },

  startClockRefresh() {
    this.stopClockRefresh()
    this.clockTimer = setInterval(() => {
      this.refreshDisplayedTimeState()
    }, 30000)
  },

  startReservationSync() {
    this.stopReservationSync()

    this.reservationSyncTimer = setInterval(() => {
      if (
        !this.data.activity
        || !this.data.activity.canWrite
        || this.data.editingCellKey
        || this.data.submitting
        || this.data.loading
        || this.data.syncing
        || this.data.reserving
        || this.detailRequestInFlight
      ) {
        return
      }

      if (Date.now() < this.nextReservationSyncAllowedAt) {
        return
      }

      this.loadDetail({
        silent: true,
        preserveEditor: false,
        fromReservationSync: true
      })
    }, RESERVATION_SYNC_INTERVAL)
  },

  stopReservationSync() {
    if (this.reservationSyncTimer) {
      clearInterval(this.reservationSyncTimer)
      this.reservationSyncTimer = null
    }
  },

  stopClockRefresh() {
    if (this.clockTimer) {
      clearInterval(this.clockTimer)
      this.clockTimer = null
    }
  },

  refreshDisplayedTimeState() {
    if (!this.data.activity) {
      return
    }

    this.safeSetData({
      activity: decorateActivityTimeState(this.data.activity)
    })
  },

  safeSetData(nextData, callback) {
    if (!this.isPageActive) {
      return
    }

    this.setData(nextData, callback)
  },

  isRequestStillUsable(requestId, mutationVersionAtRequest) {
    return this.isPageActive
      && requestId === this.latestDetailRequestId
      && mutationVersionAtRequest === this.localMutationVersion
  },

  markLocalMutation() {
    this.localMutationVersion += 1
    this.nextReservationSyncAllowedAt = Date.now() + POST_SUBMIT_SYNC_DELAY
  },

  onCellTap(e) {
    const activity = this.data.activity || {}
    const cellKey = e.currentTarget.dataset.key
    const rowIndex = Number(e.currentTarget.dataset.row)
    const colIndex = Number(e.currentTarget.dataset.col)
    const content = normalizeText(e.currentTarget.dataset.content)
    const nickname = normalizeText(e.currentTarget.dataset.nickname)
    const isMine = e.currentTarget.dataset.mine === true || e.currentTarget.dataset.mine === 'true'

    if (!cellKey) {
      return
    }

    if (!activity.canWrite) {
      wx.showToast({
        title: activity.statusText === '未开始' ? '活动还没开始，可先看画板' : '当前活动暂时只能查看',
        icon: 'none'
      })
      return
    }

    if (content && !isMine) {
      wx.showToast({
        title: nickname ? `${nickname} 已经写下这个字位` : '这个位置已经有人写过了',
        icon: 'none'
      })
      return
    }

    this.reserveCellForEditing({
      cellKey,
      rowIndex,
      colIndex,
      content,
      isMine
    })
  },

  reserveCellForEditing({ cellKey, rowIndex, colIndex, content, isMine }) {
    if (!cellKey || this.data.reserving || this.data.submitting) {
      return
    }

    if (this.data.editingCellKey === cellKey) {
      return
    }

    this.safeSetData({
      reserving: true,
      editingCellKey: cellKey,
      editingRowIndex: rowIndex,
      editingColIndex: colIndex,
      editorContent: isMine && content ? content : '',
      editorPlaceholder: isMine && content ? '' : '',
      editorOriginalContent: isMine && content ? content : '',
      editorCanDelete: !!(isMine && content),
      editorSelectionStart: 0,
      editorSelectionEnd: Array.from(normalizeText(isMine && content ? content : '')).length
    }, () => {
      this.refreshBoardRows()
    })

    reservePoemPancakeCell(this.data.activityId, rowIndex, colIndex).then((result) => {
      if (!result.success) {
        if (result.reservedCellMap) {
          this.safeSetData({
            reservedCellMap: result.reservedCellMap,
            myReservedCellKey: normalizeText(result.myReservedCellKey)
          }, () => {
            this.refreshBoardRows()
          })
        }

        throw new Error(result.message || '这个位置暂时不能输入')
      }

      this.safeSetData({
        reserving: false,
        reservedCellMap: result.reservedCellMap || {},
        myReservedCellKey: normalizeText(result.myReservedCellKey),
      }, () => {
        this.refreshBoardRows()
      })
    }).catch((error) => {
      console.error('reservePoemPancakeCell error:', error)
      if (this.data.editingCellKey === cellKey) {
        this.safeSetData({
          reserving: false,
          editingCellKey: '',
          editorContent: '',
          editorPlaceholder: '',
          editorOriginalContent: '',
          editorCanDelete: false,
          editorSelectionStart: 0,
          editorSelectionEnd: 0
        }, () => {
          this.refreshBoardRows()
        })
      } else {
        this.safeSetData({
          reserving: false
        })
      }
      wx.showToast({
        title: error.message || '这个位置正在占位中',
        icon: 'none'
      })
    })
  },

  onEditorInput(e) {
    const nextValue = e.detail.value
    const charList = Array.from(normalizeText(nextValue))

    this.safeSetData({
      editorContent: nextValue,
      editorSelectionStart: charList.length,
      editorSelectionEnd: charList.length
    }, () => {
      if (charList.length === 1 && shouldAutoSubmitChar(charList[0])) {
        this.scheduleEditorSubmit(charList[0], getAutoSubmitDelay(charList[0]))
      } else {
        this.clearEditorSubmitTimer()
      }
    })
  },

  onInlineEditorConfirm(e) {
    this.submitEditorFromValue((e && e.detail && e.detail.value) || this.data.editorContent)
  },

  closeEditor() {
    this.clearEditorSubmitTimer()
    const nextState = {
      editingCellKey: '',
      editorContent: '',
      editorPlaceholder: '',
      editorOriginalContent: '',
      editorCanDelete: false,
      editorSelectionStart: 0,
      editorSelectionEnd: 0
    }

    this.safeSetData(nextState, () => {
      this.refreshBoardRows()
    })
  },

  noop() {},

  clearEditorSubmitTimer() {
    if (this.editorSubmitTimer) {
      clearTimeout(this.editorSubmitTimer)
      this.editorSubmitTimer = null
    }
  },

  scheduleEditorSubmit(content, delay = INLINE_SUBMIT_DELAY) {
    this.clearEditorSubmitTimer()
    this.editorSubmitTimer = setTimeout(() => {
      this.editorSubmitTimer = null
      this.submitEditorFromValue(content)
    }, delay)
  },

  refreshBoardRows() {
    const boardRows = decorateBoardRowsWithEditor(
      buildBoardRows(
        this.data.cellsMap || {},
        this.data.displayBounds || null,
        buildMyCellKeyMap(this.data.myCellKeyList || [])
      ),
      this.data.editingCellKey,
      this.data.reservedCellMap || {}
    )

    this.safeSetData({
      boardRows
    })
  },

  onInlineEditorBlur(e) {
    if (!this.data.submitting) {
      const blurValue = e && e.detail && typeof e.detail.value === 'string'
        ? e.detail.value
        : this.data.editorContent

      this.submitEditorFromValue(blurValue, {
        silentInvalid: true
      })
    }
  },

  releaseCurrentReservation(options = {}) {
    const cellKey = normalizeText(this.data.editingCellKey || this.data.myReservedCellKey)

    if (!cellKey) {
      if (options.keepEditor !== true) {
        this.closeEditor()
      }
      return Promise.resolve()
    }

    const nextReservedCellMap = {
      ...(this.data.reservedCellMap || {})
    }
    delete nextReservedCellMap[cellKey]

    this.safeSetData({
      reservedCellMap: nextReservedCellMap,
      myReservedCellKey: '',
      editingCellKey: '',
      editorContent: '',
      editorPlaceholder: '',
      editorOriginalContent: '',
      editorCanDelete: false,
      editorSelectionStart: 0,
      editorSelectionEnd: 0
    }, () => {
      this.refreshBoardRows()
    })

    return releasePoemPancakeCellReservation(this.data.activityId, cellKey).catch((error) => {
      if (!options.silent) {
        console.warn('releasePoemPancakeCellReservation error:', error)
      }
    })
  },

  applyLocalCellMutation(actionType, content, result = {}) {
    const cellKey = normalizeText(this.data.editingCellKey)

    if (!cellKey) {
      return
    }

    const safeActionType = actionType === 'delete' ? 'delete' : 'upsert'
    const nextContent = normalizeText(content)
    const cellsMap = this.data.cellsMap && typeof this.data.cellsMap === 'object'
      ? { ...this.data.cellsMap }
      : {}
    const existingCell = cellsMap[cellKey] && typeof cellsMap[cellKey] === 'object'
      ? cellsMap[cellKey]
      : null
    const myCellKeyList = Array.isArray(this.data.myCellKeyList)
      ? this.data.myCellKeyList.slice()
      : []
    const reservedCellMap = {
      ...(this.data.reservedCellMap || {})
    }
    const currentMyIndex = myCellKeyList.indexOf(cellKey)
    let totalChars = Number(this.data.totalChars) || 0
    let myCharCount = Number(this.data.myCharCount) || 0

    if (safeActionType === 'delete') {
      if (existingCell) {
        delete cellsMap[cellKey]
        totalChars = Math.max(0, totalChars - 1)
      }

      if (currentMyIndex >= 0) {
        myCellKeyList.splice(currentMyIndex, 1)
        myCharCount = Math.max(0, myCharCount - 1)
      }
    } else {
      if (currentMyIndex === -1) {
        myCellKeyList.push(cellKey)
        myCharCount += 1
      }

      if (!existingCell) {
        totalChars += 1
      }

      cellsMap[cellKey] = {
        ...(existingCell || {}),
        content: nextContent,
        updatedAt: new Date()
      }
    }

    delete reservedCellMap[cellKey]

    if (Number.isFinite(Number(result.filledCount))) {
      totalChars = Math.max(0, Number(result.filledCount))
    }

    const nextActivity = this.data.activity && typeof this.data.activity === 'object'
      ? {
        ...this.data.activity,
        filledCount: totalChars,
        userCount: Number.isFinite(Number(result.userCount))
          ? Math.max(0, Number(result.userCount))
          : Number(this.data.activity.userCount) || 0
      }
      : this.data.activity

    const boardRows = decorateBoardRowsWithEditor(
      buildBoardRows(cellsMap, this.data.displayBounds || null, buildMyCellKeyMap(myCellKeyList)),
      '',
      reservedCellMap
    )

    this.markLocalMutation()

    this.safeSetData({
      cellsMap,
      reservedCellMap,
      boardRows,
      activity: nextActivity,
      myCellKeyList,
      myReservedCellKey: '',
      myCharCount,
      totalChars,
      contributionRateText: buildContributionRateText(myCharCount, totalChars),
      editingCellKey: '',
      editorContent: '',
      editorPlaceholder: '',
      editorOriginalContent: '',
      editorCanDelete: false,
      editorSelectionStart: 0,
      editorSelectionEnd: 0
    })
  },

  buildEditorSubmitPayload(value) {
    const normalizedValue = normalizeText(value)
    const originalContent = normalizeText(this.data.editorOriginalContent)
    const charList = Array.from(normalizedValue)

    if (!normalizedValue && this.data.editorCanDelete && originalContent) {
      return {
        actionType: 'delete',
        content: ''
      }
    }

    if (normalizedValue === originalContent) {
      return {
        actionType: 'noop',
        content: originalContent
      }
    }

    if (charList.length === 1) {
      return {
        actionType: 'upsert',
        content: charList[0]
      }
    }

    return {
      actionType: 'invalid',
      content: normalizedValue
    }
  },

  submitEditorFromValue(value, options = {}) {
    const payload = this.buildEditorSubmitPayload(value)

    if (payload.actionType === 'noop') {
      this.releaseCurrentReservation()
      return
    }

    if (payload.actionType === 'delete') {
      this.submitEditorMutation(payload)
      return
    }

    if (payload.actionType === 'upsert') {
      this.submitEditorMutation(payload)
      return
    }

    if (!options.silentInvalid) {
      wx.showToast({
        title: '每次只能填写 1 个字',
        icon: 'none'
      })
    }

    this.releaseCurrentReservation()
  },

  submitEditorMutation({ actionType = 'upsert', content = '' } = {}) {
    this.clearEditorSubmitTimer()

    if (this.data.submitting) {
      return
    }

    const safeActionType = actionType === 'delete' ? 'delete' : 'upsert'
    const normalizedContent = normalizeText(content)
    const charList = Array.from(normalizedContent)

    if (safeActionType !== 'delete' && charList.length !== 1) {
      return
    }

    this.setData({
      submitting: true
    })

    submitPoemPancakeCell(
      this.data.activityId,
      this.data.editingRowIndex,
      this.data.editingColIndex,
      safeActionType === 'delete' ? '' : charList[0],
      safeActionType
    ).then((result) => {
      if (!result.success) {
        throw new Error(result.message || '提交失败')
      }

      this.applyLocalCellMutation(safeActionType, safeActionType === 'delete' ? '' : charList[0], result)
      wx.showToast({
        title: safeActionType === 'delete' ? '这个字已经删除了' : '这个字已经落下了',
        icon: 'success'
      })
    }).catch((error) => {
      console.error('submitPoemPancakeCell error:', error)
      const message = error.message || '提交失败'

      if (message.indexOf('占位已超时') !== -1) {
        return this.retrySubmitAfterReserve({
          actionType: safeActionType,
          content: safeActionType === 'delete' ? '' : charList[0]
        })
      }

      wx.showToast({
        title: message,
        icon: 'none'
      })
      this.loadDetail({
        silent: true,
        preserveEditor: true
      })
    }).finally(() => {
      this.safeSetData({
        submitting: false
      })
    })
  },

  retrySubmitAfterReserve({ actionType = 'upsert', content = '' } = {}) {
    const cellKey = normalizeText(this.data.editingCellKey)

    if (!cellKey) {
      this.safeSetData({
        submitting: false
      })
      return Promise.resolve()
    }

    return reservePoemPancakeCell(
      this.data.activityId,
      this.data.editingRowIndex,
      this.data.editingColIndex
    ).then((result) => {
      if (!result.success) {
        throw new Error(result.message || '重新占位失败')
      }

      this.safeSetData({
        reservedCellMap: result.reservedCellMap || {},
        myReservedCellKey: normalizeText(result.myReservedCellKey)
      }, () => {
        this.refreshBoardRows()
      })

      return submitPoemPancakeCell(
        this.data.activityId,
        this.data.editingRowIndex,
        this.data.editingColIndex,
        content,
        actionType
      )
    }).then((result) => {
      if (!result.success) {
        throw new Error(result.message || '提交失败')
      }

      this.applyLocalCellMutation(actionType, content, result)
      wx.showToast({
        title: actionType === 'delete' ? '这个字已经删除了' : '这个字已经落下了',
        icon: 'success'
      })
    }).catch((error) => {
      console.error('retry submitPoemPancakeCell error:', error)
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      })
      this.loadDetail({
        silent: true,
        preserveEditor: true
      })
    }).finally(() => {
      this.safeSetData({
        submitting: false
      })
    })
  },

  goPoster() {
    if (!this.data.activityId) {
      return
    }

    wx.navigateTo({
      url: `/pages/poem-pancake-poster/poem-pancake-poster?activityId=${this.data.activityId}`
    })
  },

  getShareTitle() {
    const activity = this.data.activity || {}
    const title = normalizeText(activity.title) || '诗词摊煎饼'

    return `${title}｜来一起把这张诗词画板摊大一点`
  },

  onShareAppMessage() {
    return buildShareAppMessage({
      title: this.getShareTitle(),
      path: `/pages/poem-pancake-detail/poem-pancake-detail?activityId=${this.data.activityId}`,
      shareLanding: SHARE_LANDING_CREATE
    })
  },

  onShareTimeline() {
    return buildShareTimeline({
      title: this.getShareTitle(),
      shareLanding: SHARE_LANDING_CREATE
    })
  }
})
