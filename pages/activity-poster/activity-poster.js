const {
  buildSharePosterSource,
  readSharePosterSource
} = require('../../utils/readingPoster')
const {
  SHARE_LANDING_HOME,
  buildShareAppMessage,
  pickShareImage,
  showPageShareMenu
} = require('../../utils/share')

const DEFAULT_CONTENT_TYPE = 'reading'
const LEGACY_READING_POSTER_TEMPLATE_CACHE_KEY = 'readingPosterTemplateCacheV1'
const SHARE_POSTER_TEMPLATE_CACHE_PREFIX = 'sharePosterTemplateCacheV2'
const SHARE_POSTER_TEMPLATE_CACHE_TTL = 5 * 60 * 1000
const MIN_POSTER_CANVAS_SIZE = 120
const BUILTIN_TEMPLATE_ID_PREFIX = '__builtin__-'

const SHARE_FIELD_POOL = [
  { key: 'bookTitle', kind: 'text' },
  { key: 'author', kind: 'text' },
  { key: 'checkInDate', kind: 'text' },
  { key: 'readingMetric', kind: 'text' },
  { key: 'contentTitle', kind: 'text' },
  { key: 'reflectionText', kind: 'text' },
  { key: 'nickname', kind: 'text' },
  { key: 'avatar', kind: 'image' },
  { key: 'customLineText', kind: 'text' }
]

const POSTER_META_MAP = {
  reading: {
    contentTypeText: '阅读打卡',
    navTitle: '阅读打卡海报',
    pageTitle: '阅读打卡海报',
    defaultTitle: '阅读打卡海报',
    loadingText: '正在生成阅读打卡海报预览...',
    heroKicker: 'READING SHARE',
    heroSubtitle: '阅读打卡内容分享',
    recordTagText: '本次阅读记录',
    dateLabel: '打卡日期',
    authorLabel: '作者',
    authorFallbackText: '',
    reflectionFallbackText: '今天的阅读，值得留下一句给未来的自己。',
    missingRecordMessage: '未找到本次阅读打卡记录，请从发布成功页或记录详情页重新进入。',
    generateErrorMessage: '阅读打卡海报生成失败',
    templateSourceBuiltinText: '当前未配置阅读打卡海报模板，已使用系统默认模板',
    templateSourceConfiguredText: '当前已选阅读打卡海报模板'
  },
  life: {
    contentTypeText: '生活分享',
    navTitle: '生活分享海报',
    pageTitle: '生活分享海报',
    defaultTitle: '生活分享海报',
    loadingText: '正在生成生活分享海报预览...',
    heroKicker: 'LIFE SHARE',
    heroSubtitle: '生活分享内容展示',
    recordTagText: '这次生活分享',
    dateLabel: '分享日期',
    authorLabel: '关联活动',
    authorFallbackText: '生活分享',
    reflectionFallbackText: '把今天想留下的一点生活，分享给未来的自己。',
    missingRecordMessage: '未找到这条生活分享记录，请从发布成功页或详情页重新进入。',
    generateErrorMessage: '生活分享海报生成失败',
    templateSourceBuiltinText: '当前未配置生活分享海报模板，已使用系统默认模板',
    templateSourceConfiguredText: '当前已选生活分享海报模板'
  },
  reward: {
    contentTypeText: '奖励晒单',
    navTitle: '奖励晒单海报',
    pageTitle: '奖励晒单海报',
    defaultTitle: '奖励晒单海报',
    loadingText: '正在生成奖励晒单海报预览...',
    heroKicker: 'REWARD SHARE',
    heroSubtitle: '奖励晒单内容展示',
    recordTagText: '这次奖励晒单',
    dateLabel: '晒单日期',
    authorLabel: '关联活动',
    authorFallbackText: '奖励晒单',
    reflectionFallbackText: '把这次收到奖励的开心，也留成一张可以分享的海报。',
    missingRecordMessage: '未找到这条奖励晒单记录，请从发布成功页或详情页重新进入。',
    generateErrorMessage: '奖励晒单海报生成失败',
    templateSourceBuiltinText: '当前未配置奖励晒单海报模板，已使用系统默认模板',
    templateSourceConfiguredText: '当前已选奖励晒单海报模板'
  }
}

function normalizeText(value) {
  return String(value == null ? '' : value).trim()
}

function normalizeContentType(value) {
  return value === 'life' || value === 'reward' ? value : DEFAULT_CONTENT_TYPE
}

function normalizeAuthorAttachMode(value) {
  return value === 'left' || value === 'right' ? value : 'none'
}

