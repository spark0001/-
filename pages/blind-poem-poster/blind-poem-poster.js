const POSTER_CANVAS_ID = 'blindPoemPosterCanvas'
const LOGICAL_WIDTH = 1080
const LOGICAL_HEIGHT = 1660
const MIN_POSTER_CANVAS_SIZE = 120
const TEMPLATE_CACHE_TTL = 5 * 60 * 1000
const BUILTIN_TEMPLATE_ID_PREFIX = '__builtin__-'

const MANAGED_CONTENT_TYPE_MAP = {
  A: 'blindPoemA',
  C: 'blindPoemC'
}

const MANAGED_CONTENT_TYPE_TEXT_MAP = {
  blindPoemA: '创作互动模式A',
  blindPoemC: '创作互动模式C'
}

const MANAGED_FIELD_POOL = [
  { key: 'modeText', kind: 'text' },
  { key: 'createdAtText', kind: 'text' },
  { key: 'statusTagText', kind: 'text' },
  { key: 'promptText', kind: 'text' },
  { key: 'resultContent', kind: 'text' },
  { key: 'myContent', kind: 'text' },
  { key: 'partnerContent', kind: 'text' },
  { key: 'customLineText', kind: 'text' }
]

const MODE_META_MAP = {
  A: {
    modeShortLabel: '双人各写一句'
  },
  B: {
    modeShortLabel: '上下句互写'
  },
  C: {
    modeShortLabel: '同题异写'
  }
}

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

function getManagedContentType(mode) {
  return MANAGED_CONTENT_TYPE_MAP[normalizeText(mode).toUpperCase()] || ''
}

function getManagedContentTypeText(contentType, fallback) {
  return MANAGED_CONTENT_TYPE_TEXT_MAP[normalizeText(contentType)] || normalizeText(fallback) || '创作互动结果'
}

function getTemplateCacheKey(contentType) {
  return `blindPoemPosterTemplate:${normalizeText(contentType) || 'default'}`
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
    return fontSize * 0.54
  }

  if (/\s/.test(char)) {
    return fontSize * 0.32
  }

  return fontSize
}

function truncateLine(line, maxWidth, fontSize) {
  const ellipsis = '...'
  const ellipsisWidth = estimateCharWidth('.', fontSize) * ellipsis.length
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

function applyTextStyle(ctx, fontSize, fontWeight, color, textAlign = 'left') {
  ctx.setFillStyle(color)
  ctx.setFontSize(fontSize)
  ctx.setTextAlign(textAlign)
  ctx.setTextBaseline('top')
  ctx.font = `${fontWeight} ${fontSize}px sans-serif`
}

function buildFieldLayout(config) {
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

function drawWrappedParagraph(ctx, text, x, y, maxWidth, fontSize, lineHeight, maxLines, color, fontWeight = '500') {
  const lines = wrapText(text, maxWidth, fontSize, maxLines)

  if (!lines.length) {
    return 0
  }

  applyTextStyle(ctx, fontSize, fontWeight, color, 'left')
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + (index * lineHeight))
  })

  return lines.length * lineHeight
}

