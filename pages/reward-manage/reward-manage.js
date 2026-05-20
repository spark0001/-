const FILTER_OPTIONS = [
  { label: '全部成员', value: 'all' },
  { label: '规则达标', value: 'achieved' },
  { label: '未发奖励', value: 'pendingReward' },
  { label: '已发奖励', value: 'rewarded' },
  { label: '已放弃', value: 'waived' }
]

const EFFECT_MODE_OPTIONS = [
  { label: '立即生效', value: 'immediate' },
  { label: '预约时间生效', value: 'scheduled' }
]

const THRESHOLD_TYPE_OPTIONS = [
  { label: '累计', value: 'accumulated' },
  { label: '连续', value: 'consecutive' }
]

function normalizeText(value) {
  return String(value || '').trim()
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function buildDefaultRuleSummary() {
  return {
    ruleId: '',
    isActive: false,
    effectMode: 'immediate',
    effectAtDate: '',
    effectAtTime: '',
    effectText: '',
    activityId: '',
    activityTitle: '',
    requireOfflineAttendance: true,
    thresholdType: 'accumulated',
    thresholdTypeText: '累计',
    thresholdUnit: 'days',
    thresholdUnitText: '天数',
    thresholdValue: 10
  }
}

function buildDefaultRuleForm() {
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + 1)

  return {
    effectMode: 'immediate',
    effectAtDate: `${nextDate.getFullYear()}-${padNumber(nextDate.getMonth() + 1)}-${padNumber(nextDate.getDate())}`,
    effectAtTime: '09:00',
    activityId: '',
    activityIndex: 0,
    requireOfflineAttendance: true,
    thresholdType: 'accumulated',
    thresholdUnit: 'days',
    thresholdValue: '10'
  }
}

function buildDefaultStatsActivity() {
  return {
    activityId: '',
    title: '',
    timeText: '',
    startDayKey: '',
    endDayKey: '',
    isCurrent: false
  }
}

function buildReadingIncentiveActivityOptions(list) {
  return [{
    _id: '',
    title: '请选择统计活动'
  }].concat(list || [])
}

function buildRuleActivityOptions(list) {
  return [{
    _id: '',
    title: '请选择关联活动'
  }].concat(list || [])
}

function getReadingIncentiveActivityIndex(optionList, activityId) {
  const safeActivityId = String(activityId || '').trim()
  const targetIndex = (optionList || []).findIndex((item) => {
    return String(item && item._id || '').trim() === safeActivityId
  })

  return targetIndex > -1 ? targetIndex : 0
}