function formatPosterBookTitle(value, contentType, config = {}) {
  const safeText = normalizeText(value)

  if (!safeText) {
    return ''
  }

  if (normalizeContentType(contentType) === 'reading' && config.autoBookTitleQuotes !== false) {
    return `《${safeText}》`
  }

  return safeText
}

function getPosterMeta(contentType) {
  return POSTER_META_MAP[normalizeContentType(contentType)] || POSTER_META_MAP[DEFAULT_CONTENT_TYPE]
}

function formatParagraphText(value, config = {}) {
  const safeText = String(value == null ? '' : value).replace(/\r\n/g, '\n').trim()

  if (!safeText) {
    return ''
  }

  const paragraphList = safeText
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!paragraphList.length) {
    return ''
  }

  return paragraphList.map((paragraph, index) => {
    if (config.indentFirstLine === true && index === 0) {
      return `　　${paragraph}`
    }

    return paragraph
  }).join('\n\n')
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

function buildDefaultRecord(contentType = DEFAULT_CONTENT_TYPE) {
  return {
    _id: '',
    type: normalizeContentType(contentType),
    title: '',
    bookTitle: '',
    contentTitle: '',
    author: '',
    checkInDate: '',
    createdAt: 0,
    insight: '',
    excerpt: '',
    content: '',
    reflectionText: '',
    nickname: '',
    avatarUrl: '',
    duration: 0,
    pagesOrChapter: '',
    readingMetric: '',
    coverUrl: '',
    images: [],
    activityId: '',
    activityTitle: ''
  }
}