function drawInfoBlock(ctx, options) {
  const {
    x,
    y,
    width,
    title,
    text,
    minHeight,
    titleWidth,
    titleColor,
    titleTextColor,
    backgroundColor,
    textColor,
    fontSize,
    lineHeight,
    maxLines
  } = options

  const contentX = x + 30
  const titleY = y + 20
  const textY = y + 88
  const textWidth = width - 60
  const lines = wrapText(text, textWidth, fontSize, maxLines)
  const contentHeight = Math.max(minHeight, 112 + (Math.max(lines.length, 1) * lineHeight))

  drawRoundedRect(ctx, x, y, width, contentHeight, 34, backgroundColor)
  drawRoundedRect(ctx, contentX, titleY, titleWidth, 48, 24, titleColor)
  applyTextStyle(ctx, 24, '700', titleTextColor, 'left')
  ctx.fillText(title, contentX + 18, titleY + 10)

  if (lines.length) {
    applyTextStyle(ctx, fontSize, '500', textColor, 'left')
    lines.forEach((line, index) => {
      ctx.fillText(line, contentX, textY + (index * lineHeight))
    })
  }

  return contentHeight
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

function buildStatusMeta(statusText) {
  const safeStatusText = normalizeText(statusText)

  if (safeStatusText.indexOf('屏蔽') !== -1) {
    return {
      statusTagText: '内容受限'
    }
  }

  if (safeStatusText.indexOf('等待') !== -1) {
    return {
      statusTagText: '等待完成'
    }
  }

  return {
    statusTagText: '结果已生成'
  }
}

function buildPosterDetail(detail) {
  const safeDetail = detail && typeof detail === 'object' ? detail : {}
  const mode = normalizeText(safeDetail.mode).toUpperCase()
  const modeMeta = MODE_META_MAP[mode] || MODE_META_MAP.A
  const statusMeta = buildStatusMeta(safeDetail.statusText)
  const managedContentType = getManagedContentType(mode)

  return {
    roundId: normalizeText(safeDetail.roundId),
    mode,
    modeText: normalizeText(safeDetail.modeText) || '双盲作诗',
    modeShortLabel: modeMeta.modeShortLabel,
    promptTitle: normalizeText(safeDetail.promptTitle) || '双盲作诗',
    promptText: normalizeText(safeDetail.promptText) || '这一轮还没有公开题面。',
    myTitle: normalizeText(safeDetail.myTitle) || '我的作品',
    myContent: normalizeText(safeDetail.myContent) || '你还没有提交作品。',
    partnerTitle: normalizeText(safeDetail.partnerTitle) || '另一位写作者的作品',
    partnerContent: normalizeText(safeDetail.partnerContent) || '另一位写作者还没有完成创作。',
    resultContent: normalizeText(safeDetail.resultContent) || '当前还未生成完整结果。',
    createdAtText: normalizeText(safeDetail.createdAtText),
    statusText: normalizeText(safeDetail.statusText) || '本轮创作已完成',
    statusTagText: normalizeText(safeDetail.statusTagText) || statusMeta.statusTagText,
    managedContentType,
    managedContentTypeText: getManagedContentTypeText(managedContentType, normalizeText(safeDetail.modeText) || '双盲作诗')
  }
}

function buildManagedDefaultFieldConfig() {
  return {
    modeText: {
      enabled: true,
      visible: true,
      x: '72',
      y: '136',
      width: '760',
      height: '80',
      fontSize: '56',
      color: '#17306a',
      fontWeight: '700',
      textAlign: 'left',
      lineHeight: '72',
      maxLines: '2'
    },
    createdAtText: {
      enabled: true,
      visible: true,
      x: '72',
      y: '240',
      width: '360',
      height: '46',
      fontSize: '24',
      color: '#8190aa',
      fontWeight: '600',
      textAlign: 'left',
      lineHeight: '34',
      maxLines: '1'
    },
    statusTagText: {
      enabled: true,
      visible: true,
      x: '760',
      y: '138',
      width: '248',
      height: '46',
      fontSize: '24',
      color: '#4d76ff',
      fontWeight: '700',
      textAlign: 'right',
      lineHeight: '34',
      maxLines: '1'
    },
    promptText: {
      enabled: true,
      visible: true,
      x: '72',
      y: '376',
      width: '836',
      height: '180',
      fontSize: '30',
      color: '#334869',
      fontWeight: '500',
      textAlign: 'left',
      lineHeight: '44',
      maxLines: '4'
    },
    resultContent: {
      enabled: true,
      visible: true,
      x: '72',
      y: '616',
      width: '836',
      height: '360',
      fontSize: '34',
      color: '#253558',
      fontWeight: '500',
      textAlign: 'left',
      lineHeight: '50',
      maxLines: '6'
    },
    myContent: {
      enabled: true,
      visible: true,
      x: '72',
      y: '1044',
      width: '836',
      height: '156',
      fontSize: '30',
      color: '#2c3d5f',
      fontWeight: '500',
      textAlign: 'left',
      lineHeight: '44',
      maxLines: '3'
    },
    partnerContent: {
      enabled: true,
      visible: true,
      x: '72',
      y: '1272',
      width: '836',
      height: '156',
      fontSize: '30',
      color: '#2c3d5f',
      fontWeight: '500',
      textAlign: 'left',
      lineHeight: '44',
      maxLines: '3'
    },
    customLineText: {
      enabled: false,
      visible: false,
      x: '72',
      y: '1496',
      width: '836',
      height: '52',
      fontSize: '28',
      color: '#4d76ff',
      fontWeight: '600',
      textAlign: 'left',
      lineHeight: '38',
      maxLines: '1'
    }
  }
}

function mergeManagedFieldConfig(fieldConfig) {
  const defaultConfig = buildManagedDefaultFieldConfig()
  const result = {}

  MANAGED_FIELD_POOL.forEach((field) => {
    const fieldKey = field.key
    const source = fieldConfig && typeof fieldConfig[fieldKey] === 'object' ? fieldConfig[fieldKey] : {}
    const enabled = typeof source.enabled === 'boolean'
      ? source.enabled
      : (typeof source.visible === 'boolean' ? source.visible : defaultConfig[fieldKey].enabled !== false)

    result[fieldKey] = {
      ...defaultConfig[fieldKey],
      ...source,
      enabled,
      visible: enabled,
      x: String(source.x != null ? source.x : defaultConfig[fieldKey].x),
      y: String(source.y != null ? source.y : defaultConfig[fieldKey].y),
      width: String(source.width != null ? source.width : defaultConfig[fieldKey].width),
      height: String(source.height != null ? source.height : defaultConfig[fieldKey].height),
      borderRadius: String(source.borderRadius != null ? source.borderRadius : (defaultConfig[fieldKey].borderRadius || '0')),
      fontSize: String(source.fontSize != null ? source.fontSize : (defaultConfig[fieldKey].fontSize || '28')),
      color: normalizeText(source.color || defaultConfig[fieldKey].color || '#17306a'),
      fontWeight: normalizeText(source.fontWeight || defaultConfig[fieldKey].fontWeight || '500'),
      textAlign: normalizeText(source.textAlign || defaultConfig[fieldKey].textAlign || 'left'),
      lineHeight: String(source.lineHeight != null ? source.lineHeight : (defaultConfig[fieldKey].lineHeight || '40')),
      maxLines: String(source.maxLines != null ? source.maxLines : (defaultConfig[fieldKey].maxLines || '2'))
    }

    if (fieldKey === 'customLineText') {
      result[fieldKey].maxLines = '1'
    }
  })

  return result
}

function buildManagedDefaultTemplate(contentType) {
  return {
    templateId: '',
    templateName: `${getManagedContentTypeText(contentType)}海报`,
    contentType,
    enabled: false,
    description: `当前未配置${getManagedContentTypeText(contentType)}模板，已使用系统默认模板`,
    backgroundImageUrl: '',
    backgroundImageFileId: '',
    customLineText: '',
    canvasWidth: LOGICAL_WIDTH,
    canvasHeight: LOGICAL_HEIGHT,
    fieldConfig: buildManagedDefaultFieldConfig(),
    source: 'builtin'
  }
}

function buildManagedTemplate(template, contentType) {
  const defaultTemplate = buildManagedDefaultTemplate(contentType)
  const source = template && typeof template === 'object' ? template : {}

  return {
    templateId: normalizeText(source.templateId || defaultTemplate.templateId),
    templateName: normalizeText(source.templateName || defaultTemplate.templateName),
    contentType: normalizeText(source.contentType || contentType || defaultTemplate.contentType),
    enabled: source.enabled === true,
    description: normalizeText(source.description || defaultTemplate.description),
    backgroundImageUrl: normalizeText(source.backgroundImageFileId || source.backgroundImageUrl || defaultTemplate.backgroundImageUrl),
    backgroundImageFileId: normalizeText(source.backgroundImageFileId || source.backgroundImageUrl || defaultTemplate.backgroundImageFileId),
    customLineText: normalizeText(source.customLineText),
    canvasWidth: Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(source.canvasWidth, defaultTemplate.canvasWidth)),
    canvasHeight: Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(source.canvasHeight, defaultTemplate.canvasHeight)),
    fieldConfig: mergeManagedFieldConfig(source.fieldConfig),
    source: normalizeText(source.source || defaultTemplate.source) || 'builtin'
  }
}