function buildReadingRuleState(result = {}) {
  const currentRule = result.readingIncentiveRuleCurrent || buildDefaultRuleSummary()
  const scheduledRule = result.readingIncentiveRuleScheduled || buildDefaultRuleSummary()
  const sourceRule = scheduledRule.ruleId ? scheduledRule : currentRule
  const ruleActivityOptions = buildRuleActivityOptions(result.readingIncentiveRuleActivityList || [])
  const defaultRuleForm = buildDefaultRuleForm()

  return {
    currentReadingIncentiveRule: currentRule,
    scheduledReadingIncentiveRule: scheduledRule,
    ruleActivityOptions,
    readingRuleForm: {
      effectMode: sourceRule.effectMode || defaultRuleForm.effectMode,
      effectAtDate: sourceRule.effectAtDate || defaultRuleForm.effectAtDate,
      effectAtTime: sourceRule.effectAtTime || defaultRuleForm.effectAtTime,
      activityId: sourceRule.activityId || '',
      activityIndex: getReadingIncentiveActivityIndex(ruleActivityOptions, sourceRule.activityId),
      requireOfflineAttendance: sourceRule.requireOfflineAttendance !== false,
      thresholdType: sourceRule.thresholdType || defaultRuleForm.thresholdType,
      thresholdUnit: 'days',
      thresholdValue: String(sourceRule.thresholdValue || defaultRuleForm.thresholdValue)
    }
  }
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    savingReadingRule: false,
    markingOpenid: '',
    monthLabel: '',
    targetCount: 0,
    canPublishRewardActivity: false,
    effectModeOptions: EFFECT_MODE_OPTIONS,
    thresholdTypeOptions: THRESHOLD_TYPE_OPTIONS,
    readingIncentiveActivityList: [],
    readingIncentiveActivityOptions: buildReadingIncentiveActivityOptions([]),
    selectedIncentiveActivityId: '',
    selectedIncentiveActivityIndex: 0,
    statsActivity: buildDefaultStatsActivity(),
    currentReadingIncentiveRule: buildDefaultRuleSummary(),
    scheduledReadingIncentiveRule: buildDefaultRuleSummary(),
    ruleActivityOptions: buildRuleActivityOptions([]),
    readingRuleForm: buildDefaultRuleForm(),
    rewardActivityList: [],
    filterOptions: FILTER_OPTIONS,
    filterValue: 'all',
    fullMemberList: [],
    memberList: []
  },

  onShow() {
    this.loadRewardData()
  },

  onPullDownRefresh() {
    this.loadRewardData({
      stopPullDownRefresh: true
    })
  },

  loadRewardData(options = {}) {
    const hasExplicitIncentiveActivityId = Object.prototype.hasOwnProperty.call(options, 'incentiveActivityId')
    const incentiveActivityId = hasExplicitIncentiveActivityId
      ? options.incentiveActivityId
      : this.data.selectedIncentiveActivityId

    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getRewardManageData',
      data: {
        incentiveActivityId,
        readonlyStats: true
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.error || result.message || '奖励数据加载失败')
      }

      const fullMemberList = result.memberList || []
      const readingIncentiveActivityList = result.readingIncentiveActivityList || []
      const readingIncentiveActivityOptions = buildReadingIncentiveActivityOptions(readingIncentiveActivityList)
      const statsActivity = result.selectedReadingIncentiveActivity || buildDefaultStatsActivity()
      const readingRuleState = buildReadingRuleState(result)
      const parsedTargetCount = Number(result.targetCount)

      this.setData({
        loading: false,
        monthLabel: result.rewardLabel || '',
        targetCount: Number.isFinite(parsedTargetCount) && parsedTargetCount > 0 ? parsedTargetCount : 0,
        canPublishRewardActivity: !!(result.permissionInfo && result.permissionInfo.activityPermission),
        readingIncentiveActivityList,
        readingIncentiveActivityOptions,
        selectedIncentiveActivityId: statsActivity.activityId || '',
        selectedIncentiveActivityIndex: getReadingIncentiveActivityIndex(readingIncentiveActivityOptions, statsActivity.activityId),
        statsActivity,
        currentReadingIncentiveRule: readingRuleState.currentReadingIncentiveRule,
        scheduledReadingIncentiveRule: readingRuleState.scheduledReadingIncentiveRule,
        ruleActivityOptions: readingRuleState.ruleActivityOptions,
        readingRuleForm: readingRuleState.readingRuleForm,
        rewardActivityList: result.rewardActivityList || [],
        fullMemberList
      })

      this.applyFilter(this.data.filterValue, fullMemberList)
    }).catch((error) => {
      console.error('getRewardManageData error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '奖励数据加载失败',
        savingReadingRule: false,
        monthLabel: '',
        targetCount: 0,
        canPublishRewardActivity: false,
        effectModeOptions: EFFECT_MODE_OPTIONS,
        thresholdTypeOptions: THRESHOLD_TYPE_OPTIONS,
        readingIncentiveActivityList: [],
        readingIncentiveActivityOptions: buildReadingIncentiveActivityOptions([]),
        selectedIncentiveActivityId: '',
        selectedIncentiveActivityIndex: 0,
        statsActivity: buildDefaultStatsActivity(),
        currentReadingIncentiveRule: buildDefaultRuleSummary(),
        scheduledReadingIncentiveRule: buildDefaultRuleSummary(),
        ruleActivityOptions: buildRuleActivityOptions([]),
        readingRuleForm: buildDefaultRuleForm(),
        rewardActivityList: [],
        fullMemberList: [],
        memberList: []
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  applyFilter(filterValue = this.data.filterValue, sourceList = this.data.fullMemberList) {
    let memberList = sourceList || []

    if (filterValue === 'achieved') {
      memberList = memberList.filter((item) => item.isAchieved)
    } else if (filterValue === 'pendingReward') {
      memberList = memberList.filter((item) => item.isPendingReward)
    } else if (filterValue === 'rewarded') {
      memberList = memberList.filter((item) => item.isRewarded)
    } else if (filterValue === 'waived') {
      memberList = memberList.filter((item) => item.isWaived)
    }

    this.setData({
      filterValue,
      memberList
    })
  },

  onFilterTap(e) {
    const filterValue = e.currentTarget.dataset.value

    if (!filterValue || filterValue === this.data.filterValue) {
      return
    }

    this.applyFilter(filterValue)
  },

  onReadingIncentiveActivityChange(e) {
    const nextIndex = Number(e.detail.value)
    const nextActivity = this.data.readingIncentiveActivityOptions[nextIndex] || null

    if (!nextActivity || !nextActivity._id || nextActivity._id === this.data.selectedIncentiveActivityId) {
      return
    }

    this.loadRewardData({
      incentiveActivityId: nextActivity._id
    })
  },

  onRetryTap() {
    this.loadRewardData()
  },

  onRuleEffectModeTap(e) {
    const value = normalizeText(e.currentTarget.dataset.value)

    if (!value || value === this.data.readingRuleForm.effectMode) {
      return
    }

    this.setData({
      'readingRuleForm.effectMode': value
    })
  },

  onRuleActivityChange(e) {
    const nextIndex = Number(e.detail.value)
    const nextActivity = this.data.ruleActivityOptions[nextIndex] || null

    this.setData({
      'readingRuleForm.activityIndex': nextIndex,
      'readingRuleForm.activityId': nextActivity ? nextActivity._id || '' : ''
    })
  },

  onRuleAttendanceChange(e) {
    this.setData({
      'readingRuleForm.requireOfflineAttendance': !!e.detail.value
    })
  },

  onRuleThresholdTypeTap(e) {
    const value = normalizeText(e.currentTarget.dataset.value)

    if (!value || value === this.data.readingRuleForm.thresholdType) {
      return
    }

    this.setData({
      'readingRuleForm.thresholdType': value
    })
  },

  onRuleThresholdValueInput(e) {
    this.setData({
      'readingRuleForm.thresholdValue': String(e.detail.value || '').replace(/[^\d]/g, '')
    })
  },

  onRuleEffectDateChange(e) {
    this.setData({
      'readingRuleForm.effectAtDate': e.detail.value || ''
    })
  },

  onRuleEffectTimeChange(e) {
    this.setData({
      'readingRuleForm.effectAtTime': e.detail.value || ''
    })
  },

  onSaveReadingRule() {
    const form = this.data.readingRuleForm || {}
    const activityId = normalizeText(form.activityId)
    const thresholdValue = Number(form.thresholdValue)

    if (this.data.savingReadingRule) {
      return
    }

    if (!activityId) {
      wx.showToast({
        title: '请选择关联活动',
        icon: 'none'
      })
      return
    }

    if (!Number.isInteger(thresholdValue) || thresholdValue <= 0) {
      wx.showToast({
        title: '门槛数值需为正整数',
        icon: 'none'
      })
      return
    }

    if (form.effectMode === 'scheduled' && (!normalizeText(form.effectAtDate) || !normalizeText(form.effectAtTime))) {
      wx.showToast({
        title: '请填写预约生效时间',
        icon: 'none'
      })
      return
    }

    this.setData({
      savingReadingRule: true
    })

    wx.showLoading({
      title: '保存中...'
    })

    wx.cloud.callFunction({
      name: 'saveReadingIncentiveRule',
      data: {
        effectMode: form.effectMode,
        effectAtDate: form.effectAtDate,
        effectAtTime: form.effectAtTime,
        activityId,
        requireOfflineAttendance: form.requireOfflineAttendance !== false,
        thresholdType: form.thresholdType,
        thresholdUnit: 'days',
        thresholdValue
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.error || result.message || '阅读激励规则保存失败')
      }

      wx.showToast({
        title: result.message || '保存成功',
        icon: 'success'
      })

      this.loadRewardData({
        incentiveActivityId: this.data.selectedIncentiveActivityId
      })
    }).catch((error) => {
      console.error('saveReadingIncentiveRule error:', error)
      wx.showToast({
        title: error.message || '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      wx.hideLoading()
      this.setData({
        savingReadingRule: false
      })
    })
  },

  onMarkRewardTap(e) {
    const openid = e.currentTarget.dataset.openid
    const rewardActivityId = e.currentTarget.dataset.activityId || ''
    const rewardActivityTitle = e.currentTarget.dataset.activityTitle || ''

    if (!openid || this.data.markingOpenid) {
      return
    }

    wx.showModal({
      title: '标记已发奖励',
      content: `确认将该成员标记为“已发奖励”吗？标记后会归入“已发奖励”筛选。`,
      success: (res) => {
        if (res.confirm) {
          this.updateRewardStatus(openid, 'rewarded', {
            rewardActivityId,
            rewardActivityTitle
          })
        }
      }
    })
  },

  onCancelRewardTap(e) {
    const openid = e.currentTarget.dataset.openid

    if (!openid || this.data.markingOpenid) {
      return
    }

    wx.showModal({
      title: '取消已发奖励标记',
      content: '确认取消该成员的“已发奖励”标记吗？取消后会回到“未发奖励”状态。',
      success: (res) => {
        if (res.confirm) {
          this.updateRewardStatus(openid, 'pending')
        }
      }
    })
  },

  onMarkWaivedTap(e) {
    const openid = e.currentTarget.dataset.openid

    if (!openid || this.data.markingOpenid) {
      return
    }

    wx.showModal({
      title: '标记放弃',
      content: '确认将该成员标记为放弃本月奖励吗？',
      success: (res) => {
        if (res.confirm) {
          this.updateRewardStatus(openid, 'waived')
        }
      }
    })
  },

  updateRewardStatus(targetOpenid, status, extraData = {}) {
    this.setData({
      markingOpenid: targetOpenid
    })

    wx.showLoading({
      title: '保存中...'
    })

    wx.cloud.callFunction({
      name: 'updateRewardStatus',
      data: {
        targetOpenid,
        status,
        rewardActivityId: extraData.rewardActivityId || '',
        rewardActivityTitle: extraData.rewardActivityTitle || ''
      }
    }).then((res) => {
      const result = res.result || {}

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || result.error || '保存失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: result.message || '保存成功',
        icon: 'success'
      })

      this.loadRewardData()
    }).catch((error) => {
      wx.hideLoading()
      console.error('updateRewardStatus error:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        markingOpenid: ''
      })
    })
  },

  goAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin'
    })
  },

  goActivityDetail(e) {
    const activityId = e.currentTarget.dataset.id

    if (!activityId) {
      return
    }

    wx.navigateTo({
      url: `/pages/activity-detail/activity-detail?id=${activityId}`
    })
  }
})
