const {
  buildPrivacyReminderData,
  privacyReminderMethods
} = require('../../utils/privacy')
const {
  MIN_POSTER_CANVAS_SIZE,
  CONTENT_TYPE_OPTIONS,
  AUTHOR_ATTACH_OPTIONS,
  DEFAULT_ACTIVITY_TEMPLATE_STYLE,
  ACTIVITY_TEMPLATE_STYLE_OPTIONS,
  getFieldPool,
  normalizeActivityTemplateStyle,
  getActivityTemplateStyleText,
  normalizeText,
  normalizeAuthorAttachMode,
  getContentTypeText,
  normalizeContentType,
  toNumber,
  getDefaultCanvasConfig,
  mergeFieldConfig,
  buildActivityTemplatePreset,
  buildActivityDefaultFieldConfig,
  buildDefaultFieldConfig
} = require('../../utils/posterTemplateSchema')
const {
  getPosterManageData,
  savePosterTemplate,
  uploadPosterAsset
} = require('./service')

const POSTER_MANAGE_CACHE_KEY = 'posterManageCacheV1'
const PREVIEW_BASE_WIDTH_RPX = 640
const MIN_PREVIEW_FIELD_SIZE = 48
const PREVIEW_RESIZE_MODE_OPTIONS = [
  { label: '固定字号', value: 'fixedFont' },
  { label: '随框缩放', value: 'scaleFont' }
]

const TEMPLATE_STATUS_FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '启用', value: 'enabled' },
  { label: '停用', value: 'disabled' }
]

const TEXT_ALIGN_OPTIONS = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right' }
]

const FONT_WEIGHT_OPTIONS = [
  { label: '400 细', value: '400' },
  { label: '500 常规', value: '500' },
  { label: '600 偏粗', value: '600' },
  { label: '700 加粗', value: '700' }
]

const FORM_PREVIEW_ID = '__FORM__'

const SAMPLE_DATA_MAP = {
  reading: {
    bookTitle: '暮色中的阅读',
    contentTitle: '一句话感悟或者摘抄',
    author: '艾米莉·狄金森',
    checkInDate: '2026-03-22',
    reflectionText: '晚饭后重新翻开那本读到一半的小说，窗外的风把阳台晾着的衬衫吹得轻轻摆动，我忽然觉得今天整个人也像书页一样，被一种并不喧闹的节奏慢慢摊平了。作者写黄昏时并没有刻意渲染情绪，只是把街道、灯影、脚步和一句没说出口的话并排放着，可我读到那里时，心里却像被什么细小的东西碰了一下，原来真正有力量的段落，往往不是声势很大，而是让人愿意停下来，把自己的生活也一起照进去。\n\n我在这几页里最喜欢的，是人物面对犹豫时那种并不急着给答案的诚实。很多时候我们总想立刻判断一段关系值不值得继续，一件事情要不要马上结束，仿佛只有果断才能证明自己清醒，可这本书提醒我，迟疑也可能是一种认真，是因为真的把眼前的人和事放在了心上，所以才舍不得草率地下结论。读到这里的时候，我想到最近几次与朋友的对话，那些原本让我有些不安的沉默，好像也因为这一段文字而被重新理解了。\n\n合上书之后，我没有马上去做别的事，而是坐在桌边把刚才划线的句子又看了一遍。阅读带来的变化常常不是立刻发生的，它更像一粒很安静的种子，被放进心里以后，会在往后的某一天突然发芽。也许明天醒来时我仍旧要面对琐碎的工作和重复的流程，但今晚这一小段安静的阅读，已经替我把心收回来了。能够在普通的一天里，借着别人的句子重新看见自己的感受，本身就是一件非常值得珍惜的事。',
    nickname: '周周',
    readingMetric: '阅读时长 45 分钟',
    avatar: '',
    customLineText: '管理员自定义文案示例'
  },
  life: {
    bookTitle: '春夜散步',
    contentTitle: '',
    author: '生活分享',
    checkInDate: '2026-03-22',
    reflectionText: '在湖边散步时忽然想把今天的风景留给明天，所以记录下这一刻的心情。',
    nickname: '周周',
    readingMetric: '分享 6 张图',
    avatar: '',
    customLineText: '管理员自定义文案示例'
  },
  reward: {
    bookTitle: '奖励晒单',
    contentTitle: '',
    author: '奖励分享',
    checkInDate: '2026-03-22',
    reflectionText: '收到奖励的时候像把整个春天捧在手里，想把这份开心也分享出去。',
    nickname: '周周',
    readingMetric: '阅读页数 36 页',
    avatar: '',
    customLineText: '管理员自定义文案示例'
  },
  blindPoemA: {
    modeText: '创作互动模式A',
    createdAtText: '2026-03-17 10:25',
    statusTagText: '结果已生成',
    promptText: '请写一句你此刻想到的短诗，不必押韵，也不必解释。',
    resultContent: '1111\n真好啊，真好，我是邓明佳',
    myContent: '1111',
    partnerContent: '真好啊，真好，我是邓明佳',
    customLineText: '管理员自定义文案示例'
  },
  blindPoemC: {
    modeText: '创作互动模式C',
    createdAtText: '2026-03-18 14:05',
    statusTagText: '结果已生成',
    promptText: '同一题面，也能写出完全不同的心绪。',
    resultContent: '同题：春风\n\n作品一：风从纸边翻过去。\n\n作品二：夜里灯光也有温度。',
    myContent: '风从纸边翻过去。',
    partnerContent: '夜里灯光也有温度。',
    customLineText: '管理员自定义文案示例'
  },
  poemPancake: {
    themeText: '诗词摊煎饼',
    activityTimeText: '2026-04-12 19:30 - 2026-04-18 22:00',
    snapshotImage: '',
    shareUserAvatar: '',
    shareTimeText: '分享时间  2026-04-12 21:08',
    contributionText: '贡献度  18.4%',
    totalCharsText: '当前总字数  87',
    activityQrCode: '',
    customLineText: '管理员自定义文案示例'
  },
  activity: {
    activityTitle: '第2期主题共读',
    activityTime: '2026-03-22 19:00',
    activityLocation: '图书馆共享阅读区',
    activitySummary: '围绕春日主题展开轻量共读与交流，适合在海报上快速传达活动主题、时间与地点。',
    activityCover: '',
    activityMode: '活动形式  线下',
    activityTag: '活动标签  春日主题共读',
    organizerName: '主办方  校园读书会',
    activityQrCode: '',
    signupPrompt: '报名提示  报名中，欢迎扫码或进入小程序报名',
    activityStatusTag: '活动状态  报名中',
    attendeeInfo: '活动人数  已报名 24 人',
    customLineText: '管理员自定义文案示例'
  }
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

function normalizeTemplateStatusFilter(value) {
  const safeValue = normalizeText(value)
  return TEMPLATE_STATUS_FILTER_OPTIONS.some((item) => item.value === safeValue)
    ? safeValue
    : 'all'
}

function filterTemplateList(templateList, statusFilter = 'all') {
  const safeFilter = normalizeTemplateStatusFilter(statusFilter)

  if (safeFilter === 'enabled') {
    return (templateList || []).filter((item) => item.enabled === true)
  }

  if (safeFilter === 'disabled') {
    return (templateList || []).filter((item) => item.enabled !== true)
  }

  return Array.isArray(templateList) ? templateList.slice() : []
}

function getContentTypeIndex(value) {
  const index = CONTENT_TYPE_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 0 : index
}

function getTextAlignIndex(value) {
  const index = TEXT_ALIGN_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 0 : index
}

function getTextAlignLabel(value) {
  const target = TEXT_ALIGN_OPTIONS.find((item) => item.value === value)
  return target ? target.label : '左对齐'
}

function getFontWeightIndex(value) {
  const index = FONT_WEIGHT_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 2 : index
}

function getAuthorAttachIndex(value) {
  const index = AUTHOR_ATTACH_OPTIONS.findIndex((item) => item.value === normalizeAuthorAttachMode(value))
  return index === -1 ? 0 : index
}

function getAuthorAttachLabel(value) {
  const target = AUTHOR_ATTACH_OPTIONS.find((item) => item.value === normalizeAuthorAttachMode(value))
  return target ? target.label : '独立摆放'
}

function normalizeNumberText(value, fallback) {
  const safeValue = normalizeText(value)
  return safeValue || String(fallback)
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeCanvasSize(value, fallback) {
  return Math.max(MIN_POSTER_CANVAS_SIZE, Math.round(toNumber(value, fallback)))
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function getImageInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: (res) => {
        resolve({
          width: normalizeCanvasSize(res.width, 1080),
          height: normalizeCanvasSize(res.height, 1920)
        })
      },
      fail: reject
    })
  })
}

function buildCollapsedFieldKeyMap(contentType = 'reading', source = {}) {
  return getFieldPool(contentType).reduce((result, field) => {
    result[field.key] = typeof source[field.key] === 'boolean' ? source[field.key] : true
    return result
  }, {})
}

