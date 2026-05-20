const POSTER_CANVAS_ID = 'poemPancakePosterCanvas'
const DEFAULT_CANVAS_WIDTH = 1080
const DEFAULT_CANVAS_HEIGHT = 1680
const MIN_POSTER_CANVAS_SIZE = 120

function normalizeText(value) {
  return String(value == null ? '' : value).trim()
}

function toNumber(value, fallback) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getCanvasPixelRatio() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      const windowInfo = wx.getWindowInfo()
      const pixelRatio = toNumber(windowInfo && windowInfo.pixelRatio, 1)

      if (pixelRatio > 0) {
        return pixelRatio
      }
    }
  } catch (error) {
    console.warn('getWindowInfo pixelRatio failed:', error)
  }

  if (typeof wx.getSystemInfoSync === 'function') {
    const systemInfo = wx.getSystemInfoSync()
    return toNumber(systemInfo && systemInfo.pixelRatio, 1)
  }

  return 1
}

function estimateCharWidth(char, fontSize) {
  if (/[A-Z0-9]/.test(char)) {
    return fontSize * 0.62
  }

  if (/[a-z]/.test(char)) {
    return fontSize * 0.56
  }

  if (/\s/.test(char)) {
    return fontSize * 0.32
  }

  return fontSize * 0.94
}

function truncateLine(line, maxWidth, fontSize) {
  const ellipsis = '...'
  const ellipsisWidth = ellipsis.split('').reduce((sum, char) => sum + estimateCharWidth(char, fontSize), 0)
  let current = ''
  let width = 0

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const charWidth = estimateCharWidth(char, fontSize)

    if (width + charWidth + ellipsisWidth > maxWidth) {
      return `${current}${ellipsis}`
    }

    current += char
    width += charWidth
  }

  return line
}

function wrapText(text, maxWidth, fontSize, maxLines) {
  const safeText = normalizeText(text)

  if (!safeText) {
    return []
  }

  const lines = []
  let currentLine = ''
  let currentWidth = 0

  for (let index = 0; index < safeText.length; index += 1) {
    const char = safeText[index]

    if (char === '\n') {
      if (currentLine) {
        lines.push(currentLine)
      }
      currentLine = ''
      currentWidth = 0
      continue
    }

    const charWidth = estimateCharWidth(char, fontSize)

    if (currentLine && currentWidth + charWidth > maxWidth) {
      lines.push(currentLine)
      currentLine = char
      currentWidth = charWidth
    } else {
      currentLine += char
      currentWidth += charWidth
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  if (lines.length <= maxLines) {
    return lines
  }

  const visibleLines = lines.slice(0, maxLines)
  visibleLines[maxLines - 1] = truncateLine(visibleLines[maxLines - 1], maxWidth, fontSize)
  return visibleLines
}

function drawRoundedRect(ctx, x, y, width, height, radius, fillColor) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.arcTo(x + width, y, x + width, y + safeRadius, safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.arcTo(x, y + height, x, y + height - safeRadius, safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.arcTo(x, y, x + safeRadius, y, safeRadius)
  ctx.closePath()
  ctx.setFillStyle(fillColor)
  ctx.fill()
}

function buildRoundedClipPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + safeRadius, y)
  ctx.lineTo(x + width - safeRadius, y)
  ctx.arcTo(x + width, y, x + width, y + safeRadius, safeRadius)
  ctx.lineTo(x + width, y + height - safeRadius)
  ctx.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius)
  ctx.lineTo(x + safeRadius, y + height)
  ctx.arcTo(x, y + height, x, y + height - safeRadius, safeRadius)
  ctx.lineTo(x, y + safeRadius)
  ctx.arcTo(x, y, x + safeRadius, y, safeRadius)
  ctx.closePath()
}

function applyTextStyle(ctx, fontSize, fontWeight, color, textAlign = 'left') {
  ctx.setFillStyle(color)
  ctx.setFontSize(fontSize)
  ctx.setTextAlign(textAlign)
  ctx.setTextBaseline('top')
  ctx.font = `${fontWeight} ${fontSize}px sans-serif`
}