function getManagedTemplateOptionId(template, contentType) {
  const normalizedTemplate = buildManagedTemplate(template, contentType)
  const templateId = normalizeText(normalizedTemplate.templateId)
  return templateId || `${BUILTIN_TEMPLATE_ID_PREFIX}${normalizeText(contentType) || 'default'}`
}

function buildManagedTemplateOption(template, contentType) {
  const normalizedTemplate = buildManagedTemplate(template, contentType)
  const isBuiltin = normalizedTemplate.source === 'builtin'

  return {
    ...normalizedTemplate,
    optionId: getManagedTemplateOptionId(normalizedTemplate, contentType),
    isBuiltin,
    thumbUrl: normalizeText(normalizedTemplate.backgroundImageFileId || normalizedTemplate.backgroundImageUrl),
    badgeText: isBuiltin
      ? '系统默认'
      : (normalizedTemplate.enabled ? '已启用' : '备选模板')
  }
}

function buildManagedTemplateBundle(templateSource, contentType, preferredTemplateId = '') {
  const safeContentType = normalizeText(contentType)
  const configuredTemplateList = templateSource && Array.isArray(templateSource.templateList)
    ? templateSource.templateList.map((item) => buildManagedTemplateOption(item, safeContentType))
    : []
  const preferredOptionId = normalizeText(preferredTemplateId)
  const defaultTemplateOption = templateSource && templateSource.template
    ? buildManagedTemplateOption(templateSource.template, safeContentType)
    : (
      templateSource
      && !Array.isArray(templateSource.templateList)
      && typeof templateSource === 'object'
      && Object.keys(templateSource).length
        ? buildManagedTemplateOption(templateSource, safeContentType)
        : null
    )
  const builtinTemplateOption = buildManagedTemplateOption(buildManagedDefaultTemplate(safeContentType), safeContentType)
  const optionList = []

  if (defaultTemplateOption) {
    optionList.push(defaultTemplateOption)
  }

  configuredTemplateList.forEach((item) => {
    if (!optionList.some((candidate) => candidate.optionId === item.optionId)) {
      optionList.push(item)
    }
  })

  if (!optionList.some((item) => item.optionId === builtinTemplateOption.optionId)) {
    optionList.push(builtinTemplateOption)
  }

  const selectedTemplate = optionList.find((item) => item.optionId === preferredOptionId)
    || (defaultTemplateOption
      ? optionList.find((item) => item.optionId === defaultTemplateOption.optionId)
      : null)
    || optionList.find((item) => item.enabled === true && item.isBuiltin !== true)
    || optionList[0]
    || builtinTemplateOption

  return {
    template: selectedTemplate,
    templateList: optionList,
    selectedTemplateId: selectedTemplate ? selectedTemplate.optionId : builtinTemplateOption.optionId
  }
}