function scaleNumericText(value, ratio, fallback, minValue = 0) {
  const scaledValue = Math.round(toNumber(value, fallback) * ratio)
  return String(Math.max(minValue, scaledValue))
}

function resizeFieldConfig(fieldConfig, contentType = 'reading', templateStyle = DEFAULT_ACTIVITY_TEMPLATE_STYLE, canvasWidth, canvasHeight, nextCanvasWidth, nextCanvasHeight) {
  const normalizedFieldConfig = mergeFieldConfig(fieldConfig, contentType, templateStyle)
  const safeCanvasWidth = Math.max(1, toNumber(canvasWidth, contentType === 'activity' ? 1080 : 1080))
  const safeCanvasHeight = Math.max(1, toNumber(canvasHeight, contentType === 'activity' ? 1920 : 1920))
  const safeNextCanvasWidth = normalizeCanvasSize(nextCanvasWidth, safeCanvasWidth)
  const safeNextCanvasHeight = normalizeCanvasSize(nextCanvasHeight, safeCanvasHeight)
  const scaleX = safeNextCanvasWidth / safeCanvasWidth
  const scaleY = safeNextCanvasHeight / safeCanvasHeight
  const scaleRatio = Math.min(scaleX, scaleY)
  const nextFieldConfig = {}

  getFieldPool(contentType).forEach((field) => {
    const currentConfig = normalizedFieldConfig[field.key]

    if (!currentConfig) {
      return
    }

    if (currentConfig.locked === true) {
      nextFieldConfig[field.key] = {
        ...currentConfig
      }
      return
    }

    const resizedConfig = {
      ...currentConfig,
      x: scaleNumericText(currentConfig.x, scaleX, 0, 0),
      y: scaleNumericText(currentConfig.y, scaleY, 0, 0),
      width: scaleNumericText(currentConfig.width, scaleX, 0, 1),
      height: scaleNumericText(currentConfig.height, scaleY, 0, 1)
    }

    if (field.kind === 'image') {
      resizedConfig.borderRadius = scaleNumericText(currentConfig.borderRadius, scaleRatio, 0, 0)
    } else {
      resizedConfig.fontSize = scaleNumericText(currentConfig.fontSize, scaleRatio, 28, 12)
      resizedConfig.lineHeight = scaleNumericText(currentConfig.lineHeight, scaleRatio, 40, 16)
    }

    nextFieldConfig[field.key] = resizedConfig
  })

  return nextFieldConfig
}

function getPreviewVisibleLineCount(config) {
  const lineHeight = Math.max(1, toNumber(config.lineHeight, 40))
  const height = Math.max(MIN_PREVIEW_FIELD_SIZE, toNumber(config.height, 60))
  const maxLines = Math.max(1, Math.round(toNumber(config.maxLines, 2)))
  return Math.max(1, Math.min(maxLines, Math.floor(height / lineHeight) || 1))
}

function estimateTextCapacity(config) {
  const width = Math.max(MIN_PREVIEW_FIELD_SIZE, toNumber(config.width, 200))
  const fontSize = Math.max(12, toNumber(config.fontSize, 28))
  const visibleLines = getPreviewVisibleLineCount(config)
  const charsPerLine = Math.max(1, Math.floor(width / Math.max(fontSize * 0.92, 1)))

  return {
    charsPerLine,
    visibleLines,
    totalChars: charsPerLine * visibleLines
  }
}

function getPreviewTextMetrics(config, scale) {
  const fontSize = Math.max(10, Math.round(toNumber(config.fontSize, 28) * scale))
  const lineHeight = Math.max(fontSize + 2, Math.round(toNumber(config.lineHeight, 38) * scale))
  const height = Math.max(lineHeight + 4, Math.round(toNumber(config.height, 40) * scale))

  return {
    fontSize,
    lineHeight,
    height
  }
}

