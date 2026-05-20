const ROLE_OPTIONS = [
  { label: '正式成员', value: 'member' },
  { label: '管理员', value: 'admin' }
]

const FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '成员', value: 'member' },
  { label: '管理员', value: 'admin' }
]

const INITIAL_FILTER_STATS = {
  all: 0,
  member: 0,
  admin: 0
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDate(timestamp) {
  if (!timestamp) {
    return '暂无'
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return '暂无'
  }

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
}

function getRoleIndex(role) {
  const index = ROLE_OPTIONS.findIndex((item) => item.value === role)
  return index === -1 ? 0 : index
}

function maskOpenid(openid) {
  const safeValue = String(openid || '')

  if (safeValue.length <= 10) {
    return safeValue || '未知用户'
  }

  return `${safeValue.slice(0, 6)}...${safeValue.slice(-4)}`
}

function normalizeKeyword(value) {
  return String(value || '').trim().toLowerCase()
}

function getFilterLabel(filterValue) {
  const target = FILTER_OPTIONS.find((item) => item.value === filterValue)
  return target ? target.label : '用户'
}

function getUserFilterType(user) {
  return user && (user.superAdmin || user.role === 'admin') ? 'admin' : 'member'
}

function buildFilterStats(userList) {
  return (userList || []).reduce((stats, item) => {
    const type = getUserFilterType(item)
    return {
      ...stats,
      all: stats.all + 1,
      [type]: stats[type] + 1
    }
  }, { ...INITIAL_FILTER_STATS })
}

function buildFilterOptions(stats) {
  const safeStats = stats || INITIAL_FILTER_STATS

  return FILTER_OPTIONS.map((item) => ({
    ...item,
    count: safeStats[item.value] || 0
  }))
}

function matchesSearchKeyword(user, keyword) {
  const safeKeyword = normalizeKeyword(keyword)

  if (!safeKeyword) {
    return true
  }

  const searchFields = [
    user.displayName,
    user.nickName,
    user.applyName,
    user.openid,
    user.openidText
  ]

  return searchFields.some((field) => {
    return String(field || '').toLowerCase().includes(safeKeyword)
  })
}

function getEmptyStateText(activeFilter, keyword) {
  const safeKeyword = String(keyword || '').trim()

  if (!safeKeyword) {
    return '当前筛选下没有可管理的用户。'
  }

  const targetLabel = activeFilter === 'all' ? '用户' : getFilterLabel(activeFilter)

  return `没有找到匹配“${safeKeyword}”的${targetLabel}。`
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    savingOpenid: '',
    activeFilter: 'all',
    searchKeyword: '',
    filterStats: { ...INITIAL_FILTER_STATS },
    filterOptions: buildFilterOptions(INITIAL_FILTER_STATS),
    roleOptions: ROLE_OPTIONS.map((item) => item.label),
    userList: [],
    displayList: [],
    emptyStateText: '当前筛选下没有可管理的用户。'
  },

  onShow() {
    this.loadUserList()
  },

  onPullDownRefresh() {
    this.loadUserList({
      stopPullDownRefresh: true
    })
  },

  loadUserList(options = {}) {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getUserPermissionList'
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '获取用户列表失败')
      }

      this.setData({
        loading: false,
        userList: (result.list || []).map((item) => {
          return {
            ...item,
            displayName: item.nickName || item.applyName || '未命名用户',
            openidText: maskOpenid(item.openid),
            createdAtText: formatDate(item.createdAt),
            roleIndex: getRoleIndex(item.role)
          }
        })
      }, () => {
        this.syncDisplayList()
      })
    }).catch((error) => {
      console.error('getUserPermissionList error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '当前账号无法查看权限管理'
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onRoleChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const roleIndex = Number(e.detail.value)
    const roleOption = ROLE_OPTIONS[roleIndex]

    if (!roleOption || Number.isNaN(index)) {
      return
    }

    this.setData({
      [`userList[${index}].role`]: roleOption.value,
      [`userList[${index}].roleIndex`]: roleIndex
    }, () => {
      this.syncUserRoleByPermissions(index)
      this.syncDisplayList()
    })
  },

  onSwitchChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field

    if (!field || Number.isNaN(index)) {
      return
    }

    const nextValue = !!e.detail.value

    this.setData({
      [`userList[${index}].${field}`]: nextValue
    }, () => {
      this.syncUserRoleByPermissions(index)
      this.syncDisplayList()
    })
  },

  syncUserRoleByPermissions(index) {
    const user = this.data.userList[index]

    if (!user) {
      return
    }

    const hasAnyPermission = !!user.superAdmin
      || !!user.applicationReviewPermission
      || !!user.dataPermission
      || !!user.activityPermission
      || !!user.rewardPermission
      || !!user.bookRecommendationPermission
      || !!user.posterManagePermission

    if (!hasAnyPermission) {
      return
    }

    const roleIndex = getRoleIndex('admin')

    this.setData({
      [`userList[${index}].role`]: 'admin',
      [`userList[${index}].roleIndex`]: roleIndex
    })
  },

  syncDisplayList() {
    const activeFilter = this.data.activeFilter
    const searchKeyword = this.data.searchKeyword
    const filterStats = buildFilterStats(this.data.userList)
    const displayList = (this.data.userList || [])
      .map((item, sourceIndex) => ({
        ...item,
        sourceIndex
      }))
      .filter((item) => {
        if (activeFilter === 'member') {
          return !item.superAdmin && item.role === 'member'
        }

        if (activeFilter === 'admin') {
          return item.superAdmin || item.role === 'admin'
        }

        return true
      })
      .filter((item) => matchesSearchKeyword(item, searchKeyword))

    this.setData({
      filterStats,
      filterOptions: buildFilterOptions(filterStats),
      displayList,
      emptyStateText: getEmptyStateText(activeFilter, searchKeyword)
    })
  },

  onFilterChange(e) {
    const filterValue = e.currentTarget.dataset.filter

    if (!filterValue || filterValue === this.data.activeFilter) {
      return
    }

    this.setData({
      activeFilter: filterValue
    }, () => {
      this.syncDisplayList()
    })
  },

  onSearchInput(e) {
    this.setData({
      searchKeyword: String((e.detail || {}).value || '')
    }, () => {
      this.syncDisplayList()
    })
  },

  onSearchClear() {
    this.setData({
      searchKeyword: ''
    }, () => {
      this.syncDisplayList()
    })
  },

  onSaveTap(e) {
    const index = Number(e.currentTarget.dataset.index)

    if (Number.isNaN(index)) {
      return
    }

    const user = this.data.userList[index]

    if (!user || this.data.savingOpenid) {
      return
    }

    this.setData({
      savingOpenid: user.openid
    })

    wx.showLoading({
      title: '保存中...'
    })

    wx.cloud.callFunction({
      name: 'updateUserPermissions',
      data: {
        targetOpenid: user.openid,
        role: user.role,
        superAdmin: !!user.superAdmin,
        applicationReviewPermission: !!user.applicationReviewPermission,
        dataPermission: !!user.dataPermission,
        activityPermission: !!user.activityPermission,
        rewardPermission: !!user.rewardPermission,
        bookRecommendationPermission: !!user.bookRecommendationPermission,
        posterManagePermission: !!user.posterManagePermission
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
        title: '权限已更新',
        icon: 'success'
      })

      this.loadUserList()
    }).catch((error) => {
      wx.hideLoading()
      console.error('updateUserPermissions error:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        savingOpenid: ''
      })
    })
  }
})