function normalizeManagedTemplateCachePayload(payload, contentType, preferredTemplateId = '') {
  return buildManagedTemplateBundle(payload, contentType, preferredTemplateId)
}

function getManagedTemplateSourceText(template, contentType) {
  const contentTypeText = getManagedContentTypeText(contentType, '创作互动结果')

  if (template && template.source === 'builtin') {
    return `当前未配置${contentTypeText}模板，已使用系统默认模板`
  }

  if (template && template.enabled !== true) {
    return `当前改用模板：${normalizeText(template.templateName) || `${contentTypeText}海报`}`
  }

  return `当前已选${contentTypeText}海报模板`
}

function readTemplateCache(contentType) {
  try {
    const cache = wx.getStorageSync(getTemplateCacheKey(contentType))
    return cache && cache.payload ? cache : null
  } catch (error) {
    console.error('read blind poem poster template cache error:', error)
    return null
  }
}

function writeTemplateCache(contentType, payload) {
  if (!payload || !contentType) {
    return
  }

  try {
    wx.setStorageSync(getTemplateCacheKey(contentType), {
      updatedAt: Date.now(),
      payload
    })
  } catch (error) {
    console.error('write blind poem poster template cache error:', error)
  }
}

function isTemplateCacheFresh(cache) {
  const updatedAt = Number(cache && cache.updatedAt) || 0
  return !!updatedAt && (Date.now() - updatedAt < TEMPLATE_CACHE_TTL)
}