function buildFieldLayout(config = {}) {
  return {
    visible: config.enabled !== false && config.visible !== false,
    x: toNumber(config.x, 0),
    y: toNumber(config.y, 0),
    width: Math.max(40, toNumber(config.width, 320)),
    height: Math.max(40, toNumber(config.height, 60)),
    borderRadius: Math.max(0, toNumber(config.borderRadius, 0)),
    fontSize: Math.max(18, toNumber(config.fontSize, 28)),
    color: normalizeText(config.color) || '#243659',
    fontWeight: normalizeText(config.fontWeight) || '500',
    textAlign: ['left', 'center', 'right'].includes(normalizeText(config.textAlign)) ? normalizeText(config.textAlign) : 'left',
    lineHeight: Math.max(24, toNumber(config.lineHeight, 42)),
    maxLines: Math.max(1, toNumber(config.maxLines, 2))
  }
}

function resolveTextX(layout) {
  if (layout.textAlign === 'center') {
    return layout.x + (layout.width / 2)
  }

  if (layout.textAlign === 'right') {
    return layout.x + layout.width
  }

  return layout.x
}

function drawTextField(ctx, text, config) {
  const layout = buildFieldLayout(config)

  if (!layout.visible) {
    return
  }

  const lines = wrapText(text, layout.width, layout.fontSize, layout.maxLines)

  if (!lines.length) {
    return
  }

  applyTextStyle(ctx, layout.fontSize, layout.fontWeight, layout.color, layout.textAlign)
  const textX = resolveTextX(layout)

  lines.forEach((line, index) => {
    ctx.fillText(line, textX, layout.y + (index * layout.lineHeight))
  })
}

function drawImageField(ctx, imagePath, config) {
  const layout = buildFieldLayout(config)

  if (!layout.visible || !imagePath) {
    return
  }

  ctx.save()
  buildRoundedClipPath(ctx, layout.x, layout.y, layout.width, layout.height, layout.borderRadius)
  ctx.clip()
  ctx.drawImage(imagePath, layout.x, layout.y, layout.width, layout.height)
  ctx.restore()
}

function buildDefaultTemplate() {
  return {
    templateName: '系统默认诗词摊煎饼海报',
    backgroundImageUrl: '',
    backgroundImageFileId: '',
    miniProgramCodeUrl: '',
    miniProgramCodeFileId: '',
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    fieldConfig: {
      themeText: { enabled: true, visible: true, x: '84', y: '138', width: '720', height: '88', fontSize: '58', color: '#17306a', fontWeight: '700', textAlign: 'left', lineHeight: '72', maxLines: '2' },
      activityTimeText: { enabled: true, visible: true, x: '84', y: '246', width: '620', height: '52', fontSize: '26', color: '#6d7c97', fontWeight: '600', textAlign: 'left', lineHeight: '36', maxLines: '2' },
      snapshotImage: { enabled: true, visible: true, x: '84', y: '344', width: '912', height: '912', borderRadius: '40' },
      shareUserAvatar: { enabled: true, visible: true, x: '84', y: '1304', width: '124', height: '124', borderRadius: '62' },
      shareTimeText: { enabled: true, visible: true, x: '236', y: '1318', width: '420', height: '44', fontSize: '24', color: '#7f8ea8', fontWeight: '500', textAlign: 'left', lineHeight: '34', maxLines: '1' },
      contributionText: { enabled: true, visible: true, x: '236', y: '1360', width: '420', height: '56', fontSize: '30', color: '#2f6bff', fontWeight: '700', textAlign: 'left', lineHeight: '40', maxLines: '1' },
      totalCharsText: { enabled: true, visible: true, x: '696', y: '1318', width: '300', height: '44', fontSize: '24', color: '#7f8ea8', fontWeight: '500', textAlign: 'right', lineHeight: '34', maxLines: '1' },
      activityQrCode: { enabled: false, visible: false, x: '820', y: '1368', width: '176', height: '176', borderRadius: '24' },
      customLineText: { enabled: false, visible: false, x: '84', y: '1572', width: '912', height: '48', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '38', maxLines: '1' }
    }
  }
}