function buildDefaultFieldConfig(contentType = DEFAULT_CONTENT_TYPE) {
  const safeContentType = normalizeContentType(contentType)

  return {
    bookTitle: {
      enabled: true,
      visible: true,
      x: '72',
      y: '276',
      width: '836',
      height: '132',
      fontSize: '56',
      color: '#17306a',
      fontWeight: '700',
      textAlign: 'left',
      lineHeight: '72',
      maxLines: '2',
      autoBookTitleQuotes: safeContentType === 'reading'
    },
    author: {
      enabled: true,
      visible: true,
      x: '72',
      y: '428',
      width: '560',
      height: '52',
      fontSize: '28',
      color: '#6a7a95',
      fontWeight: '500',
      textAlign: 'left',
      lineHeight: '38',
      maxLines: '1',
      attachToBookTitle: 'none'
    },
    checkInDate: {
      enabled: true,
      visible: true,
      x: '72',
      y: '492',
      width: '420',
      height: '50',
      fontSize: '26',
      color: '#8190aa',
      fontWeight: '500',
      textAlign: 'left',
      lineHeight: '36',
      maxLines: '1'
    },
    readingMetric: {
      enabled: true,
      visible: true,
      x: '72',
      y: '550',
      width: '420',
      height: '56',
      fontSize: '28',
      color: '#4d76ff',
      fontWeight: '600',
      textAlign: 'left',
      lineHeight: '38',
      maxLines: '1'
    },
    contentTitle: {
      enabled: true,
      visible: safeContentType === 'reading',
      x: '112',
      y: '760',
      width: '420',
      height: '44',
      fontSize: '22',
      color: '#3d6fff',
      fontWeight: '700',
      textAlign: 'left',
      lineHeight: '30',
      maxLines: '1'
    },
    reflectionText: {
      enabled: true,
      visible: true,
      x: '72',
      y: '820',
      width: '836',
      height: '560',
      fontSize: '32',
      color: '#253558',
      fontWeight: '500',
      textAlign: 'left',
      lineHeight: '48',
      maxLines: '10',
      indentFirstLine: false
    },
    nickname: {
      enabled: true,
      visible: true,
      x: '228',
      y: '1558',
      width: '420',
      height: '54',
      fontSize: '30',
      color: '#2f6bff',
      fontWeight: '700',
      textAlign: 'left',
      lineHeight: '40',
      maxLines: '1'
    },
    avatar: {
      enabled: true,
      visible: true,
      x: '72',
      y: '1520',
      width: '128',
      height: '128',
      borderRadius: '64'
    },
    customLineText: {
      enabled: false,
      visible: false,
      x: '72',
      y: '1468',
      width: '760',
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

function mergeFieldConfig(fieldConfig, contentType = DEFAULT_CONTENT_TYPE) {
  const defaultConfig = buildDefaultFieldConfig(contentType)
  const result = {}

  Object.keys(defaultConfig).forEach((fieldKey) => {
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
      maxLines: String(source.maxLines != null ? source.maxLines : (defaultConfig[fieldKey].maxLines || '2')),
      autoBookTitleQuotes: fieldKey === 'bookTitle'
        ? (
          source.autoBookTitleQuotes === false
            ? false
            : (source.autoBookTitleQuotes === true || defaultConfig[fieldKey].autoBookTitleQuotes === true)
        )
        : undefined,
      attachToBookTitle: fieldKey === 'author'
        ? normalizeAuthorAttachMode(source.attachToBookTitle)
        : undefined,
      indentFirstLine: source.indentFirstLine === true
        ? true
        : (defaultConfig[fieldKey].indentFirstLine === true)
    }

    if (fieldKey === 'customLineText') {
      result[fieldKey].maxLines = '1'
    }
  })

  return result
}

function getDefaultTemplateName(contentType) {
  return normalizeContentType(contentType) === 'reading'
    ? '系统默认阅读打卡海报'
    : '系统默认分享海报'
}

function getDefaultTemplateDescription(contentType) {
  return getPosterMeta(contentType).templateSourceBuiltinText
}

function buildDefaultTemplate(contentType = DEFAULT_CONTENT_TYPE) {
  const safeContentType = normalizeContentType(contentType)

  return {
    templateId: '',
    templateName: getDefaultTemplateName(safeContentType),
    contentType: safeContentType,
    description: getDefaultTemplateDescription(safeContentType),
    backgroundImageUrl: '',
    backgroundImageFileId: '',
    customLineText: '',
    canvasWidth: 1080,
    canvasHeight: 1920,
    fieldConfig: buildDefaultFieldConfig(safeContentType),
    source: 'builtin'
  }
}

function buildTemplate(template, contentType = DEFAULT_CONTENT_TYPE) {
  const safeContentType = normalizeContentType(
    normalizeText(template && template.contentType) || contentType
  )
  const defaultTemplate = buildDefaultTemplate(safeContentType)
  const source = template && typeof template === 'object' ? template : {}

  return {
    templateId: normalizeText(source.templateId || defaultTemplate.templateId),
    templateName: normalizeText(source.templateName || defaultTemplate.templateName),
    contentType: safeContentType,
    description: normalizeText(source.description || defaultTemplate.description),
    backgroundImageUrl: normalizeText(source.backgroundImageFileId || source.backgroundImageUrl || defaultTemplate.backgroundImageUrl),
    backgroundImageFileId: normalizeText(source.backgroundImageFileId || source.backgroundImageUrl || defaultTemplate.backgroundImageFileId),
    customLineText: normalizeText(source.customLineText),
    canvasWidth: Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(source.canvasWidth, defaultTemplate.canvasWidth)),
    canvasHeight: Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(source.canvasHeight, defaultTemplate.canvasHeight)),
    fieldConfig: mergeFieldConfig(source.fieldConfig, safeContentType),
    source: normalizeText(source.source || defaultTemplate.source) || 'builtin'
  }
}

function getTemplateOptionId(template, contentType = DEFAULT_CONTENT_TYPE) {
  const safeContentType = normalizeContentType(contentType || (template && template.contentType))
  const templateId = normalizeText(template && template.templateId)
  return templateId || `${BUILTIN_TEMPLATE_ID_PREFIX}${safeContentType}`
}

function buildTemplateOption(template, contentType = DEFAULT_CONTENT_TYPE) {
  const normalizedTemplate = buildTemplate(template, contentType)
  const isBuiltin = normalizedTemplate.source === 'builtin'

  return {
    ...normalizedTemplate,
    optionId: getTemplateOptionId(normalizedTemplate, contentType),
    isBuiltin,
    thumbUrl: normalizeText(normalizedTemplate.backgroundImageFileId || normalizedTemplate.backgroundImageUrl),
    badgeText: isBuiltin
      ? '系统默认'
      : (normalizedTemplate.enabled ? '已启用' : '备选模板')
  }
}

