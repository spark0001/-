Page({
  data: {
    loading: false,
    activityList: [],
    filteredActivityList: [],
    coverErrorMap: {},
    statusFilter: 'all',
    statusFilterOptions: [
      { label: '全部', value: 'all' },
      { label: '报名中', value: 'active' },
      { label: '已过期', value: 'expired' }
    ]
  },

  normalizeText(value) {
    return String(value || '').trim()
  },

  getTemplateNumber(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  },

  canUseActivityCover(url) {
    const safeUrl = this.normalizeText(url)

    if (!safeUrl) {
      return false
    }

    if (/^https?:\/\//i.test(safeUrl) && /[?&]sign=/i.test(safeUrl)) {
      return false
    }

    return true
  },

  getTemplate1ThumbMaxOffset(scalePercent) {
    const safeScalePercent = Math.min(240, Math.max(100, Number(scalePercent) || 100))
    return 200 * (safeScalePercent / 100 - 1) / 2
  },

  getTemplate2TextFieldOption(fieldKey) {
    const optionMap = {
      title: {
        defaultText: '活动标题',
        defaultY: 74,
        defaultFontSize: 28
      },
      time: {
        defaultText: '时间待定',
        defaultY: 122,
        defaultFontSize: 22
      },
      location: {
        defaultText: '地点待定',
        defaultY: 156,
        defaultFontSize: 22
      },
      theme: {
        defaultText: '主题待定',
        defaultY: 190,
        defaultFontSize: 22
      }
    }

    return optionMap[fieldKey] || optionMap.title
  },

  buildTemplate2TextField(fieldKey, textGroup, textWidth, textValue) {
    const option = this.getTemplate2TextFieldOption(fieldKey)
    const fieldConfig = textGroup && textGroup[fieldKey] && typeof textGroup[fieldKey] === 'object'
      ? textGroup[fieldKey]
      : {}
    const visibleFieldName = `show${fieldKey.charAt(0).toUpperCase()}${fieldKey.slice(1)}`
    const visible = typeof fieldConfig.visible === 'boolean'
      ? fieldConfig.visible
      : (typeof textGroup[visibleFieldName] === 'boolean' ? textGroup[visibleFieldName] : true)
    const x = Math.max(0, this.getTemplateNumber(fieldConfig.x, 24))
    const y = Math.max(0, this.getTemplateNumber(fieldConfig.y, option.defaultY))
    const fontSize = Math.max(18, this.getTemplateNumber(fieldConfig.fontSize, option.defaultFontSize))
    const color = fieldConfig.color || textGroup.color || '#222222'

    return {
      fieldKey,
      text: textValue || option.defaultText,
      visible,
      style: [
        `left:${x}rpx`,
        `top:${y}rpx`,
        `width:${textWidth}rpx`,
        `font-size:${fontSize}rpx`,
        `color:${color}`,
        `font-weight:${fieldKey === 'title' ? 700 : 500}`
      ].join(';')
    }
  },

  buildTemplate1Data(item) {
    const displayConfig = item && item.displayConfig && typeof item.displayConfig === 'object'
      ? item.displayConfig
      : {}
    const templateData = displayConfig.templateData && typeof displayConfig.templateData === 'object'
      ? displayConfig.templateData
      : {}
    const thumbElement = templateData.thumbElement && typeof templateData.thumbElement === 'object'
      ? templateData.thumbElement
      : {}
    const scalePercent = Math.min(240, Math.max(100, this.getTemplateNumber(thumbElement.scalePercent, 100)))
    const maxOffset = this.getTemplate1ThumbMaxOffset(scalePercent)
    const thumbX = Math.min(maxOffset, Math.max(-maxOffset, this.getTemplateNumber(thumbElement.x, 0)))
    const thumbY = Math.min(maxOffset, Math.max(-maxOffset, this.getTemplateNumber(thumbElement.y, 0)))

    return {
      imageStyle: [
        `transform: translate(${thumbX}rpx, ${thumbY}rpx) scale(${scalePercent / 100})`,
        'transform-origin:center center;'
      ].join(';')
    }
  },

  buildTemplateShapeStyle(shape) {
    const x = this.getTemplateNumber(shape && shape.x, 20)
    const y = this.getTemplateNumber(shape && shape.y, 20)
    const width = Math.max(20, this.getTemplateNumber(shape && shape.width, 80))
    const height = Math.max(20, this.getTemplateNumber(shape && shape.height, 80))
    const color = (shape && shape.color) || '#4D76FF'
    const opacity = Math.min(100, Math.max(0, this.getTemplateNumber(shape && shape.opacity, 100))) / 100
    const shapeType = shape && shape.shapeType ? shape.shapeType : 'rect'

    if (shapeType === 'triangle') {
      return {
        shapeKey: shape && shape.shapeId ? shape.shapeId : `${shapeType}-${x}-${y}`,
        shapeClass: 'triangle',
        shapeText: '',
        style: [
          `left:${x}rpx`,
          `top:${y}rpx`,
          'width:0',
          'height:0',
          `opacity:${opacity}`,
          `border-left:${width / 2}rpx solid transparent`,
          `border-right:${width / 2}rpx solid transparent`,
          `border-bottom:${height}rpx solid ${color}`
        ].join(';')
      }
    }

    if (shapeType === 'star') {
      const fontSize = Math.max(24, Math.min(width, height))

      return {
        shapeKey: shape && shape.shapeId ? shape.shapeId : `${shapeType}-${x}-${y}`,
        shapeClass: 'star',
        shapeText: '★',
        style: [
          `left:${x}rpx`,
          `top:${y}rpx`,
          `width:${width}rpx`,
          `height:${height}rpx`,
          `color:${color}`,
          `opacity:${opacity}`,
          `font-size:${fontSize}rpx`
        ].join(';')
      }
    }

    return {
      shapeKey: shape && shape.shapeId ? shape.shapeId : `${shapeType}-${x}-${y}`,
      shapeClass: shapeType === 'circle' ? 'circle' : 'rect',
      shapeText: '',
      style: [
        `left:${x}rpx`,
        `top:${y}rpx`,
        `width:${width}rpx`,
        `height:${height}rpx`,
        `background:${color}`,
        `opacity:${opacity}`
      ].join(';')
    }
  },

  buildTemplate2Data(item) {
    const displayConfig = item && item.displayConfig && typeof item.displayConfig === 'object'
      ? item.displayConfig
      : {}
    const templateData = displayConfig.templateData && typeof displayConfig.templateData === 'object'
      ? displayConfig.templateData
      : {}
    const safeShapes = Array.isArray(templateData.shapes) ? templateData.shapes : []
    const backgroundColor = templateData.backgroundColor || '#f5f7fc'
    const imageElement = templateData.imageElement && typeof templateData.imageElement === 'object'
      ? templateData.imageElement
      : (templateData.image && typeof templateData.image === 'object' ? templateData.image : {})
    const textGroup = templateData.textGroup && typeof templateData.textGroup === 'object'
      ? templateData.textGroup
      : {}
    const imageUrl = imageElement.url || imageElement.imageUrl || ''
    const imageX = this.getTemplateNumber(imageElement.x, 372)
    const imageY = this.getTemplateNumber(imageElement.y, 62)
    const imageWidth = Math.max(40, this.getTemplateNumber(imageElement.width, 150))
    const imageHeight = Math.max(40, this.getTemplateNumber(imageElement.height, 150))
    const textWidth = Math.max(120, this.getTemplateNumber(textGroup.width, 280))
    const textFields = [
      this.buildTemplate2TextField('title', textGroup, textWidth, item.title || '活动标题'),
      this.buildTemplate2TextField('time', textGroup, textWidth, item.timeText || '时间待定'),
      this.buildTemplate2TextField('location', textGroup, textWidth, item.location || '地点待定'),
      this.buildTemplate2TextField('theme', textGroup, textWidth, item.theme || '主题待定')
    ]

    return {
      stageStyle: `background:${backgroundColor};`,
      shapes: safeShapes.map((shape) => this.buildTemplateShapeStyle(shape)),
      imageUrl,
      hasImage: !!imageUrl,
      imageStyle: [
        `left:${imageX}rpx`,
        `top:${imageY}rpx`,
        `width:${imageWidth}rpx`,
        `height:${imageHeight}rpx`
      ].join(';'),
      textFields
    }
  },

  buildTemplate3Data(item) {
    const displayConfig = item && item.displayConfig && typeof item.displayConfig === 'object'
      ? item.displayConfig
      : {}
    const templateData = displayConfig.templateData && typeof displayConfig.templateData === 'object'
      ? displayConfig.templateData
      : {}
    const imageElement = templateData.imageElement && typeof templateData.imageElement === 'object'
      ? templateData.imageElement
      : (templateData.image && typeof templateData.image === 'object' ? templateData.image : {})
    const imageUrl = imageElement.url || imageElement.imageUrl || ''

    return {
      imageUrl,
      hasImage: !!imageUrl
    }
  },

  buildActivityStatusMeta(item) {
    if (item.isScheduled) {
      return {
        text: '预约中',
        className: 'scheduled',
        filterKey: 'scheduled'
      }
    }

    if ((Number(item.endSortTime) || 0) && Number(item.endSortTime) < Date.now()) {
      return {
        text: '已过期',
        className: 'expired',
        filterKey: 'expired'
      }
    }

    return {
      text: '报名中',
      className: 'active',
      filterKey: 'active'
    }
  },

  buildActivityListData(list) {
    return (list || []).map((item) => {
      const displayConfig = item && item.displayConfig && typeof item.displayConfig === 'object'
        ? item.displayConfig
        : {}
      const rawTemplateType = item && item.templateType
        ? item.templateType
        : displayConfig.templateType
      let templateType = 'template1'

      if (rawTemplateType === 'template2') {
        templateType = 'template2'
      } else if (rawTemplateType === 'template3') {
        templateType = 'template3'
      }

      const statusMeta = this.buildActivityStatusMeta(item)

      return {
        ...item,
        templateType,
        hasCover: this.canUseActivityCover(item.coverUrl),
        statusTagText: statusMeta.text,
        statusTagClass: statusMeta.className,
        statusFilterKey: statusMeta.filterKey,
        template1Data: this.buildTemplate1Data(item),
        template2Data: this.buildTemplate2Data(item),
        template3Data: this.buildTemplate3Data(item)
      }
    })
  },

  applyStatusFilter() {
    const statusFilter = this.data.statusFilter
    const activityList = this.data.activityList || []

    this.setData({
      filteredActivityList: activityList.filter((item) => {
        if (statusFilter === 'all') {
          return true
        }

        return item && item.statusFilterKey === statusFilter
      })
    })
  },

  onLoad() {
    this.getActivityList()
  },

  onPullDownRefresh() {
    this.getActivityList().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  getActivityList() {
    this.setData({
      loading: true
    })

    return wx.cloud.callFunction({
      name: 'getActivityList',
      data: {
        limit: 100,
        includePast: true
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '活动列表加载失败')
      }

      this.setData({
        activityList: this.buildActivityListData(result.list || []),
        coverErrorMap: {}
      }, () => {
        this.applyStatusFilter()
      })
    }).catch((error) => {
      console.error('getActivityList error:', error)
      wx.showToast({
        title: error.message || '活动列表加载失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        loading: false
      })
    })
  },

  onStatusFilterChange(e) {
    const value = this.normalizeText(e.currentTarget.dataset.value)

    if (!value || value === this.data.statusFilter) {
      return
    }

    this.setData({
      statusFilter: value
    }, () => {
      this.applyStatusFilter()
    })
  },

  onCoverError(e) {
    const activityId = e.currentTarget.dataset.id

    if (!activityId) {
      return
    }

    this.setData({
      [`coverErrorMap.${activityId}`]: true
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