function mergeTemplate(template) {
  const defaultTemplate = buildDefaultTemplate()
  const source = template && typeof template === 'object' ? template : {}

  return {
    templateName: normalizeText(source.templateName || defaultTemplate.templateName),
    backgroundImageUrl: normalizeText(source.backgroundImageFileId || source.backgroundImageUrl || defaultTemplate.backgroundImageUrl),
    backgroundImageFileId: normalizeText(source.backgroundImageFileId || source.backgroundImageUrl || defaultTemplate.backgroundImageFileId),
    miniProgramCodeUrl: normalizeText(source.miniProgramCodeFileId || source.miniProgramCodeUrl || defaultTemplate.miniProgramCodeUrl),
    miniProgramCodeFileId: normalizeText(source.miniProgramCodeFileId || source.miniProgramCodeUrl || defaultTemplate.miniProgramCodeFileId),
    customLineText: normalizeText(source.customLineText),
    canvasWidth: Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(source.canvasWidth, defaultTemplate.canvasWidth)),
    canvasHeight: Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(source.canvasHeight, defaultTemplate.canvasHeight)),
    fieldConfig: {
      ...defaultTemplate.fieldConfig,
      ...(source.fieldConfig || {})
    }
  }
}

function promisifyWx(method, args) {
  return new Promise((resolve, reject) => {
    method.call(wx, {
      ...args,
      success: resolve,
      fail: reject
    })
  })
}