function buildTemplateBundle(templateSource, contentType = DEFAULT_CONTENT_TYPE, preferredTemplateId = '') {
  const safeContentType = normalizeContentType(contentType)
  const configuredTemplateList = templateSource && Array.isArray(templateSource.templateList)
    ? templateSource.templateList.map((item) => buildTemplateOption(item, safeContentType))
    : []
  const preferredOptionId = normalizeText(preferredTemplateId)
  const defaultTemplateOption = templateSource && templateSource.template
    ? buildTemplateOption(templateSource.template, safeContentType)
    : (
      templateSource
      && !Array.isArray(templateSource.templateList)
      && typeof templateSource === 'object'
      && Object.keys(templateSource).length
        ? buildTemplateOption(templateSource, safeContentType)
        : null
    )
  const builtinTemplateOption = buildTemplateOption(buildDefaultTemplate(safeContentType), safeContentType)
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

function getTemplateCacheKey(contentType) {
  return `${SHARE_POSTER_TEMPLATE_CACHE_PREFIX}-${normalizeContentType(contentType)}`
}

function readTemplateCache(contentType) {
  try {
    const cache = wx.getStorageSync(getTemplateCacheKey(contentType))

    if (cache && cache.payload) {
      return cache
    }

    if (normalizeContentType(contentType) === 'reading') {
      const legacyCache = wx.getStorageSync(LEGACY_READING_POSTER_TEMPLATE_CACHE_KEY)

      if (legacyCache && legacyCache.payload) {
        return legacyCache
      }
    }
  } catch (error) {
    console.error('read share poster template cache error:', error)
  }

  return null
}

function writeTemplateCache(contentType, payload) {
  if (!payload) {
    return
  }

  try {
    wx.setStorageSync(getTemplateCacheKey(contentType), {
      updatedAt: Date.now(),
      payload
    })
  } catch (error) {
    console.error('write share poster template cache error:', error)
  }
}

function isTemplateCacheFresh(cache) {
  const updatedAt = Number(cache && cache.updatedAt) || 0
  return !!updatedAt && (Date.now() - updatedAt < SHARE_POSTER_TEMPLATE_CACHE_TTL)
}

function getTemplateSourceText(template, contentType) {
  const posterMeta = getPosterMeta(contentType || (template && template.contentType))

  if (template && template.source === 'builtin') {
    return posterMeta.templateSourceBuiltinText
  }

  if (template && template.enabled !== true) {
    return `当前改用模板：${normalizeText(template.templateName) || '自定义海报模板'}`
  }

  return posterMeta.templateSourceConfiguredText
}

function normalizeTemplateCachePayload(payload, contentType, preferredTemplateId = '') {
  return buildTemplateBundle(payload, contentType, preferredTemplateId)
}

function buildFieldValueMap(record, template = {}) {
  const contentType = normalizeContentType(record && record.type)
  const posterMeta = getPosterMeta(contentType)
  const authorText = normalizeText(record && record.author)

  return {
    bookTitle: normalizeText(record && record.bookTitle) || posterMeta.defaultTitle,
    author: authorText
      ? `${posterMeta.authorLabel}  ${authorText}`
      : posterMeta.authorFallbackText,
    checkInDate: normalizeText(record && record.checkInDate)
      ? `${posterMeta.dateLabel}  ${normalizeText(record && record.checkInDate)}`
      : '',
    readingMetric: normalizeText(record && record.readingMetric),
    contentTitle: contentType === 'reading'
      ? (
        normalizeText(record && record.contentTitle)
        || normalizeText(record && record.insight)
        || normalizeText(record && record.excerpt)
        || posterMeta.recordTagText
      )
      : '',
    reflectionText: normalizeText(record && record.reflectionText) || posterMeta.reflectionFallbackText,
    nickname: `分享人  ${normalizeText(record && record.nickname) || '读书会成员'}`,
    avatar: normalizeText(record && record.avatarUrl),
    customLineText: normalizeText(template.customLineText)
  }
}

function measureTextWidth(text, fontSize) {
  return String(text || '').split('').reduce((sum, char) => sum + estimateCharWidth(char, fontSize), 0)
}

function estimateCharWidth(char, fontSize) {
  if (!char) {
    return 0
  }

  if (/\s/.test(char)) {
    return fontSize * 0.32
  }

  if (/[A-Z0-9]/.test(char)) {
    return fontSize * 0.62
  }

  if (/[a-z]/.test(char)) {
    return fontSize * 0.56
  }

  if (/[\u0000-\u00ff]/.test(char)) {
    return fontSize * 0.6
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

function drawRoundedRect(ctx, x, y, width, height, radius, fillColor) {
  buildRoundedClipPath(ctx, x, y, width, height, radius)
  ctx.setFillStyle(fillColor)
  ctx.fill()
}

function applyTextStyle(ctx, fontSize, fontWeight, color, textAlign) {
  if (ctx.setFillStyle) {
    ctx.setFillStyle(color)
  }

  if (ctx.setFontSize) {
    ctx.setFontSize(fontSize)
  }

  if (ctx.setTextAlign) {
    ctx.setTextAlign(textAlign)
  }

  if (ctx.setTextBaseline) {
    ctx.setTextBaseline('top')
  }

  ctx.font = `${fontWeight} ${fontSize}px sans-serif`
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

function resolveLineLeft(layout, lineWidth) {
  if (layout.textAlign === 'center') {
    return layout.x + ((layout.width - lineWidth) / 2)
  }

  if (layout.textAlign === 'right') {
    return layout.x + layout.width - lineWidth
  }

  return layout.x
}

function drawTextFieldWithLayout(ctx, text, config, overrides = {}) {
  const mergedLayout = buildFieldLayout({
    ...config,
    ...overrides
  })

  if (!mergedLayout.visible) {
    return null
  }

  const lines = wrapText(text, mergedLayout.width, mergedLayout.fontSize, mergedLayout.maxLines)

  if (!lines.length) {
    return null
  }

  applyTextStyle(ctx, mergedLayout.fontSize, mergedLayout.fontWeight, mergedLayout.color, mergedLayout.textAlign)
  const textX = resolveTextX(mergedLayout)
  const lineWidthList = lines.map((line) => measureTextWidth(line, mergedLayout.fontSize))

  lines.forEach((line, index) => {
    ctx.fillText(line, textX, mergedLayout.y + (index * mergedLayout.lineHeight))
  })

  return {
    layout: mergedLayout,
    lineList: lines,
    lineWidthList
  }
}

function drawTextField(ctx, text, config, overrides = {}) {
  drawTextFieldWithLayout(ctx, text, config, overrides)
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
    loading: true,
    generating: false,
    saving: false,
    errorMessage: '',
    posterMeta: getPosterMeta(DEFAULT_CONTENT_TYPE),
    record: buildDefaultRecord(),
    templateName: '分享海报模板',
    templateSourceText: '',
    templateOptionList: [],
    selectedTemplateId: '',
    posterImagePath: '',
    canvasStyleWidthPx: 1080,
    canvasStyleHeightPx: 1920,
    pixelRatio: 1
  },

  onLoad(options = {}) {
    showPageShareMenu({
      timeline: false
    })
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()

    if (eventChannel && eventChannel.on) {
      const handlePosterSource = ({ record }) => {
        if (record) {
          this.initializePoster(record)
        }
      }

      eventChannel.on('acceptSharePosterSource', handlePosterSource)
      eventChannel.on('acceptReadingPosterSource', handlePosterSource)
    }

    const recordId = normalizeText(options.id)
    const recordType = normalizeText(options.type)
    const cachedSource = readSharePosterSource(recordId, recordType)

    if (cachedSource) {
      this.initializePoster(cachedSource)
      return
    }

    this.updateNavigationTitle(recordType || DEFAULT_CONTENT_TYPE)

    setTimeout(() => {
      if (this._posterSourceReady) {
        return
      }

      this.setData({
        loading: false,
        posterMeta: getPosterMeta(recordType || DEFAULT_CONTENT_TYPE),
        errorMessage: getPosterMeta(recordType || DEFAULT_CONTENT_TYPE).missingRecordMessage
      })
    }, 120)
  },

  updateNavigationTitle(contentType) {
    try {
      wx.setNavigationBarTitle({
        title: getPosterMeta(contentType).navTitle
      })
    } catch (error) {
      console.error('setNavigationBarTitle error:', error)
    }
  },

  initializePoster(record) {
    const nextRecord = buildSharePosterSource(record)
    const currentRecord = this.data.record || {}

    if (
      this._posterSourceReady
      && normalizeText(currentRecord._id) === normalizeText(nextRecord._id)
      && normalizeContentType(currentRecord.type) === normalizeContentType(nextRecord.type)
    ) {
      return
    }

    this._posterSourceReady = true

    this.updateNavigationTitle(nextRecord.type)

    this.setData({
      record: nextRecord,
      posterMeta: getPosterMeta(nextRecord.type),
      posterImagePath: '',
      errorMessage: '',
      templateOptionList: [],
      selectedTemplateId: ''
    }, () => {
      this.loadTemplateAndGenerate({
        force: true
      })
    })
  },

  async loadTemplateAndGenerate(options = {}) {
    const record = this.data.record || {}
    const posterMeta = getPosterMeta(record.type)
    const preferredTemplateId = normalizeText(options.templateOptionId || this.data.selectedTemplateId)
    let templateBundle = null

    if (!record._id) {
      this.setData({
        loading: false,
        generating: false,
        errorMessage: posterMeta.missingRecordMessage
      })
      return
    }

    this.setData({
      loading: !this.data.posterImagePath,
      generating: true,
      errorMessage: ''
    })

    try {
      templateBundle = await this.loadShareTemplate(record.type, options.force === true, preferredTemplateId)

      this.setData({
        templateOptionList: templateBundle.templateList,
        selectedTemplateId: templateBundle.selectedTemplateId
      })

      await this.generatePoster(templateBundle.template)

      this.setData({
        loading: false,
        generating: false,
        errorMessage: ''
      })
    } catch (error) {
      console.error('loadTemplateAndGenerate error:', error)
      this.setData({
        loading: false,
        generating: false,
        templateOptionList: templateBundle ? templateBundle.templateList : this.data.templateOptionList,
        selectedTemplateId: templateBundle ? templateBundle.selectedTemplateId : this.data.selectedTemplateId,
        errorMessage: error.message || posterMeta.generateErrorMessage
      })
    }
  },

  async loadShareTemplate(contentType, forceRefresh = false, preferredTemplateId = '') {
    const safeContentType = normalizeContentType(contentType)
    const cachedTemplate = readTemplateCache(safeContentType)

    if (!forceRefresh && cachedTemplate && cachedTemplate.payload && isTemplateCacheFresh(cachedTemplate)) {
      return normalizeTemplateCachePayload(cachedTemplate.payload, safeContentType, preferredTemplateId)
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'getActivityPosterTemplate',
        data: {
          contentType: safeContentType
        }
      })
      const result = res.result || {}

      if (!result.success) {
        throw new Error(result.message || `${getPosterMeta(safeContentType).contentTypeText}海报模板加载失败`)
      }

      const templateBundle = buildTemplateBundle({
        template: result.template,
        templateList: Array.isArray(result.templateList) ? result.templateList : []
      }, safeContentType, preferredTemplateId)
      writeTemplateCache(safeContentType, templateBundle)
      return templateBundle
    } catch (error) {
      console.error('load share poster template error:', error)

      if (!forceRefresh && cachedTemplate && cachedTemplate.payload) {
        return normalizeTemplateCachePayload(cachedTemplate.payload, safeContentType, preferredTemplateId)
      }

      return buildTemplateBundle(buildDefaultTemplate(safeContentType), safeContentType, preferredTemplateId)
    }
  },

  onTemplateOptionTap(e) {
    const templateOptionId = normalizeText(e.currentTarget.dataset.optionId)

    if (!templateOptionId || templateOptionId === this.data.selectedTemplateId || this.data.generating) {
      return
    }

    this.setData({
      selectedTemplateId: templateOptionId
    }, () => {
      this.loadTemplateAndGenerate({
        templateOptionId
      })
    })
  },

  reportPosterTemplateUsage(template) {
    const normalizedTemplate = buildTemplate(template, this.data.record.type)
    const templateKey = getTemplateOptionId(normalizedTemplate, normalizedTemplate.contentType)

    if (!templateKey) {
      return
    }

    wx.cloud.callFunction({
      name: 'reportPosterTemplateUsage',
      data: {
        templateKey,
        templateId: normalizeText(normalizedTemplate.templateId),
        templateName: normalizeText(normalizedTemplate.templateName),
        contentType: normalizeContentType(normalizedTemplate.contentType),
        previewImageUrl: normalizeText(normalizedTemplate.backgroundImageFileId || normalizedTemplate.backgroundImageUrl),
        source: normalizeText(normalizedTemplate.source)
      }
    }).catch((error) => {
      console.warn('reportPosterTemplateUsage error:', error)
    })
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

  drawPosterBackground(ctx, logicalWidth, logicalHeight, backgroundPath) {
    if (backgroundPath) {
      ctx.setFillStyle('#ffffff')
      ctx.fillRect(0, 0, logicalWidth, logicalHeight)
      ctx.drawImage(backgroundPath, 0, 0, logicalWidth, logicalHeight)
      return
    }

    const pageGradient = ctx.createLinearGradient(0, 0, logicalWidth, logicalHeight)
    pageGradient.addColorStop(0, '#eef4ff')
    pageGradient.addColorStop(0.55, '#f7faff')
    pageGradient.addColorStop(1, '#ffffff')
    ctx.setFillStyle(pageGradient)
    ctx.fillRect(0, 0, logicalWidth, logicalHeight)

    ctx.setFillStyle('rgba(92, 136, 255, 0.16)')
    ctx.beginPath()
    ctx.arc(logicalWidth - 120, 180, 180, 0, Math.PI * 2)
    ctx.fill()

    ctx.setFillStyle('rgba(78, 121, 255, 0.1)')
    ctx.beginPath()
    ctx.arc(160, logicalHeight - 160, 220, 0, Math.PI * 2)
    ctx.fill()

    drawRoundedRect(ctx, 48, 88, logicalWidth - 96, logicalHeight - 160, 44, 'rgba(255, 255, 255, 0.94)')
    drawRoundedRect(ctx, 72, 720, logicalWidth - 144, 720, 36, '#f5f8ff')
    drawRoundedRect(ctx, 72, 1492, logicalWidth - 144, 192, 32, '#eef4ff')
  },

  drawPosterDecorations(ctx, logicalWidth, contentType) {
    const posterMeta = getPosterMeta(contentType)

    drawRoundedRect(ctx, 84, 136, 316, 56, 28, 'rgba(232, 240, 255, 0.98)')
    applyTextStyle(ctx, 24, '700', '#5f79bc', 'left')
    ctx.fillText(posterMeta.heroKicker, 114, 152)

    drawRoundedRect(ctx, logicalWidth - 276, 136, 192, 56, 28, 'rgba(47, 107, 255, 0.96)')
    applyTextStyle(ctx, 24, '700', '#ffffff', 'center')
    ctx.fillText('POSTER', logicalWidth - 180, 152)

    applyTextStyle(ctx, 24, '700', '#90a4cc', 'left')
    ctx.fillText(posterMeta.heroSubtitle, 84, 224)

    if (contentType === 'reading') {
      drawRoundedRect(ctx, 84, 748, 244, 48, 24, 'rgba(47, 107, 255, 0.08)')
    }

    applyTextStyle(ctx, 26, '700', '#b4c2de', 'center')
    ctx.fillText('“', logicalWidth / 2, 828)
  },

  async generatePoster(template) {
    const normalizedTemplate = buildTemplate(template, this.data.record.type)
    const pixelRatio = clampNumber(getCanvasPixelRatio(), 1, 2)
    const logicalWidth = normalizedTemplate.canvasWidth
    const logicalHeight = normalizedTemplate.canvasHeight
    const exportWidth = Math.round(logicalWidth * pixelRatio)
    const exportHeight = Math.round(logicalHeight * pixelRatio)
    let backgroundPath = ''
    let avatarPath = ''

    try {
      backgroundPath = await this.resolveBackgroundPath(normalizedTemplate)
    } catch (error) {
      console.error('resolve share poster background error:', error)
    }

    const avatarFieldConfig = normalizedTemplate.fieldConfig && normalizedTemplate.fieldConfig.avatar

    if (
      avatarFieldConfig
      && avatarFieldConfig.enabled !== false
      && avatarFieldConfig.visible !== false
      && this.data.record.avatarUrl
    ) {
      try {
        avatarPath = await this.resolveImagePath(this.data.record.avatarUrl)
      } catch (error) {
        console.error('resolve share poster avatar error:', error)
      }
    }

    await new Promise((resolve) => {
      this.setData({
        posterMeta: getPosterMeta(normalizedTemplate.contentType),
        templateName: normalizedTemplate.templateName,
        templateSourceText: getTemplateSourceText(normalizedTemplate, normalizedTemplate.contentType),
        canvasStyleWidthPx: exportWidth,
        canvasStyleHeightPx: exportHeight,
        pixelRatio
      }, resolve)
    })

    await new Promise((resolve) => {
      setTimeout(resolve, 30)
    })

    const ctx = wx.createCanvasContext('activityPosterCanvas')
    ctx.save()
    ctx.scale(pixelRatio, pixelRatio)

    this.drawPosterBackground(ctx, logicalWidth, logicalHeight, backgroundPath)

    if (!backgroundPath) {
      this.drawPosterDecorations(ctx, logicalWidth, normalizedTemplate.contentType)
    }

    const fieldValueMap = buildFieldValueMap(this.data.record, normalizedTemplate)
    const fieldConfig = normalizedTemplate.fieldConfig || buildDefaultFieldConfig()

    if (normalizedTemplate.contentType === 'reading') {
      const posterMeta = getPosterMeta(normalizedTemplate.contentType)
      const titleConfig = fieldConfig.bookTitle || null
      const authorConfig = fieldConfig.author || null
      const titleText = formatPosterBookTitle(
        normalizeText(this.data.record.bookTitle) || posterMeta.defaultTitle,
        normalizedTemplate.contentType,
        titleConfig || {}
      )
      const titleDrawResult = titleConfig && titleConfig.enabled !== false && titleConfig.visible !== false
        ? drawTextFieldWithLayout(ctx, titleText, titleConfig)
        : null

      if (authorConfig && authorConfig.enabled !== false && authorConfig.visible !== false) {
        const authorText = normalizeText(this.data.record.author) || posterMeta.authorFallbackText
        const authorAttachMode = normalizeAuthorAttachMode(authorConfig.attachToBookTitle)

        if (authorText) {
          if (authorAttachMode !== 'none' && titleDrawResult && titleDrawResult.lineList.length) {
            const referenceLineIndex = authorAttachMode === 'left'
              ? 0
              : (titleDrawResult.lineList.length - 1)
            const referenceLineWidth = titleDrawResult.lineWidthList[referenceLineIndex] || 0
            const referenceLineLeft = resolveLineLeft(titleDrawResult.layout, referenceLineWidth)
            const referenceLineTop = titleDrawResult.layout.y + (referenceLineIndex * titleDrawResult.layout.lineHeight)
            const authorFontSize = Math.max(12, toNumber(authorConfig.fontSize, 28))
            const authorWidth = Math.max(
              toNumber(authorConfig.width, 200),
              Math.round(measureTextWidth(authorText, authorFontSize) + Math.max(12, titleDrawResult.layout.fontSize * 0.24))
            )
            const gap = Math.max(12, Math.round(titleDrawResult.layout.fontSize * 0.24))
            const authorHeight = Math.max(authorFontSize + 8, toNumber(authorConfig.height, authorFontSize + 8))
            const authorX = authorAttachMode === 'left'
              ? clampNumber(referenceLineLeft - gap - authorWidth, 0, Math.max(0, logicalWidth - authorWidth))
              : clampNumber(referenceLineLeft + referenceLineWidth + gap, 0, Math.max(0, logicalWidth - authorWidth))
            const authorY = clampNumber(
              referenceLineTop + Math.round((titleDrawResult.layout.fontSize - authorFontSize) / 2),
              0,
              Math.max(0, logicalHeight - authorHeight)
            )

            drawTextField(ctx, authorText, authorConfig, {
              x: authorX,
              y: authorY,
              width: authorWidth,
              height: authorHeight,
              textAlign: 'left'
            })
          } else {
            drawTextField(ctx, authorText, authorConfig)
          }
        }
      }
    }

    SHARE_FIELD_POOL.forEach((field) => {
      const currentConfig = fieldConfig[field.key] || {}
      const currentValue = field.key === 'avatar' ? avatarPath : fieldValueMap[field.key]

      if (field.kind === 'image') {
        drawImageField(ctx, currentValue, currentConfig)
        return
      }

      if (normalizedTemplate.contentType === 'reading' && (field.key === 'bookTitle' || field.key === 'author')) {
        return
      }

      drawTextField(ctx, field.key === 'reflectionText' ? formatParagraphText(currentValue, currentConfig) : currentValue, currentConfig)
    })

    ctx.restore()

    const posterImagePath = await new Promise((resolve, reject) => {
      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'activityPosterCanvas',
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

    this.reportPosterTemplateUsage(normalizedTemplate)
  },

  onRetryTap() {
    this.loadTemplateAndGenerate({
      force: true
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
      console.error('save share poster error:', error)
      wx.showToast({
        title: error.message || '保存海报失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        saving: false
      })
    }
  },

  getPosterShareConfig() {
    const record = this.data.record || buildDefaultRecord()
    const contentType = normalizeContentType(record.type)
    const titleText = normalizeText(record.bookTitle || record.title || record.contentTitle)
    const titleMap = {
      reading: titleText ? `阅读打卡海报｜${titleText}` : '阅读打卡海报｜来自校园读书会',
      life: titleText ? `生活分享海报｜${titleText}` : '生活分享海报｜来自校园读书会',
      reward: titleText ? `奖励晒单海报｜${titleText}` : '奖励晒单海报｜来自校园读书会'
    }

    return {
      title: titleMap[contentType] || '校园读书会分享海报',
      path: '/pages/home/home',
      shareLanding: SHARE_LANDING_HOME,
      imageUrl: pickShareImage(this.data.posterImagePath, record.coverUrl, (record.images || [])[0])
    }
  },

  onShareAppMessage() {
    return buildShareAppMessage(this.getPosterShareConfig())
  }
})