function estimatePreviewCharWidth(char, fontSize) {
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

function measurePreviewTextWidth(text, fontSize) {
  return String(text || '').split('').reduce((sum, char) => {
    return sum + estimatePreviewCharWidth(char, fontSize)
  }, 0)
}

function wrapPreviewText(text, maxWidth, fontSize, maxLines) {
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

    const charWidth = estimatePreviewCharWidth(char, fontSize)

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

  return lines.slice(0, Math.max(1, maxLines))
}

function resolvePreviewLineLeft(layout, lineWidth) {
  if (layout.textAlign === 'center') {
    return layout.left + Math.round((layout.width - lineWidth) / 2)
  }

  if (layout.textAlign === 'right') {
    return layout.left + layout.width - lineWidth
  }

  return layout.left
}

function buildPreviewTextLayerItem(key, text, config, scale, positionOverride = {}) {
  const metrics = getPreviewTextMetrics(config, scale)
  const layout = {
    left: positionOverride.left != null ? positionOverride.left : Math.round(toNumber(config.x, 0) * scale),
    top: positionOverride.top != null ? positionOverride.top : Math.round(toNumber(config.y, 0) * scale),
    width: positionOverride.width != null ? positionOverride.width : Math.round(toNumber(config.width, 200) * scale),
    height: positionOverride.height != null ? positionOverride.height : metrics.height,
    fontSize: positionOverride.fontSize != null ? positionOverride.fontSize : metrics.fontSize,
    lineHeight: positionOverride.lineHeight != null ? positionOverride.lineHeight : metrics.lineHeight,
    textAlign: positionOverride.textAlign || config.textAlign || 'left'
  }
  const visibleLines = getPreviewVisibleLineCount(config)
  const lineList = wrapPreviewText(text, layout.width, layout.fontSize, visibleLines)
  const lineWidthList = lineList.map((line) => measurePreviewTextWidth(line, layout.fontSize))

  return {
    key,
    text: formatParagraphText(text, config),
    style: [
      `left:${layout.left}rpx`,
      `top:${layout.top}rpx`,
      `width:${layout.width}rpx`,
      `height:${layout.height}rpx`,
      `font-size:${layout.fontSize}rpx`,
      `color:${config.color || '#17306a'}`,
      `font-weight:${config.fontWeight || '600'}`,
      `text-align:${layout.textAlign}`,
      `line-height:${layout.lineHeight}rpx`,
      `-webkit-line-clamp:${visibleLines}`
    ].join(';'),
    layout,
    lineList,
    lineWidthList
  }
}

function formatPreviewBookTitle(text, contentType, config) {
  const safeText = normalizeText(text)

  if (!safeText) {
    return ''
  }

  if (contentType === 'reading' && config && config.autoBookTitleQuotes !== false) {
    return `《${safeText}》`
  }

  return safeText
}

function buildPreviewFrameStyle(config, scale, kind = 'text') {
  const left = Math.round(toNumber(config.x, 0) * scale)
  const top = Math.round(toNumber(config.y, 0) * scale)
  const width = Math.max(24, Math.round(toNumber(config.width, 80) * scale))
  const height = kind === 'text'
    ? getPreviewTextMetrics(config, scale).height
    : Math.max(24, Math.round(toNumber(config.height, 80) * scale))
  const borderRadius = Math.round(toNumber(config.borderRadius, 0) * scale)

  return [
    `left:${left}rpx`,
    `top:${top}rpx`,
    `width:${width}rpx`,
    `height:${height}rpx`,
    `border-radius:${borderRadius}rpx`
  ].join(';')
}

function buildPreviewFrameList(fieldConfig, contentType, scale) {
  return getFieldPool(contentType).reduce((result, field) => {
    const currentConfig = fieldConfig[field.key]

    if (!currentConfig || currentConfig.visible === false) {
      return result
    }

    const frameItem = {
      key: field.key,
      label: field.label,
      kind: field.kind,
      locked: currentConfig.locked === true,
      style: buildPreviewFrameStyle(currentConfig, scale, field.kind),
      metaText: '',
      capacityText: '',
      compactText: ''
    }

    if (field.kind === 'text') {
      const capacity = estimateTextCapacity(currentConfig)
      frameItem.metaText = `${toNumber(currentConfig.fontSize, 28)}号字 · ${getTextAlignLabel(currentConfig.textAlign)}`
      frameItem.capacityText = `约 ${capacity.totalChars} 字，每行约 ${capacity.charsPerLine} 字`
      frameItem.compactText = `${capacity.visibleLines} 行`
    } else {
      frameItem.metaText = `${toNumber(currentConfig.width, 0)} × ${toNumber(currentConfig.height, 0)}`
      frameItem.capacityText = '可拖动或缩放图片区域'
      frameItem.compactText = '图片'
    }

    result.push(frameItem)
    return result
  }, [])
}

function buildDefaultForm(contentType = 'reading', templateStyle = DEFAULT_ACTIVITY_TEMPLATE_STYLE) {
  const normalizedStyle = normalizeActivityTemplateStyle(templateStyle)
  const defaultCanvasConfig = getDefaultCanvasConfig(contentType, normalizedStyle)

  return {
    templateId: '',
    templateName: '',
    contentType,
    contentTypeIndex: getContentTypeIndex(contentType),
    templateStyle: contentType === 'activity' ? normalizedStyle : '',
    templateStyleIndex: ACTIVITY_TEMPLATE_STYLE_OPTIONS.findIndex((item) => item.value === normalizedStyle),
    enabled: false,
    description: '',
    backgroundImageUrl: '',
    backgroundImageFileId: '',
    miniProgramCodeUrl: '',
    miniProgramCodeFileId: '',
    customLineText: '',
    canvasWidth: defaultCanvasConfig.canvasWidth,
    canvasHeight: defaultCanvasConfig.canvasHeight,
    fieldConfig: buildDefaultFieldConfig(contentType, normalizedStyle)
  }
}

function normalizeTemplateForm(form) {
  const rawContentType = normalizeText(form.contentType)
  const contentType = CONTENT_TYPE_OPTIONS.some((item) => item.value === rawContentType)
    ? rawContentType
    : 'reading'
  const templateStyle = contentType === 'activity'
    ? normalizeActivityTemplateStyle(form.templateStyle)
    : ''
  const defaultForm = buildDefaultForm(contentType, templateStyle)

  return {
    templateId: normalizeText(form.templateId),
    templateName: normalizeText(form.templateName),
    contentType,
    contentTypeIndex: getContentTypeIndex(contentType),
    templateStyle,
    templateStyleIndex: ACTIVITY_TEMPLATE_STYLE_OPTIONS.findIndex((item) => item.value === templateStyle),
    enabled: form.enabled === true,
    description: normalizeText(form.description),
    backgroundImageUrl: normalizeText(form.backgroundImageFileId || form.backgroundImageUrl),
    backgroundImageFileId: normalizeText(form.backgroundImageFileId || form.backgroundImageUrl),
    miniProgramCodeUrl: normalizeText(form.miniProgramCodeFileId || form.miniProgramCodeUrl),
    miniProgramCodeFileId: normalizeText(form.miniProgramCodeFileId || form.miniProgramCodeUrl),
    customLineText: normalizeText(form.customLineText),
    canvasWidth: normalizeNumberText(form.canvasWidth, defaultForm.canvasWidth),
    canvasHeight: normalizeNumberText(form.canvasHeight, defaultForm.canvasHeight),
    fieldConfig: mergeFieldConfig(form.fieldConfig, contentType, templateStyle)
  }
}

function buildFormByTemplate(template) {
  const templateStyle = template.contentType === 'activity'
    ? normalizeActivityTemplateStyle(template.templateStyle)
    : ''
  return normalizeTemplateForm({
    templateId: template.templateId || '',
    templateName: template.templateName || '',
    contentType: template.contentType || 'reading',
    templateStyle,
    enabled: !!template.enabled,
    description: template.description || '',
    backgroundImageUrl: template.backgroundImageFileId || template.backgroundImageUrl || '',
    backgroundImageFileId: template.backgroundImageFileId || template.backgroundImageUrl || '',
    miniProgramCodeUrl: template.miniProgramCodeFileId || template.miniProgramCodeUrl || '',
    miniProgramCodeFileId: template.miniProgramCodeFileId || template.miniProgramCodeUrl || '',
    customLineText: template.customLineText || '',
    canvasWidth: template.canvasWidth || '1080',
    canvasHeight: template.canvasHeight || '1920',
    fieldConfig: template.fieldConfig || buildDefaultFieldConfig(template.contentType || 'reading', templateStyle)
  })
}

function buildFieldEditorList(fieldConfig, contentType, collapsedFieldKeyMap = {}) {
  return getFieldPool(contentType).map((field) => {
    const currentConfig = fieldConfig[field.key] || {}
    const nextItem = {
      key: field.key,
      label: field.label,
      kind: field.kind,
      visible: currentConfig.enabled !== false && currentConfig.visible !== false,
      locked: currentConfig.locked === true,
      collapsed: collapsedFieldKeyMap[field.key] !== false,
      x: normalizeNumberText(currentConfig.x, '0'),
      y: normalizeNumberText(currentConfig.y, '0'),
      width: normalizeNumberText(currentConfig.width, '0'),
      height: normalizeNumberText(currentConfig.height, '0'),
      borderRadius: normalizeNumberText(currentConfig.borderRadius, '0'),
      fontSize: normalizeNumberText(currentConfig.fontSize, '28'),
      color: currentConfig.color || '#17306a',
      fontWeight: currentConfig.fontWeight || '600',
      fontWeightIndex: getFontWeightIndex(currentConfig.fontWeight),
      textAlign: currentConfig.textAlign || 'left',
      textAlignIndex: getTextAlignIndex(currentConfig.textAlign),
      authorAttachMode: normalizeAuthorAttachMode(currentConfig.attachToBookTitle),
      authorAttachIndex: getAuthorAttachIndex(currentConfig.attachToBookTitle),
      authorAttachLabel: getAuthorAttachLabel(currentConfig.attachToBookTitle),
      autoBookTitleQuotes: currentConfig.autoBookTitleQuotes !== false,
      lineHeight: normalizeNumberText(currentConfig.lineHeight, '40'),
      maxLines: normalizeNumberText(currentConfig.maxLines, '2'),
      indentFirstLine: currentConfig.indentFirstLine === true,
      capacityText: '',
      summaryText: ''
    }

    if (field.kind === 'text') {
      const capacity = estimateTextCapacity(currentConfig)
      nextItem.summaryText = `${nextItem.fontSize}号字 · ${getTextAlignLabel(nextItem.textAlign)} · ${capacity.visibleLines}行`
      nextItem.capacityText = `当前约可放 ${capacity.totalChars} 字，每行约 ${capacity.charsPerLine} 字`
      return nextItem
    }

    nextItem.summaryText = `图片区域 ${nextItem.width} × ${nextItem.height}`
    nextItem.capacityText = `可拖动位置，并拖右下角改变区域大小`
    return nextItem
  })
}

function buildPreviewTextStyle(config, scale) {
  const left = Math.round(toNumber(config.x, 0) * scale)
  const top = Math.round(toNumber(config.y, 0) * scale)
  const width = Math.round(toNumber(config.width, 200) * scale)
  const previewTextMetrics = getPreviewTextMetrics(config, scale)
  const maxLines = getPreviewVisibleLineCount(config)

  return [
    `left:${left}rpx`,
    `top:${top}rpx`,
    `width:${width}rpx`,
    `height:${previewTextMetrics.height}rpx`,
    `font-size:${previewTextMetrics.fontSize}rpx`,
    `color:${config.color || '#17306a'}`,
    `font-weight:${config.fontWeight || '600'}`,
    `text-align:${config.textAlign || 'left'}`,
    `line-height:${previewTextMetrics.lineHeight}rpx`,
    `-webkit-line-clamp:${maxLines}`
  ].join(';')
}

function buildPreviewImageStyle(config, scale) {
  const left = Math.round(toNumber(config.x, 0) * scale)
  const top = Math.round(toNumber(config.y, 0) * scale)
  const width = Math.max(40, Math.round(toNumber(config.width, 80) * scale))
  const height = Math.max(40, Math.round(toNumber(config.height, 80) * scale))
  const borderRadius = Math.round(toNumber(config.borderRadius, 0) * scale)

  return [
    `left:${left}rpx`,
    `top:${top}rpx`,
    `width:${width}rpx`,
    `height:${height}rpx`,
    `border-radius:${borderRadius}rpx`
  ].join(';')
}

function resolvePreviewImageSource(source, fieldKey, sampleData) {
  if (fieldKey === 'activityQrCode') {
    return normalizeText(source && (source.miniProgramCodeFileId || source.miniProgramCodeUrl))
  }

  return normalizeText(sampleData && sampleData[fieldKey])
}

function resolvePreviewTextSource(source, fieldKey, sampleData) {
  if (fieldKey === 'customLineText') {
    return normalizeText(source && source.customLineText)
  }

  return normalizeText(sampleData && sampleData[fieldKey])
}

function buildPreviewModel(source) {
  if (!source) {
    return {
      backgroundImageUrl: '',
      previewHeightRpx: 760,
      textLayerList: [],
      imageLayerList: [],
      miniProgramCodeLayer: null,
      frameList: []
    }
  }

  const contentType = source.contentType || 'reading'
  const fieldConfig = mergeFieldConfig(source.fieldConfig, contentType, source.templateStyle)
  const sampleData = SAMPLE_DATA_MAP[contentType] || SAMPLE_DATA_MAP.reading
  const canvasWidth = normalizeCanvasSize(source.canvasWidth, 1080)
  const canvasHeight = normalizeCanvasSize(source.canvasHeight, 1920)
  const scale = PREVIEW_BASE_WIDTH_RPX / canvasWidth
  const previewHeightRpx = Math.round(canvasHeight * scale)
  const textLayerList = []
  const imageLayerList = []
  const miniProgramCodeConfig = fieldConfig.activityQrCode || null
  const miniProgramCodeSrc = normalizeText(source.miniProgramCodeUrl || source.miniProgramCodeFileId)
  const miniProgramCodeLayer = miniProgramCodeConfig && miniProgramCodeConfig.visible !== false && miniProgramCodeSrc
    ? {
        src: miniProgramCodeSrc,
        style: buildPreviewImageStyle(miniProgramCodeConfig, scale)
      }
    : null

  if (contentType === 'reading') {
    const titleConfig = fieldConfig.bookTitle || null
    const authorConfig = fieldConfig.author || null
    const titleText = titleConfig && titleConfig.visible !== false
      ? formatPreviewBookTitle(sampleData.bookTitle, contentType, titleConfig)
      : ''
    const titleLayer = titleText && titleConfig
      ? buildPreviewTextLayerItem('bookTitle', titleText, titleConfig, scale)
      : null

    if (titleLayer) {
      textLayerList.push({
        key: titleLayer.key,
        text: titleLayer.text,
        style: titleLayer.style
      })
    }

    if (authorConfig && authorConfig.visible !== false) {
      const authorAttachMode = normalizeAuthorAttachMode(authorConfig.attachToBookTitle)
      const authorText = normalizeText(sampleData.author)

      if (authorText) {
        if (authorAttachMode !== 'none' && titleLayer && titleLayer.lineList.length) {
          const gap = Math.max(10, Math.round(titleLayer.layout.fontSize * 0.24))
          const referenceLineIndex = authorAttachMode === 'left'
            ? 0
            : (titleLayer.lineList.length - 1)
          const referenceLineWidth = titleLayer.lineWidthList[referenceLineIndex] || 0
          const referenceLineLeft = resolvePreviewLineLeft(titleLayer.layout, referenceLineWidth)
          const referenceLineTop = titleLayer.layout.top + (referenceLineIndex * titleLayer.layout.lineHeight)
          const authorMetrics = getPreviewTextMetrics(authorConfig, scale)
          const authorTextWidth = Math.max(
            Math.round(toNumber(authorConfig.width, 200) * scale),
            Math.round(measurePreviewTextWidth(authorText, authorMetrics.fontSize) + gap)
          )
          const authorLeft = authorAttachMode === 'left'
            ? Math.max(0, referenceLineLeft - gap - authorTextWidth)
            : (referenceLineLeft + referenceLineWidth + gap)
          const authorTop = Math.max(0, referenceLineTop + Math.round((titleLayer.layout.fontSize - authorMetrics.fontSize) / 2))
          const authorLayer = buildPreviewTextLayerItem('author', authorText, authorConfig, scale, {
            left: authorLeft,
            top: authorTop,
            width: authorTextWidth,
            textAlign: 'left'
          })

          textLayerList.push({
            key: authorLayer.key,
            text: authorLayer.text,
            style: authorLayer.style
          })
        } else {
          const authorLayer = buildPreviewTextLayerItem('author', authorText, authorConfig, scale)

          textLayerList.push({
            key: authorLayer.key,
            text: authorLayer.text,
            style: authorLayer.style
          })
        }
      }
    }
  }

  getFieldPool(contentType).forEach((field) => {
    const currentConfig = fieldConfig[field.key]

    if (!currentConfig || currentConfig.visible === false) {
      return
    }

    if (field.kind === 'image') {
      if (field.key === 'activityQrCode') {
        return
      }

      imageLayerList.push({
        key: field.key,
        label: field.label,
        src: resolvePreviewImageSource(source, field.key, sampleData),
        style: buildPreviewImageStyle(currentConfig, scale)
      })
      return
    }

    if (contentType === 'reading' && (field.key === 'bookTitle' || field.key === 'author')) {
      return
    }

    const textSource = resolvePreviewTextSource(source, field.key, sampleData)
    const textValue = field.key === 'bookTitle'
      ? formatPreviewBookTitle(textSource, contentType, currentConfig)
      : textSource
    const textLayer = buildPreviewTextLayerItem(field.key, textValue, currentConfig, scale)

    textLayerList.push({
      key: textLayer.key,
      text: textLayer.text,
      style: textLayer.style
    })
  })

  return {
    backgroundImageUrl: normalizeText(source.backgroundImageFileId || source.backgroundImageUrl),
    previewHeightRpx,
    templateStyleClass: contentType === 'activity'
      ? `style-${normalizeActivityTemplateStyle(source.templateStyle).replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`
      : '',
    templateStyleText: contentType === 'activity' ? getActivityTemplateStyleText(source.templateStyle) : '',
    textLayerList,
    imageLayerList,
    miniProgramCodeLayer,
    frameList: buildPreviewFrameList(fieldConfig, contentType, scale)
  }
}

function buildPreviewState(templateList, activeTemplateMap, contentType, previewTemplateId, draftForm) {
  if (
    previewTemplateId === FORM_PREVIEW_ID
    && draftForm
    && normalizeText(draftForm.contentType) === normalizeText(contentType)
  ) {
    const draftTemplateName = normalizeText(draftForm.templateName)

    return {
      previewTemplateId: FORM_PREVIEW_ID,
      activePreviewTemplateId: normalizeText(draftForm.templateId),
      activePreviewTemplateName: draftTemplateName,
      activePreviewTemplateEnabled: draftForm.enabled === true,
      activePreviewSourceText: draftForm.templateId
        ? `当前编辑：${draftTemplateName || '未命名模板'}`
        : `当前编辑：${draftTemplateName || '未保存新模板'}`,
      activePreviewBadgeText: draftForm.templateId ? '编辑中' : '新草稿',
      activePreviewModel: buildPreviewModel(draftForm)
    }
  }

  const activeTemplate = activeTemplateMap[contentType] || null
  const templateById = templateList.find((item) => item.templateId === previewTemplateId) || null
  const fallbackTemplate = templateList.find((item) => item.contentType === contentType) || null
  const targetTemplate = templateById && templateById.contentType === contentType
    ? templateById
    : (activeTemplate || fallbackTemplate)

  if (!targetTemplate) {
    return {
      previewTemplateId: '',
      activePreviewTemplateId: '',
      activePreviewTemplateName: '',
      activePreviewTemplateEnabled: false,
      activePreviewSourceText: `当前${getContentTypeText(contentType)}还没有模板`,
      activePreviewBadgeText: '未配置',
      activePreviewModel: null
    }
  }

  const isPreviewingActive = activeTemplate && activeTemplate.templateId === targetTemplate.templateId

  return {
    previewTemplateId: targetTemplate.templateId,
    activePreviewTemplateId: targetTemplate.templateId,
    activePreviewTemplateName: targetTemplate.templateName,
    activePreviewTemplateEnabled: targetTemplate.enabled === true,
    activePreviewSourceText: isPreviewingActive
      ? `默认预览：${targetTemplate.templateName}`
      : `临时预览：${targetTemplate.templateName}`,
    activePreviewBadgeText: targetTemplate.enabled ? '已启用' : '未启用',
    activePreviewModel: buildPreviewModel(targetTemplate)
  }
}

function buildSavePayload(form) {
  return {
    templateId: form.templateId,
    templateName: form.templateName,
    contentType: form.contentType,
    templateStyle: form.templateStyle,
    enabled: form.enabled,
    description: form.description,
    backgroundImageUrl: form.backgroundImageUrl,
    backgroundImageFileId: form.backgroundImageFileId,
    miniProgramCodeUrl: form.miniProgramCodeUrl,
    miniProgramCodeFileId: form.miniProgramCodeFileId,
    customLineText: form.customLineText,
    canvasWidth: form.canvasWidth,
    canvasHeight: form.canvasHeight,
    fieldConfig: cloneJson(form.fieldConfig)
  }
}

Page({
  data: {
    loading: true,
    syncing: false,
    errorMessage: '',
    saving: false,
    uploadingBackground: false,
    uploadingMiniProgramCode: false,
    togglingTemplateId: '',
    hasContent: false,
    permissionInfo: {
      superAdmin: false,
      posterManagePermission: false
    },
    templateList: [],
    filteredTemplateList: [],
    activeTemplateMap: {},
    templateStatusFilterOptions: TEMPLATE_STATUS_FILTER_OPTIONS,
    templateStatusFilter: 'all',
    contentTypeOptions: CONTENT_TYPE_OPTIONS.map((item) => item.label),
    previewContentTypeOptions: CONTENT_TYPE_OPTIONS,
    activityTemplateStyleOptions: ACTIVITY_TEMPLATE_STYLE_OPTIONS.map((item) => item.label),
    textAlignOptions: TEXT_ALIGN_OPTIONS.map((item) => item.label),
    fontWeightOptions: FONT_WEIGHT_OPTIONS.map((item) => item.label),
    authorAttachOptions: AUTHOR_ATTACH_OPTIONS.map((item) => item.label),
    activePreviewContentType: 'reading',
    previewTemplateId: '',
    activePreviewTemplateId: '',
    activePreviewTemplateName: '',
    activePreviewTemplateEnabled: false,
    activePreviewSourceText: '',
    activePreviewBadgeText: '未配置',
    activePreviewModel: null,
    previewResizeModeOptions: PREVIEW_RESIZE_MODE_OPTIONS,
    previewResizeMode: 'fixedFont',
    activePreviewFieldKey: '',
    expandedPreviewFieldKey: '',
    previewGestureFieldKey: '',
    collapsedFieldKeyMap: buildCollapsedFieldKeyMap('reading'),
    form: buildDefaultForm(),
    fieldEditorList: buildFieldEditorList(buildDefaultFieldConfig(), 'reading', buildCollapsedFieldKeyMap('reading')),
    formPreviewModel: buildPreviewModel(buildDefaultForm()),
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad(options = {}) {
    const launchContentType = normalizeContentType(options.contentType)
    this.hydratePosterManageCache()

    if (launchContentType) {
      this.pendingFormDraft = {
        contentType: launchContentType,
        templateStyle: DEFAULT_ACTIVITY_TEMPLATE_STYLE
      }
      this.pendingPreviewTarget = {
        contentType: launchContentType,
        templateId: ''
      }

      this.setData({
        templateStatusFilter: 'all'
      })

      this.setFormState(buildDefaultForm(launchContentType, DEFAULT_ACTIVITY_TEMPLATE_STYLE))
      this.setPreviewState(launchContentType, FORM_PREVIEW_ID)
    }

    this.loadManageData({
      silent: this.data.hasContent
    })
  },

  onPullDownRefresh() {
    this.loadManageData({
      stopPullDownRefresh: true
    })
  },

  hydratePosterManageCache() {
    try {
      const cache = wx.getStorageSync(POSTER_MANAGE_CACHE_KEY) || {}
      const templateList = Array.isArray(cache.templateList) ? cache.templateList : []
      const activeTemplateMap = cache.activeTemplateMap || {}
      const form = normalizeTemplateForm(cache.form || buildDefaultForm())
      const collapsedFieldKeyMap = buildCollapsedFieldKeyMap(form.contentType, cache.collapsedFieldKeyMap || {})
      const activePreviewContentType = cache.activePreviewContentType || 'reading'
      const templateStatusFilter = normalizeTemplateStatusFilter(cache.templateStatusFilter)
      const filteredTemplateList = filterTemplateList(templateList, templateStatusFilter)
      const previewState = buildPreviewState(
        templateList,
        activeTemplateMap,
        activePreviewContentType,
        cache.previewTemplateId || '',
        form
      )

      if (!templateList.length && !cache.form) {
        return
      }

      this.setData({
        permissionInfo: cache.permissionInfo || this.data.permissionInfo,
        templateList,
        filteredTemplateList,
        activeTemplateMap,
        templateStatusFilter,
        previewResizeMode: cache.previewResizeMode || this.data.previewResizeMode,
        collapsedFieldKeyMap,
        form,
        fieldEditorList: buildFieldEditorList(form.fieldConfig, form.contentType, collapsedFieldKeyMap),
        formPreviewModel: buildPreviewModel(form),
        activePreviewContentType,
        ...previewState,
        loading: false,
        syncing: false,
        errorMessage: '',
        hasContent: true
      })
    } catch (error) {
      console.warn('hydrate poster manage cache failed:', error)
    }
  },

  persistPosterManageCache() {
    try {
      wx.setStorageSync(POSTER_MANAGE_CACHE_KEY, {
        updatedAt: Date.now(),
        permissionInfo: this.data.permissionInfo,
        templateList: this.data.templateList,
        activeTemplateMap: this.data.activeTemplateMap,
        activePreviewContentType: this.data.activePreviewContentType,
        previewTemplateId: this.data.previewTemplateId,
        templateStatusFilter: this.data.templateStatusFilter,
        previewResizeMode: this.data.previewResizeMode,
        collapsedFieldKeyMap: this.data.collapsedFieldKeyMap,
        form: this.data.form
      })
    } catch (error) {
      console.warn('persist poster manage cache failed:', error)
    }
  },

  getTemplateById(templateId) {
    return (this.data.templateList || []).find((item) => item.templateId === templateId) || null
  },

  isFieldLocked(fieldKey, sourceForm) {
    const form = normalizeTemplateForm(sourceForm || this.data.form)
    return !!(form.fieldConfig[fieldKey] && form.fieldConfig[fieldKey].locked === true)
  },

  canUploadMiniProgramCode() {
    const permissionInfo = this.data.permissionInfo || {}
    return !!(permissionInfo.superAdmin || permissionInfo.posterManagePermission)
  },

  chooseAndUploadImageAsset(options = {}) {
    const {
      uploadStateKey,
      loadingTitle,
      cloudFolder,
      onSuccess,
      failTitle
    } = options

    if (!uploadStateKey || typeof onSuccess !== 'function') {
      return
    }

    if (this.data[uploadStateKey]) {
      return
    }

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (chooseRes) => {
        const tempFilePath = (chooseRes.tempFilePaths || [])[0]

        if (!tempFilePath) {
          return
        }

        this.setData({
          [uploadStateKey]: true
        })

        wx.showLoading({
          title: loadingTitle || '上传中...'
        })

        uploadPosterAsset(tempFilePath, cloudFolder || 'poster-assets').then((fileId) => {
          wx.hideLoading()
          onSuccess(fileId)
        }).catch((error) => {
          wx.hideLoading()
          console.error(`${uploadStateKey} upload error:`, error)
          wx.showToast({
            title: failTitle || '上传失败',
            icon: 'none'
          })
        }).finally(() => {
          this.setData({
            [uploadStateKey]: false
          })
        })
      }
    })
  },

  setFormState(form, callback) {
    const nextForm = normalizeTemplateForm(form)
    const formPreviewModel = buildPreviewModel(nextForm)
    const nextCollapsedFieldKeyMap = buildCollapsedFieldKeyMap(nextForm.contentType, this.data.collapsedFieldKeyMap || {})
    const nextActivePreviewFieldKey = formPreviewModel.frameList.some((item) => item.key === this.data.activePreviewFieldKey)
      ? this.data.activePreviewFieldKey
      : ''
    const nextExpandedPreviewFieldKey = formPreviewModel.frameList.some((item) => item.key === this.data.expandedPreviewFieldKey)
      ? this.data.expandedPreviewFieldKey
      : ''
    const syncDraftPreview = this.data.previewTemplateId === FORM_PREVIEW_ID
      || normalizeText(this.data.activePreviewBadgeText) === '新草稿'
      || normalizeText(this.data.activePreviewBadgeText) === '编辑中'
    const draftPreviewState = syncDraftPreview
      ? buildPreviewState(
        this.data.templateList,
        this.data.activeTemplateMap,
        nextForm.contentType,
        FORM_PREVIEW_ID,
        nextForm
      )
      : null

    this.setData({
      form: nextForm,
      collapsedFieldKeyMap: nextCollapsedFieldKeyMap,
      fieldEditorList: buildFieldEditorList(nextForm.fieldConfig, nextForm.contentType, nextCollapsedFieldKeyMap),
      formPreviewModel,
      activePreviewFieldKey: nextActivePreviewFieldKey,
      expandedPreviewFieldKey: nextExpandedPreviewFieldKey,
      ...(draftPreviewState || {})
    }, callback)
  },

  updateSingleFieldConfig(fieldKey, patch, options = {}) {
    if (!fieldKey) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)

    if (!form.fieldConfig[fieldKey]) {
      return
    }

    if (this.isFieldLocked(fieldKey, form) && options.force !== true) {
      return
    }

    form.fieldConfig[fieldKey] = {
      ...form.fieldConfig[fieldKey],
      ...patch
    }

    this.setFormState(form, () => {
      if (options.persist) {
        this.persistPosterManageCache()
      }
    })
  },

  focusFieldEditor(fieldKey, options = {}) {
    if (!fieldKey) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)

    if (!form.fieldConfig[fieldKey]) {
      return
    }

    const collapsedFieldKeyMap = {
      ...buildCollapsedFieldKeyMap(form.contentType, this.data.collapsedFieldKeyMap || {}),
      [fieldKey]: false
    }

    this.setData({
      activePreviewFieldKey: fieldKey,
      expandedPreviewFieldKey: fieldKey,
      collapsedFieldKeyMap,
      fieldEditorList: buildFieldEditorList(form.fieldConfig, form.contentType, collapsedFieldKeyMap)
    }, () => {
      if (options.persist !== false) {
        this.persistPosterManageCache()
      }

      if (options.toastTitle) {
        wx.showToast({
          title: options.toastTitle,
          icon: 'none'
        })
      }
    })
  },

  focusMiniProgramCodeField(options = {}) {
    this.focusFieldEditor('activityQrCode', options)
  },

  measureFormPreviewRect() {
    return new Promise((resolve) => {
      wx.createSelectorQuery()
        .select('#formPreviewShell')
        .boundingClientRect((rect) => {
          this.formPreviewRect = rect || null
          resolve(rect || null)
        })
        .exec()
    })
  },

  async startPreviewTouchSession(fieldKey, action, touch, kind) {
    const form = normalizeTemplateForm(this.data.form)
    const fieldConfig = form.fieldConfig[fieldKey]

    if (!fieldConfig || !touch) {
      return
    }

    const rect = await this.measureFormPreviewRect()

    if (!rect || !rect.width) {
      return
    }

    const canvasWidth = normalizeCanvasSize(form.canvasWidth, 1080)
    const previewHeightRpx = this.data.formPreviewModel && this.data.formPreviewModel.previewHeightRpx
      ? this.data.formPreviewModel.previewHeightRpx
      : 760
    const previewHeightPx = rect.width * previewHeightRpx / PREVIEW_BASE_WIDTH_RPX
    const canvasHeight = normalizeCanvasSize(form.canvasHeight, 1920)

    this.previewTouchSession = {
      fieldKey,
      action,
      kind: kind || '',
      moved: false,
      startPageX: touch.pageX,
      startPageY: touch.pageY,
      rect,
      previewHeightPx,
      canvasWidth,
      canvasHeight,
      originConfig: cloneJson(fieldConfig)
    }
  },

  onPreviewResizeModeTap(e) {
    const mode = e.currentTarget.dataset.mode

    if (!mode || mode === this.data.previewResizeMode) {
      return
    }

    this.setData({
      previewResizeMode: mode
    }, () => {
      this.persistPosterManageCache()
    })
  },

  onPreviewFrameTouchStart(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey
    const action = e.currentTarget.dataset.action || 'move'
    const kind = e.currentTarget.dataset.kind || ''
    const touch = e.touches && e.touches[0]

    if (!fieldKey || !touch) {
      return
    }

    const locked = this.isFieldLocked(fieldKey)

    this.setData({
      activePreviewFieldKey: fieldKey,
      previewGestureFieldKey: action === 'resize' && !locked ? fieldKey : ''
    })

    if (locked) {
      this.previewTouchSession = {
        fieldKey,
        action: 'locked',
        kind: kind || '',
        moved: false,
        startPageX: touch.pageX,
        startPageY: touch.pageY
      }
      return
    }

    this.startPreviewTouchSession(fieldKey, action, touch, kind)
  },

  onPreviewFrameTap(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey

    if (!fieldKey) {
      return
    }

    const now = Date.now()
    const lastTap = this.lastPreviewFrameTap || {}
    const isDoubleTap = lastTap.fieldKey === fieldKey && (now - lastTap.time) < 320

    this.lastPreviewFrameTap = {
      fieldKey,
      time: now
    }

    if (isDoubleTap) {
      this.setData({
        activePreviewFieldKey: fieldKey,
        expandedPreviewFieldKey: this.data.expandedPreviewFieldKey === fieldKey ? '' : fieldKey
      })
      this.lastPreviewFrameTap = null
      return
    }

    this.setData({
      activePreviewFieldKey: fieldKey
    })
  },

  onPreviewFrameTouchMove(e) {
    const session = this.previewTouchSession
    const touch = e.touches && e.touches[0]

    if (!session || !touch) {
      return
    }

    if (session.action === 'locked') {
      const deltaX = touch.pageX - session.startPageX
      const deltaY = touch.pageY - session.startPageY

      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        session.moved = true
      }
      return
    }

    const deltaX = touch.pageX - session.startPageX
    const deltaY = touch.pageY - session.startPageY
    const scaleX = session.canvasWidth / Math.max(session.rect.width, 1)
    const scaleY = session.canvasHeight / Math.max(session.previewHeightPx || session.rect.height, 1)
    const originConfig = session.originConfig || {}
    const originX = toNumber(originConfig.x, 0)
    const originY = toNumber(originConfig.y, 0)
    const originWidth = Math.max(MIN_PREVIEW_FIELD_SIZE, toNumber(originConfig.width, 80))
    const originHeight = Math.max(MIN_PREVIEW_FIELD_SIZE, toNumber(originConfig.height, 80))
    const logicalDeltaX = Math.round(deltaX * scaleX)
    const logicalDeltaY = Math.round(deltaY * scaleY)

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      session.moved = true
    }

    if (session.action === 'resize') {
      const nextWidth = clampNumber(originWidth + logicalDeltaX, MIN_PREVIEW_FIELD_SIZE, session.canvasWidth - originX)
      const nextHeight = clampNumber(originHeight + logicalDeltaY, MIN_PREVIEW_FIELD_SIZE, session.canvasHeight - originY)
      const patch = {
        width: String(nextWidth),
        height: String(nextHeight)
      }

      if (session.kind === 'text') {
        if (this.data.previewResizeMode === 'scaleFont') {
          const scaleRatio = Math.max(0.3, Math.min(nextWidth / originWidth, nextHeight / originHeight))
          const originFontSize = Math.max(12, toNumber(originConfig.fontSize, 28))
          const originLineHeight = Math.max(originFontSize + 4, toNumber(originConfig.lineHeight, 40))
          const nextFontSize = Math.max(12, Math.round(originFontSize * scaleRatio))
          const nextLineHeight = Math.max(nextFontSize + 4, Math.round(originLineHeight * scaleRatio))

          patch.fontSize = String(nextFontSize)
          patch.lineHeight = String(nextLineHeight)
        }

        const nextLineHeight = Math.max(1, toNumber(patch.lineHeight || originConfig.lineHeight, 40))
        patch.maxLines = String(Math.max(1, Math.floor(nextHeight / nextLineHeight) || 1))
      } else {
        const originBorderRadius = Math.max(0, toNumber(originConfig.borderRadius, 0))
        const scaleRatio = Math.max(0.3, Math.min(nextWidth / originWidth, nextHeight / originHeight))
        patch.borderRadius = String(Math.max(0, Math.round(originBorderRadius * scaleRatio)))
      }

      this.updateSingleFieldConfig(session.fieldKey, patch)
      return
    }

    const nextX = clampNumber(originX + logicalDeltaX, 0, Math.max(0, session.canvasWidth - originWidth))
    const nextY = clampNumber(originY + logicalDeltaY, 0, Math.max(0, session.canvasHeight - originHeight))

    this.updateSingleFieldConfig(session.fieldKey, {
      x: String(nextX),
      y: String(nextY)
    })
  },

  togglePreviewFrameExpanded(fieldKey) {
    if (!fieldKey) {
      return
    }

    const now = Date.now()
    const lastTap = this.lastPreviewFrameTap || {}
    const isDoubleTap = lastTap.fieldKey === fieldKey && (now - lastTap.time) < 320

    this.lastPreviewFrameTap = {
      fieldKey,
      time: now
    }

    if (!isDoubleTap) {
      this.setData({
        activePreviewFieldKey: fieldKey
      })
      return
    }

    this.setData({
      activePreviewFieldKey: fieldKey,
      expandedPreviewFieldKey: this.data.expandedPreviewFieldKey === fieldKey ? '' : fieldKey
    })
    this.lastPreviewFrameTap = null
  },

  onPreviewFrameTouchEnd(e) {
    const session = this.previewTouchSession
    const hadTouchSession = !!session
    const fieldKey = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.fieldKey
      : ''
    const isTouchCancel = e && e.type === 'touchcancel'
    this.previewTouchSession = null

    if (!isTouchCancel && session && session.action !== 'resize' && session.moved !== true && fieldKey) {
      this.togglePreviewFrameExpanded(fieldKey)
    }

    if (this.data.previewGestureFieldKey) {
      this.setData({
        previewGestureFieldKey: ''
      }, () => {
        if (hadTouchSession) {
          this.persistPosterManageCache()
        }
      })
      return
    }

    if (hadTouchSession) {
      this.persistPosterManageCache()
    }
  },

  setPreviewState(contentType, previewTemplateId, callback) {
    const nextContentType = contentType || this.data.activePreviewContentType
    const nextState = buildPreviewState(
      this.data.templateList,
      this.data.activeTemplateMap,
      nextContentType,
      previewTemplateId,
      this.data.form
    )

    this.setData({
      activePreviewContentType: nextContentType,
      ...nextState
    }, callback)
  },

  loadManageData(options = {}) {
    const silent = !!options.silent && this.data.hasContent

    this.setData({
      loading: !silent,
      syncing: silent,
      errorMessage: ''
    })

    getPosterManageData().then((result) => {
      const templateList = Array.isArray(result.templateList) ? result.templateList : []
      const activeTemplateMap = result.activeTemplateMap || {}
      let nextForm = this.data.form

      if (this.pendingFormDraft) {
        nextForm = buildDefaultForm(
          this.pendingFormDraft.contentType,
          this.pendingFormDraft.templateStyle || DEFAULT_ACTIVITY_TEMPLATE_STYLE
        )
        this.pendingFormDraft = null
        this.pendingTemplateId = ''
      } else if (this.pendingTemplateId) {
        const pendingTemplate = templateList.find((item) => item.templateId === this.pendingTemplateId)
        if (pendingTemplate) {
          nextForm = buildFormByTemplate(pendingTemplate)
        }
        this.pendingTemplateId = ''
      } else if (nextForm && nextForm.templateId) {
        const latestTemplate = templateList.find((item) => item.templateId === nextForm.templateId)
        if (latestTemplate) {
          nextForm = buildFormByTemplate(latestTemplate)
        }
      } else {
        nextForm = normalizeTemplateForm(nextForm || buildDefaultForm())
      }

      const pendingPreviewTarget = this.pendingPreviewTarget || null
      const activePreviewContentType = pendingPreviewTarget && pendingPreviewTarget.contentType
        ? pendingPreviewTarget.contentType
        : (this.data.activePreviewContentType || 'reading')
      const previewTemplateId = pendingPreviewTarget && Object.prototype.hasOwnProperty.call(pendingPreviewTarget, 'templateId')
        ? pendingPreviewTarget.templateId
        : this.data.previewTemplateId
      const previewState = buildPreviewState(
        templateList,
        activeTemplateMap,
        activePreviewContentType,
        previewTemplateId,
        nextForm
      )
      const collapsedFieldKeyMap = buildCollapsedFieldKeyMap(nextForm.contentType, this.data.collapsedFieldKeyMap || {})
      const templateStatusFilter = normalizeTemplateStatusFilter(this.data.templateStatusFilter)
      const filteredTemplateList = filterTemplateList(templateList, templateStatusFilter)
      this.pendingPreviewTarget = null

      this.setData({
        loading: false,
        syncing: false,
        errorMessage: '',
        hasContent: true,
        permissionInfo: result.permissionInfo || this.data.permissionInfo,
        templateList,
        filteredTemplateList,
        activeTemplateMap,
        templateStatusFilter,
        collapsedFieldKeyMap,
        form: nextForm,
        fieldEditorList: buildFieldEditorList(nextForm.fieldConfig, nextForm.contentType, collapsedFieldKeyMap),
        formPreviewModel: buildPreviewModel(nextForm),
        activePreviewContentType,
        ...previewState
      }, () => {
        this.persistPosterManageCache()
      })
    }).catch((error) => {
      console.error('getPosterManageData error:', error)
      this.setData({
        loading: false,
        syncing: false,
        errorMessage: error.message || '分享海报管理数据加载失败'
      })
    }).finally(() => {
      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    this.setFormState({
      ...this.data.form,
      [field]: e.detail.value
    }, () => {
      this.persistPosterManageCache()
    })
  },

  onContentTypeChange(e) {
    const contentTypeIndex = Number(e.detail.value)
    const targetOption = CONTENT_TYPE_OPTIONS[contentTypeIndex]

    if (!targetOption) {
      return
    }

    const defaultCanvasConfig = getDefaultCanvasConfig(targetOption.value, DEFAULT_ACTIVITY_TEMPLATE_STYLE)
    const collapsedFieldKeyMap = buildCollapsedFieldKeyMap(targetOption.value)

    this.setData({
      collapsedFieldKeyMap
    }, () => {
      this.setFormState({
        ...this.data.form,
        contentType: targetOption.value,
        contentTypeIndex,
        templateStyle: targetOption.value === 'activity' ? DEFAULT_ACTIVITY_TEMPLATE_STYLE : '',
        templateStyleIndex: 0,
        canvasWidth: defaultCanvasConfig.canvasWidth,
        canvasHeight: defaultCanvasConfig.canvasHeight,
        fieldConfig: buildDefaultFieldConfig(targetOption.value, DEFAULT_ACTIVITY_TEMPLATE_STYLE)
      }, () => {
        this.persistPosterManageCache()
      })
    })
  },

  onActivityTemplateStyleChange(e) {
    const valueIndex = Number(e.detail.value)
    const option = ACTIVITY_TEMPLATE_STYLE_OPTIONS[valueIndex]

    if (!option) {
      return
    }

    const preset = buildActivityTemplatePreset(option.value)

    this.setData({
      collapsedFieldKeyMap: buildCollapsedFieldKeyMap('activity')
    }, () => {
      this.setFormState({
        ...this.data.form,
        templateStyle: option.value,
        templateStyleIndex: valueIndex,
        canvasWidth: preset.canvasWidth,
        canvasHeight: preset.canvasHeight,
        fieldConfig: buildActivityDefaultFieldConfig(option.value)
      }, () => {
        this.persistPosterManageCache()
      })
    })
  },

  onEnabledSwitchChange(e) {
    this.setFormState({
      ...this.data.form,
      enabled: !!e.detail.value
    }, () => {
      this.persistPosterManageCache()
    })
  },

  onMiniProgramCodeVisibilityChange(e) {
    const form = normalizeTemplateForm(this.data.form)

    if (!form.fieldConfig.activityQrCode) {
      return
    }

    if (this.isFieldLocked('activityQrCode', form)) {
      return
    }

    form.fieldConfig.activityQrCode.enabled = !!e.detail.value
    form.fieldConfig.activityQrCode.visible = !!e.detail.value

    this.setFormState(form, () => {
      if (e.detail.value) {
        this.focusMiniProgramCodeField({
          persist: true
        })
        return
      }

      this.persistPosterManageCache()
    })
  },

  onFieldSwitchChange(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey

    if (!fieldKey) {
      return
    }

    if (this.isFieldLocked(fieldKey)) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)
    form.fieldConfig[fieldKey].enabled = !!e.detail.value
    form.fieldConfig[fieldKey].visible = !!e.detail.value

    this.setFormState(form, () => {
      this.persistPosterManageCache()
    })
  },

  onFieldCardTap(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey

    if (!fieldKey) {
      return
    }

    const currentCollapsed = (this.data.collapsedFieldKeyMap || {})[fieldKey] !== false

    const collapsedFieldKeyMap = {
      ...this.data.collapsedFieldKeyMap,
      [fieldKey]: !currentCollapsed
    }

    this.setData({
      activePreviewFieldKey: fieldKey,
      collapsedFieldKeyMap,
      fieldEditorList: buildFieldEditorList(this.data.form.fieldConfig, this.data.form.contentType, collapsedFieldKeyMap)
    }, () => {
      this.persistPosterManageCache()
    })
  },

  onFieldLockTap(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey

    if (!fieldKey) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)

    if (!form.fieldConfig[fieldKey]) {
      return
    }

    form.fieldConfig[fieldKey].locked = !(form.fieldConfig[fieldKey].locked === true)

    this.setFormState(form, () => {
      this.persistPosterManageCache()
    })
  },

  onFieldInput(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey
    const prop = e.currentTarget.dataset.prop

    if (!fieldKey || !prop) {
      return
    }

    if (this.isFieldLocked(fieldKey)) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)
    form.fieldConfig[fieldKey][prop] = e.detail.value

    this.setFormState(form, () => {
      this.persistPosterManageCache()
    })
  },

  onFieldBooleanSwitchChange(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey
    const prop = e.currentTarget.dataset.prop

    if (!fieldKey || !prop) {
      return
    }

    if (this.isFieldLocked(fieldKey)) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)
    form.fieldConfig[fieldKey][prop] = !!e.detail.value

    this.setFormState(form, () => {
      this.persistPosterManageCache()
    })
  },

  onFieldTextAlignChange(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey
    const valueIndex = Number(e.detail.value)
    const option = TEXT_ALIGN_OPTIONS[valueIndex]

    if (!fieldKey || !option) {
      return
    }

    if (this.isFieldLocked(fieldKey)) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)
    form.fieldConfig[fieldKey].textAlign = option.value

    this.setFormState(form, () => {
      this.persistPosterManageCache()
    })
  },

  onFieldFontWeightChange(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey
    const valueIndex = Number(e.detail.value)
    const option = FONT_WEIGHT_OPTIONS[valueIndex]

    if (!fieldKey || !option) {
      return
    }

    if (this.isFieldLocked(fieldKey)) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)
    form.fieldConfig[fieldKey].fontWeight = option.value

    this.setFormState(form, () => {
      this.persistPosterManageCache()
    })
  },

  onAuthorAttachModeChange(e) {
    const fieldKey = e.currentTarget.dataset.fieldKey
    const valueIndex = Number(e.detail.value)
    const option = AUTHOR_ATTACH_OPTIONS[valueIndex]

    if (!fieldKey || !option) {
      return
    }

    if (this.isFieldLocked(fieldKey)) {
      return
    }

    const form = normalizeTemplateForm(this.data.form)
    form.fieldConfig[fieldKey].attachToBookTitle = option.value

    this.setFormState(form, () => {
      this.persistPosterManageCache()
    })
  },

  onChooseBackgroundTap() {
    if (this.data.uploadingBackground) {
      return
    }

    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (chooseRes) => {
        const tempFilePath = (chooseRes.tempFilePaths || [])[0]

        if (!tempFilePath) {
          return
        }

        const currentForm = normalizeTemplateForm(this.data.form)
        this.setData({
          uploadingBackground: true
        })

        wx.showLoading({
          title: '上传底图中...'
        })

        Promise.all([
          getImageInfo(tempFilePath).catch((error) => {
            console.warn('read poster background image info failed:', error)
            return null
          }),
          uploadPosterAsset(tempFilePath, 'poster-templates')
        ]).then(([imageInfo, fileId]) => {
          wx.hideLoading()

          const nextCanvasWidth = imageInfo ? String(imageInfo.width) : currentForm.canvasWidth
          const nextCanvasHeight = imageInfo ? String(imageInfo.height) : currentForm.canvasHeight
          const nextFieldConfig = imageInfo
            ? resizeFieldConfig(
              currentForm.fieldConfig,
              currentForm.contentType,
              currentForm.templateStyle,
              currentForm.canvasWidth,
              currentForm.canvasHeight,
              imageInfo.width,
              imageInfo.height
            )
            : currentForm.fieldConfig

          this.setFormState({
            ...currentForm,
            backgroundImageUrl: fileId || '',
            backgroundImageFileId: fileId || '',
            canvasWidth: nextCanvasWidth,
            canvasHeight: nextCanvasHeight,
            fieldConfig: nextFieldConfig
          }, () => {
            this.persistPosterManageCache()
            wx.showToast({
              title: imageInfo ? '底图已同步画板尺寸' : '底图已上传',
              icon: 'none'
            })
          })
        }).catch((error) => {
          wx.hideLoading()
          console.error('upload poster background error:', error)
          wx.showToast({
            title: '底图上传失败',
            icon: 'none'
          })
        }).finally(() => {
          this.setData({
            uploadingBackground: false
          })
        })
      }
    })
  },

  onClearBackgroundTap() {
    this.setFormState({
      ...this.data.form,
      backgroundImageUrl: '',
      backgroundImageFileId: ''
    }, () => {
      this.persistPosterManageCache()
    })
  },

  onChooseMiniProgramCodeTap() {
    if (!this.canUploadMiniProgramCode()) {
      wx.showToast({
        title: '仅管理员可上传小程序码',
        icon: 'none'
      })
      return
    }

    this.chooseAndUploadImageAsset({
      uploadStateKey: 'uploadingMiniProgramCode',
      loadingTitle: '上传小程序码中...',
      cloudFolder: 'poster-mini-program-codes',
      failTitle: '小程序码上传失败',
      onSuccess: (fileId) => {
        const currentForm = normalizeTemplateForm(this.data.form)
        const nextFieldConfig = {
          ...(currentForm.fieldConfig.activityQrCode || {}),
          enabled: true,
          visible: true
        }

        this.setFormState({
          ...currentForm,
          fieldConfig: {
            ...currentForm.fieldConfig,
            activityQrCode: nextFieldConfig
          },
          miniProgramCodeUrl: fileId,
          miniProgramCodeFileId: fileId
        }, () => {
          this.focusMiniProgramCodeField({
            persist: true,
            toastTitle: '小程序码已上传，可继续调位置和大小'
          })
        })
      }
    })
  },

  onClearMiniProgramCodeTap() {
    this.setFormState({
      ...this.data.form,
      miniProgramCodeUrl: '',
      miniProgramCodeFileId: ''
    }, () => {
      this.persistPosterManageCache()
    })
  },

  onEditTemplateTap(e) {
    const templateId = e.currentTarget.dataset.templateId
    const template = this.getTemplateById(templateId)

    if (!template) {
      return
    }

    const nextForm = buildFormByTemplate(template)

    this.setData({
      collapsedFieldKeyMap: buildCollapsedFieldKeyMap(nextForm.contentType)
    }, () => {
      this.setFormState(nextForm, () => {
        this.setPreviewState(nextForm.contentType, FORM_PREVIEW_ID, () => {
          this.persistPosterManageCache()
          wx.showToast({
            title: '模板已载入编辑区',
            icon: 'none'
          })
        })
      })
    })
  },

  onPreviewTemplateTap(e) {
    const templateId = e.currentTarget.dataset.templateId
    const template = this.getTemplateById(templateId)

    if (!template) {
      return
    }

    this.setPreviewState(template.contentType, templateId, () => {
      this.persistPosterManageCache()
    })
  },

  onPreviewTypeChange(e) {
    const contentType = e.currentTarget.dataset.contentType

    if (!contentType || contentType === this.data.activePreviewContentType) {
      return
    }

    this.setPreviewState(contentType, '', () => {
      this.persistPosterManageCache()
    })
  },

  onTemplateStatusFilterChange(e) {
    const statusFilter = normalizeTemplateStatusFilter(e.currentTarget.dataset.filter)

    if (statusFilter === this.data.templateStatusFilter) {
      return
    }

    this.setData({
      templateStatusFilter: statusFilter,
      filteredTemplateList: filterTemplateList(this.data.templateList, statusFilter)
    }, () => {
      this.persistPosterManageCache()
    })
  },

  onCreateTemplateTap() {
    const currentForm = normalizeTemplateForm(this.data.form)
    const nextForm = buildDefaultForm(
      currentForm.contentType,
      currentForm.templateStyle || DEFAULT_ACTIVITY_TEMPLATE_STYLE
    )

    this.setData({
      collapsedFieldKeyMap: buildCollapsedFieldKeyMap(nextForm.contentType)
    }, () => {
      this.setFormState(nextForm, () => {
        this.setPreviewState(nextForm.contentType, FORM_PREVIEW_ID, () => {
          this.persistPosterManageCache()
          wx.showToast({
            title: '已切换到新模板',
            icon: 'none'
          })
        })
      })
    })
  },

  onToggleTemplateStatusTap(e) {
    const templateId = e.currentTarget.dataset.templateId
    const template = this.getTemplateById(templateId)

    if (!template || this.data.togglingTemplateId) {
      return
    }

    this.setData({
      togglingTemplateId: templateId
    })

    savePosterTemplate({
      ...buildSavePayload(buildFormByTemplate(template)),
      enabled: !template.enabled
    }, '模板状态更新失败').then((result) => {
      const nextEnabled = !template.enabled

      wx.showToast({
        title: nextEnabled ? '模板已启用' : '模板已停用',
        icon: 'none'
      })

      if (nextEnabled) {
        this.pendingFormDraft = {
          contentType: template.contentType,
          templateStyle: template.templateStyle || DEFAULT_ACTIVITY_TEMPLATE_STYLE
        }
      } else if (this.data.form.templateId === templateId) {
        this.pendingTemplateId = result.templateId || templateId
      }

      this.pendingPreviewTarget = {
        contentType: template.contentType,
        templateId: result.templateId || templateId
      }
      this.loadManageData({
        silent: true
      })
    }).catch((error) => {
      console.error('togglePosterTemplate error:', error)
      wx.showToast({
        title: error.message || '模板状态更新失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        togglingTemplateId: ''
      })
    })
  },

  onResetFormTap() {
    const currentForm = normalizeTemplateForm(this.data.form)

    this.setData({
      collapsedFieldKeyMap: buildCollapsedFieldKeyMap(currentForm.contentType)
    }, () => {
      this.setFormState(buildDefaultForm(currentForm.contentType, currentForm.templateStyle), () => {
        this.persistPosterManageCache()
      })
    })
  },

  onEditCurrentTemplateTap() {
    if (!this.data.activePreviewTemplateId) {
      return
    }

    this.onEditTemplateTap({
      currentTarget: {
        dataset: {
          templateId: this.data.activePreviewTemplateId
        }
      }
    })
  },

  onToggleCurrentTemplateStatusTap() {
    if (!this.data.activePreviewTemplateId) {
      return
    }

    this.onToggleTemplateStatusTap({
      currentTarget: {
        dataset: {
          templateId: this.data.activePreviewTemplateId
        }
      }
    })
  },

  onSaveTemplateTap() {
    const form = normalizeTemplateForm(this.data.form)

    if (!form.templateName) {
      wx.showToast({
        title: '请先填写模板名称',
        icon: 'none'
      })
      return
    }

    if (!form.backgroundImageUrl) {
      wx.showToast({
        title: '请先上传底图',
        icon: 'none'
      })
      return
    }

    if (!toNumber(form.canvasWidth, 0) || !toNumber(form.canvasHeight, 0)) {
      wx.showToast({
        title: '请填写有效画布尺寸',
        icon: 'none'
      })
      return
    }

    this.setData({
      saving: true
    })

    savePosterTemplate(buildSavePayload(form), '模板保存失败').then((result) => {
      wx.showToast({
        title: '模板已保存',
        icon: 'success'
      })

      const savedTemplateId = result.templateId || form.templateId
      const nextDraft = buildDefaultForm(
        form.contentType,
        form.templateStyle || DEFAULT_ACTIVITY_TEMPLATE_STYLE
      )
      const nextCollapsedFieldKeyMap = buildCollapsedFieldKeyMap(nextDraft.contentType)

      this.pendingFormDraft = {
        contentType: nextDraft.contentType,
        templateStyle: nextDraft.templateStyle || DEFAULT_ACTIVITY_TEMPLATE_STYLE
      }
      this.pendingTemplateId = ''

      this.pendingPreviewTarget = {
        contentType: form.contentType,
        templateId: savedTemplateId
      }

      this.setData({
        activePreviewFieldKey: '',
        expandedPreviewFieldKey: '',
        previewGestureFieldKey: '',
        collapsedFieldKeyMap: nextCollapsedFieldKeyMap
      }, () => {
        this.setFormState(nextDraft, () => {
          this.loadManageData({
            silent: true
          })
        })
      })
    }).catch((error) => {
      console.error('savePosterTemplate error:', error)
      wx.showToast({
        title: error.message || '模板保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        saving: false
      })
    })
  }
})