Page({
  data: {
    activityId: '',
    loading: true,
    generating: false,
    saving: false,
    errorMessage: '',
    source: null,
    posterImagePath: '',
    canvasStyleWidthPx: DEFAULT_CANVAS_WIDTH,
    canvasStyleHeightPx: DEFAULT_CANVAS_HEIGHT
  },

  onLoad(options = {}) {
    this.setData({
      activityId: normalizeText(options.activityId)
    })
    this.loadPosterSource()
  },

  async loadPosterSource() {
    if (!this.data.activityId) {
      this.setData({
        loading: false,
        errorMessage: '缺少活动信息'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: ''
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'getPoemPancakePosterSource',
        data: {
          activityId: this.data.activityId
        }
      })
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '海报数据加载失败')
      }

      this.setData({
        source: result.source || null,
        loading: false,
        errorMessage: ''
      })

      this.generatePoster()
    } catch (error) {
      console.error('getPoemPancakePosterSource error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '海报数据加载失败'
      })
    }
  },

  async loadTemplate() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getActivityPosterTemplate',
        data: {
          contentType: 'poemPancake'
        }
      })
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '海报模板加载失败')
      }

      return mergeTemplate(result.template)
    } catch (error) {
      console.error('load poem pancake template error:', error)
      return mergeTemplate(buildDefaultTemplate())
    }
  },

  async resolveImagePath(sourceValue) {
    const source = normalizeText(sourceValue)

    if (!source) {
      return ''
    }

    let imageSource = source

    if (source.indexOf('cloud://') === 0) {
      const tempRes = await wx.cloud.getTempFileURL({
        fileList: [source]
      })
      const tempFile = tempRes.fileList && tempRes.fileList[0]
      imageSource = normalizeText(tempFile && tempFile.tempFileURL)
    }

    if (!imageSource) {
      return ''
    }

    const imageInfo = await promisifyWx(wx.getImageInfo, {
      src: imageSource
    })

    return imageInfo.path || imageInfo.tempFilePath || imageSource
  },

  drawPosterBackground(ctx, logicalWidth, logicalHeight, backgroundPath) {
    const pageGradient = ctx.createLinearGradient(0, 0, logicalWidth, logicalHeight)
    pageGradient.addColorStop(0, '#eef4ff')
    pageGradient.addColorStop(0.58, '#f8fbff')
    pageGradient.addColorStop(1, '#ffffff')
    ctx.setFillStyle(pageGradient)
    ctx.fillRect(0, 0, logicalWidth, logicalHeight)

    if (backgroundPath) {
      ctx.drawImage(backgroundPath, 0, 0, logicalWidth, logicalHeight)
      return
    }

    ctx.setFillStyle('rgba(95, 137, 255, 0.14)')
    ctx.beginPath()
    ctx.arc(logicalWidth - 120, 180, 180, 0, Math.PI * 2)
    ctx.fill()

    ctx.setFillStyle('rgba(77, 118, 255, 0.09)')
    ctx.beginPath()
    ctx.arc(140, logicalHeight - 120, 220, 0, Math.PI * 2)
    ctx.fill()

    drawRoundedRect(ctx, 48, 54, logicalWidth - 96, logicalHeight - 108, 44, 'rgba(255, 255, 255, 0.95)')
  },

  drawBoardSnapshot(ctx, source, config) {
    const layout = buildFieldLayout(config)
    const safeSource = source && typeof source === 'object' ? source : {}
    const cellsMap = safeSource.cellsMap && typeof safeSource.cellsMap === 'object' ? safeSource.cellsMap : {}
    const bounds = safeSource.displayBounds && typeof safeSource.displayBounds === 'object'
      ? safeSource.displayBounds
      : { minRow: -7, maxRow: 7, minCol: -7, maxCol: 7, rowCount: 15, colCount: 15 }

    if (!layout.visible) {
      return
    }

    drawRoundedRect(ctx, layout.x, layout.y, layout.width, layout.height, layout.borderRadius, '#f6f9ff')

    const colCount = Math.max(1, Number(bounds.colCount) || 15)
    const rowCount = Math.max(1, Number(bounds.rowCount) || 15)
    const innerPadding = 26
    const cellSize = Math.min(
      (layout.width - (innerPadding * 2)) / colCount,
      (layout.height - (innerPadding * 2)) / rowCount
    )
    const boardWidth = cellSize * colCount
    const boardHeight = cellSize * rowCount
    const startX = layout.x + ((layout.width - boardWidth) / 2)
    const startY = layout.y + ((layout.height - boardHeight) / 2)

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
        const boardRow = Number(bounds.minRow) + rowIndex
        const boardCol = Number(bounds.minCol) + colIndex
        const cellKey = `r${boardRow}c${boardCol}`
        const cellData = cellsMap && typeof cellsMap[cellKey] === 'object' ? cellsMap[cellKey] : null
        const content = normalizeText(cellData && cellData.content)
        const x = startX + (colIndex * cellSize)
        const y = startY + (rowIndex * cellSize)

        ctx.setStrokeStyle('rgba(171, 186, 221, 0.9)')
        ctx.strokeRect(x, y, cellSize, cellSize)

        if (!content) {
          ctx.setFillStyle('rgba(255, 255, 255, 0.78)')
          ctx.fillRect(x + 1, y + 1, Math.max(0, cellSize - 2), Math.max(0, cellSize - 2))
          continue
        }

        ctx.setFillStyle('rgba(234, 242, 255, 0.98)')
        ctx.fillRect(x + 1, y + 1, Math.max(0, cellSize - 2), Math.max(0, cellSize - 2))
        applyTextStyle(ctx, clampNumber(cellSize * 0.56, 14, 36), '600', '#1f2f4a', 'center')
        ctx.setTextBaseline('middle')
        ctx.fillText(content, x + (cellSize / 2), y + (cellSize / 2))
        ctx.setTextBaseline('top')
      }
    }
  },

  async generatePoster() {
    if (!this.data.source || this.data.generating) {
      return
    }

    this.setData({
      generating: true,
      errorMessage: ''
    })

    try {
      const template = await this.loadTemplate()
      const pixelRatio = clampNumber(getCanvasPixelRatio(), 1, 2)
      const logicalWidth = template.canvasWidth
      const logicalHeight = template.canvasHeight
      const exportWidth = Math.round(logicalWidth * pixelRatio)
      const exportHeight = Math.round(logicalHeight * pixelRatio)
      let backgroundPath = ''
      let avatarPath = ''
      let miniProgramCodePath = ''

      try {
        backgroundPath = await this.resolveImagePath(template.backgroundImageFileId || template.backgroundImageUrl)
      } catch (error) {
        console.error('resolve poem pancake poster background error:', error)
      }

      try {
        avatarPath = await this.resolveImagePath(this.data.source.shareUserAvatar || '')
      } catch (error) {
        console.error('resolve poem pancake poster avatar error:', error)
      }

      try {
        miniProgramCodePath = await this.resolveImagePath(template.miniProgramCodeFileId || template.miniProgramCodeUrl)
      } catch (error) {
        console.error('resolve poem pancake poster mini program code error:', error)
      }

      await new Promise((resolve) => {
        this.setData({
          canvasStyleWidthPx: exportWidth,
          canvasStyleHeightPx: exportHeight,
          posterImagePath: ''
        }, resolve)
      })

      await new Promise((resolve) => {
        setTimeout(resolve, 30)
      })

      const ctx = wx.createCanvasContext(POSTER_CANVAS_ID)
      ctx.save()
      ctx.scale(pixelRatio, pixelRatio)

      this.drawPosterBackground(ctx, logicalWidth, logicalHeight, backgroundPath)
      drawTextField(ctx, this.data.source.themeText, template.fieldConfig.themeText)
      drawTextField(ctx, this.data.source.activityTimeText, template.fieldConfig.activityTimeText)
      this.drawBoardSnapshot(ctx, this.data.source, template.fieldConfig.snapshotImage)
      drawImageField(ctx, avatarPath, template.fieldConfig.shareUserAvatar)
      drawImageField(ctx, miniProgramCodePath, template.fieldConfig.activityQrCode)
      drawTextField(ctx, this.data.source.shareTimeText, template.fieldConfig.shareTimeText)
      drawTextField(ctx, this.data.source.contributionText, template.fieldConfig.contributionText)
      drawTextField(ctx, this.data.source.totalCharsText, template.fieldConfig.totalCharsText)
      drawTextField(ctx, template.customLineText, template.fieldConfig.customLineText)
      ctx.restore()

      const posterImagePath = await new Promise((resolve, reject) => {
        ctx.draw(false, () => {
          wx.canvasToTempFilePath({
            canvasId: POSTER_CANVAS_ID,
            fileType: 'jpg',
            quality: 1,
            width: exportWidth,
            height: exportHeight,
            destWidth: exportWidth,
            destHeight: exportHeight,
            success: (canvasRes) => resolve(canvasRes.tempFilePath),
            fail: reject
          })
        })
      })

      this.setData({
        generating: false,
        loading: false,
        posterImagePath
      })
    } catch (error) {
      console.error('generate poem pancake poster error:', error)
      this.setData({
        generating: false,
        loading: false,
        errorMessage: error.message || '海报生成失败'
      })
    }
  },

  onRetryTap() {
    if (this.data.source) {
      this.generatePoster()
      return
    }

    this.loadPosterSource()
  },

  onPreviewPosterTap() {
    if (!this.data.posterImagePath) {
      wx.showToast({
        title: '海报还没生成好',
        icon: 'none'
      })
      return
    }

    wx.previewImage({
      current: this.data.posterImagePath,
      urls: [this.data.posterImagePath]
    })
  },

  async ensureAlbumPermission() {
    const settingRes = await promisifyWx(wx.getSetting, {})
    const authSetting = settingRes.authSetting || {}

    if (authSetting['scope.writePhotosAlbum'] === true) {
      return true
    }

    if (authSetting['scope.writePhotosAlbum'] !== false) {
      await promisifyWx(wx.authorize, {
        scope: 'scope.writePhotosAlbum'
      })
      return true
    }

    const modalRes = await promisifyWx(wx.showModal, {
      title: '需要相册权限',
      content: '保存海报到相册需要相册权限，请在设置中允许后再继续保存。',
      confirmText: '去设置'
    })

    if (!modalRes.confirm) {
      throw new Error('未获得相册权限')
    }

    const openSettingRes = await promisifyWx(wx.openSetting, {})

    if (openSettingRes.authSetting && openSettingRes.authSetting['scope.writePhotosAlbum']) {
      return true
    }

    throw new Error('未获得相册权限')
  },

  async onSavePosterTap() {
    if (this.data.saving || this.data.generating || !this.data.posterImagePath) {
      return
    }

    this.setData({
      saving: true
    })

    try {
      await this.ensureAlbumPermission()
      await promisifyWx(wx.saveImageToPhotosAlbum, {
        filePath: this.data.posterImagePath
      })

      wx.showToast({
        title: '海报已保存到相册',
        icon: 'success'
      })
    } catch (error) {
      console.error('save poem pancake poster error:', error)
      wx.showToast({
        title: error.message || '保存海报失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        saving: false
      })
    }
  }
})