function buildManagedFieldValueMap(detail, template = {}) {
  return {
    modeText: normalizeText(detail.managedContentTypeText || detail.modeText) || '创作互动结果',
    createdAtText: normalizeText(detail.createdAtText) || '创作结果海报',
    statusTagText: normalizeText(detail.statusTagText) || '结果已生成',
    promptText: normalizeText(detail.promptText) || '这一轮还没有公开题面。',
    resultContent: normalizeText(detail.resultContent) || '当前还未生成完整结果。',
    myContent: normalizeText(detail.myContent) || '你还没有提交作品。',
    partnerContent: normalizeText(detail.partnerContent) || '另一位写作者还没有完成创作。',
    customLineText: normalizeText(template.customLineText)
  }
}

Page({
  data: {
    roundId: '',
    loading: true,
    generating: false,
    saving: false,
    errorMessage: '',
    detail: null,
    posterImagePath: '',
    canvasStyleWidthPx: LOGICAL_WIDTH,
    canvasStyleHeightPx: LOGICAL_HEIGHT,
    pixelRatio: 1,
    templateOptionList: [],
    selectedTemplateId: '',
    templateName: '',
    templateSourceText: ''
  },

  onLoad(options = {}) {
    this._posterDetailReady = false

    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()

    if (eventChannel && eventChannel.on) {
      eventChannel.on('acceptBlindPoemPosterDetail', ({ detail }) => {
        if (!detail) {
          return
        }

        this._posterDetailReady = true
        this.applyDetail(detail)
      })
    }

    this.setData({
      roundId: normalizeText(options.roundId)
    })

    setTimeout(() => {
      if (this._posterDetailReady) {
        return
      }

      if (this.data.roundId) {
        this.loadRoundDetail()
        return
      }

      this.setData({
        loading: false,
        errorMessage: '缺少轮次信息'
      })
    }, 80)
  },

  applyDetail(detail) {
    const nextDetail = buildPosterDetail(detail)

    this.setData({
      loading: false,
      errorMessage: '',
      detail: nextDetail,
      templateOptionList: [],
      selectedTemplateId: '',
      templateName: '',
      templateSourceText: ''
    }, () => {
      this.generatePoster()
    })
  },

  loadRoundDetail() {
    this.setData({
      loading: true,
      errorMessage: ''
    })

    wx.cloud.callFunction({
      name: 'getBlindPoemRoundDetail',
      data: {
        roundId: this.data.roundId
      }
    }).then((res) => {
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '加载结果失败')
      }

      this.applyDetail(result.detail || {})
    }).catch((error) => {
      console.error('getBlindPoemRoundDetail for poster error:', error)
      this.setData({
        loading: false,
        errorMessage: error.message || '加载结果失败',
        detail: null
      })
    })
  },

  async loadManagedTemplate(contentType, forceRefresh = false, preferredTemplateId = '') {
    const cachedTemplate = readTemplateCache(contentType)

    if (!forceRefresh && cachedTemplate && cachedTemplate.payload && isTemplateCacheFresh(cachedTemplate)) {
      return normalizeManagedTemplateCachePayload(cachedTemplate.payload, contentType, preferredTemplateId)
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'getActivityPosterTemplate',
        data: {
          contentType
        }
      })
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || '创作互动海报模板加载失败')
      }

      const templateBundle = buildManagedTemplateBundle({
        template: result.template,
        templateList: Array.isArray(result.templateList) ? result.templateList : []
      }, contentType, preferredTemplateId)
      writeTemplateCache(contentType, templateBundle)
      return templateBundle
    } catch (error) {
      console.error('load blind poem managed template error:', error)

      if (!forceRefresh && cachedTemplate && cachedTemplate.payload) {
        return normalizeManagedTemplateCachePayload(cachedTemplate.payload, contentType, preferredTemplateId)
      }

      return buildManagedTemplateBundle({
        template: buildManagedDefaultTemplate(contentType),
        templateList: []
      }, contentType, preferredTemplateId)
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

  async resolveBackgroundPath(template) {
    return this.resolveImagePath(template.backgroundImageFileId || template.backgroundImageUrl)
  },

  drawManagedPosterBackground(ctx, logicalWidth, logicalHeight, backgroundPath) {
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
    ctx.arc(logicalWidth - 120, 160, 180, 0, Math.PI * 2)
    ctx.fill()

    ctx.setFillStyle('rgba(77, 118, 255, 0.09)')
    ctx.beginPath()
    ctx.arc(140, logicalHeight - 120, 220, 0, Math.PI * 2)
    ctx.fill()

    drawRoundedRect(ctx, 48, 54, logicalWidth - 96, logicalHeight - 108, 44, 'rgba(255, 255, 255, 0.95)')
  },

  async generateManagedPoster(template) {
    const detail = this.data.detail
    const normalizedTemplate = buildManagedTemplate(template, detail.managedContentType)
    const pixelRatio = clampNumber(getCanvasPixelRatio(), 1, 2)
    const logicalWidth = normalizedTemplate.canvasWidth
    const logicalHeight = normalizedTemplate.canvasHeight
    const exportWidth = Math.round(logicalWidth * pixelRatio)
    const exportHeight = Math.round(logicalHeight * pixelRatio)
    let backgroundPath = ''

    try {
      backgroundPath = await this.resolveBackgroundPath(normalizedTemplate)
    } catch (error) {
      console.error('resolve blind poem poster background error:', error)
    }

    await new Promise((resolve) => {
      this.setData({
        posterImagePath: '',
        canvasStyleWidthPx: exportWidth,
        canvasStyleHeightPx: exportHeight,
        pixelRatio
      }, resolve)
    })

    await new Promise((resolve) => {
      setTimeout(resolve, 30)
    })

    const ctx = wx.createCanvasContext(POSTER_CANVAS_ID)
    ctx.save()
    ctx.scale(pixelRatio, pixelRatio)

    this.drawManagedPosterBackground(ctx, logicalWidth, logicalHeight, backgroundPath)

    const fieldValueMap = buildManagedFieldValueMap(detail, normalizedTemplate)
    const fieldConfig = normalizedTemplate.fieldConfig || buildManagedDefaultFieldConfig()

    MANAGED_FIELD_POOL.forEach((field) => {
      drawTextField(ctx, fieldValueMap[field.key], fieldConfig[field.key] || {})
    })

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
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        })
      })
    })

    this.setData({
      posterImagePath
    })

    this.reportPosterTemplateUsage(normalizedTemplate, detail.managedContentType)
  },

  async generatePoster(forceRefresh = false, templateOptionId = '') {
    if (!this.data.detail || this.data.generating) {
      return
    }

    const detail = this.data.detail

    this.setData({
      generating: true,
      errorMessage: ''
    })

    try {
      if (detail.managedContentType) {
        const templateBundle = await this.loadManagedTemplate(
          detail.managedContentType,
          forceRefresh,
          templateOptionId || this.data.selectedTemplateId
        )
        const selectedTemplate = templateBundle.template || buildManagedDefaultTemplate(detail.managedContentType)

        await this.generateManagedPoster(selectedTemplate)

        this.setData({
          templateOptionList: templateBundle.templateList,
          selectedTemplateId: templateBundle.selectedTemplateId,
          templateName: normalizeText(selectedTemplate.templateName) || `${detail.managedContentTypeText || detail.modeText || '创作互动结果'}海报`,
          templateSourceText: getManagedTemplateSourceText(selectedTemplate, detail.managedContentType)
        })
      } else {
        this.setData({
          templateOptionList: [],
          selectedTemplateId: '',
          templateName: '',
          templateSourceText: ''
        })
        await this.generateLegacyPoster()
      }

      this.setData({
        loading: false,
        generating: false,
        errorMessage: ''
      })
    } catch (error) {
      console.error('generate blind poem poster error:', error)
      this.setData({
        loading: false,
        generating: false,
        errorMessage: error.message || '结果海报生成失败'
      })
    }
  },

  async generateLegacyPoster() {
    const pixelRatio = clampNumber(getCanvasPixelRatio(), 1, 2)
    const exportWidth = Math.round(LOGICAL_WIDTH * pixelRatio)
    const exportHeight = Math.round(LOGICAL_HEIGHT * pixelRatio)
    const detail = this.data.detail

    this.setData({
      posterImagePath: '',
      canvasStyleWidthPx: exportWidth,
      canvasStyleHeightPx: exportHeight,
      pixelRatio
    })

    await new Promise((resolve) => {
      setTimeout(resolve, 30)
    })

    const ctx = wx.createCanvasContext(POSTER_CANVAS_ID)
    ctx.save()
    ctx.scale(pixelRatio, pixelRatio)

    const pageGradient = ctx.createLinearGradient(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
    pageGradient.addColorStop(0, '#eef4ff')
    pageGradient.addColorStop(0.55, '#f8fbff')
    pageGradient.addColorStop(1, '#ffffff')
    ctx.setFillStyle(pageGradient)
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)

    ctx.setFillStyle('rgba(95, 137, 255, 0.14)')
    ctx.beginPath()
    ctx.arc(LOGICAL_WIDTH - 120, 160, 180, 0, Math.PI * 2)
    ctx.fill()

    ctx.setFillStyle('rgba(77, 118, 255, 0.09)')
    ctx.beginPath()
    ctx.arc(140, LOGICAL_HEIGHT - 120, 220, 0, Math.PI * 2)
    ctx.fill()

    drawRoundedRect(ctx, 48, 54, LOGICAL_WIDTH - 96, LOGICAL_HEIGHT - 108, 44, 'rgba(255, 255, 255, 0.95)')
    drawRoundedRect(ctx, 84, 104, 248, 56, 28, 'rgba(232, 240, 255, 0.98)')
    applyTextStyle(ctx, 24, '700', '#5f79bc', 'left')
    ctx.fillText('DUET POEM', 114, 118)

    drawRoundedRect(ctx, LOGICAL_WIDTH - 290, 104, 170, 56, 28, 'rgba(77, 118, 255, 0.96)')
    applyTextStyle(ctx, 24, '700', '#ffffff', 'center')
    ctx.fillText(detail.statusTagText, LOGICAL_WIDTH - 205, 118)

    applyTextStyle(ctx, 58, '700', '#182c54', 'left')
    ctx.fillText(detail.modeText, 84, 206)

    applyTextStyle(ctx, 28, '600', '#5d729c', 'left')
    ctx.fillText(detail.promptTitle, 84, 286)

    drawRoundedRect(ctx, 84, 338, 270, 46, 23, 'rgba(240, 245, 255, 0.98)')
    applyTextStyle(ctx, 22, '600', '#6a7fa8', 'left')
    ctx.fillText(detail.createdAtText || '创作结果海报', 108, 350)

    const promptHeight = drawInfoBlock(ctx, {
      x: 84,
      y: 428,
      width: LOGICAL_WIDTH - 168,
      title: '本轮题面',
      text: detail.promptText,
      minHeight: 180,
      titleWidth: 180,
      titleColor: 'rgba(77, 118, 255, 0.1)',
      titleTextColor: '#4d76ff',
      backgroundColor: '#f7faff',
      textColor: '#334869',
      fontSize: 30,
      lineHeight: 44,
      maxLines: 4
    })

    const resultY = 428 + promptHeight + 24
    const resultHeight = drawInfoBlock(ctx, {
      x: 84,
      y: resultY,
      width: LOGICAL_WIDTH - 168,
      title: '结果展示',
      text: detail.resultContent,
      minHeight: 420,
      titleWidth: 180,
      titleColor: 'rgba(77, 118, 255, 0.12)',
      titleTextColor: '#3d6fff',
      backgroundColor: '#f3f7ff',
      textColor: '#213552',
      fontSize: 34,
      lineHeight: 50,
      maxLines: 8
    })

    const myY = resultY + resultHeight + 24
    const myHeight = drawInfoBlock(ctx, {
      x: 84,
      y: myY,
      width: LOGICAL_WIDTH - 168,
      title: detail.myTitle,
      text: detail.myContent,
      minHeight: 176,
      titleWidth: 190,
      titleColor: 'rgba(93, 136, 255, 0.12)',
      titleTextColor: '#4a72f2',
      backgroundColor: '#fbfcff',
      textColor: '#2c3d5f',
      fontSize: 30,
      lineHeight: 44,
      maxLines: 3
    })

    const partnerY = myY + myHeight + 20
    drawInfoBlock(ctx, {
      x: 84,
      y: partnerY,
      width: LOGICAL_WIDTH - 168,
      title: detail.partnerTitle,
      text: detail.partnerContent,
      minHeight: 176,
      titleWidth: 320,
      titleColor: 'rgba(230, 238, 255, 0.98)',
      titleTextColor: '#6178b6',
      backgroundColor: '#fbfcff',
      textColor: '#2c3d5f',
      fontSize: 30,
      lineHeight: 44,
      maxLines: 3
    })

    applyTextStyle(ctx, 24, '600', '#8ea0c4', 'center')
    ctx.fillText('校园读书会 · 创作互动结果海报', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 104)

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
          success: (res) => resolve(res.tempFilePath),
          fail: reject
        })
      })
    })

    this.setData({
      posterImagePath
    })
  },

  onRetryTap() {
    if (this.data.detail) {
      this.generatePoster(true)
      return
    }

    if (this.data.roundId) {
      this.loadRoundDetail()
    }
  },

  onTemplateOptionTap(e) {
    const optionId = normalizeText(e.currentTarget.dataset.optionId)

    if (!optionId || optionId === this.data.selectedTemplateId || this.data.generating) {
      return
    }

    this.generatePoster(false, optionId)
  },

  reportPosterTemplateUsage(template, contentType) {
    const normalizedTemplate = buildManagedTemplate(template, contentType)
    const templateKey = getManagedTemplateOptionId(normalizedTemplate, contentType)

    if (!templateKey || !normalizeText(contentType)) {
      return
    }

    wx.cloud.callFunction({
      name: 'reportPosterTemplateUsage',
      data: {
        templateKey,
        templateId: normalizeText(normalizedTemplate.templateId),
        templateName: normalizeText(normalizedTemplate.templateName),
        contentType: normalizeText(contentType),
        previewImageUrl: normalizeText(normalizedTemplate.backgroundImageFileId || normalizedTemplate.backgroundImageUrl),
        source: normalizeText(normalizedTemplate.source)
      }
    }).catch((error) => {
      console.warn('reportPosterTemplateUsage error:', error)
    })
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
      console.error('save blind poem poster error:', error)
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
