const MIN_POSTER_CANVAS_SIZE = 120
const DEFAULT_CONTENT_TYPE = 'reading'
const DEFAULT_ACTIVITY_TEMPLATE_STYLE = 'simpleInfo'

const CONTENT_TYPE_OPTIONS = [
  { label: '阅读打卡', value: 'reading' },
  { label: '生活分享', value: 'life' },
  { label: '奖励晒单', value: 'reward' },
  { label: '创作互动模式A', value: 'blindPoemA' },
  { label: '创作互动模式C', value: 'blindPoemC' },
  { label: '诗词摊煎饼', value: 'poemPancake' },
  { label: '活动', value: 'activity' }
]

const CONTENT_TYPE_TEXT_MAP = CONTENT_TYPE_OPTIONS.reduce((result, item) => {
  result[item.value] = item.label
  return result
}, {})

const AUTHOR_ATTACH_OPTIONS = [
  { label: '独立摆放', value: 'none' },
  { label: '贴在书名左侧', value: 'left' },
  { label: '贴在书名右侧', value: 'right' }
]

const SHARE_FIELD_POOL = [
  { key: 'bookTitle', label: '书名', kind: 'text' },
  { key: 'author', label: '作者', kind: 'text' },
  { key: 'checkInDate', label: '打卡日期', kind: 'text' },
  { key: 'contentTitle', label: '内容标题', kind: 'text' },
  { key: 'reflectionText', label: '阅读感想/摘录', kind: 'text' },
  { key: 'nickname', label: '用户昵称', kind: 'text' },
  { key: 'readingMetric', label: '阅读时长/页数', kind: 'text' },
  { key: 'avatar', label: '用户头像', kind: 'image' },
  { key: 'activityQrCode', label: '小程序码', kind: 'image' },
  { key: 'customLineText', label: '自定义文案', kind: 'text' }
]

const BLIND_POEM_FIELD_POOL = [
  { key: 'modeText', label: '模式标题', kind: 'text' },
  { key: 'createdAtText', label: '创作时间', kind: 'text' },
  { key: 'statusTagText', label: '状态标签', kind: 'text' },
  { key: 'promptText', label: '题面/提示', kind: 'text' },
  { key: 'resultContent', label: '结果展示', kind: 'text' },
  { key: 'myContent', label: '我的作品', kind: 'text' },
  { key: 'partnerContent', label: '另一位写者作品', kind: 'text' },
  { key: 'activityQrCode', label: '小程序码', kind: 'image' },
  { key: 'customLineText', label: '自定义文案', kind: 'text' }
]

const POEM_PANCAKE_FIELD_POOL = [
  { key: 'themeText', label: '主题标题', kind: 'text' },
  { key: 'activityTimeText', label: '活动时间', kind: 'text' },
  { key: 'snapshotImage', label: '摊煎饼快照', kind: 'image' },
  { key: 'shareUserAvatar', label: '分享人头像', kind: 'image' },
  { key: 'shareTimeText', label: '分享时间', kind: 'text' },
  { key: 'contributionText', label: '贡献度', kind: 'text' },
  { key: 'totalCharsText', label: '总字数', kind: 'text' },
  { key: 'activityQrCode', label: '小程序码', kind: 'image' },
  { key: 'customLineText', label: '自定义文案', kind: 'text' }
]

const ACTIVITY_FIELD_POOL = [
  { key: 'activityTitle', label: '活动标题', kind: 'text' },
  { key: 'activityTime', label: '活动时间', kind: 'text' },
  { key: 'activityLocation', label: '活动地点', kind: 'text' },
  { key: 'activitySummary', label: '活动简介', kind: 'text' },
  { key: 'activityCover', label: '活动封面图', kind: 'image' },
  { key: 'activityMode', label: '活动形式', kind: 'text' },
  { key: 'activityTag', label: '活动标签', kind: 'text' },
  { key: 'organizerName', label: '主办方/组织名', kind: 'text' },
  { key: 'activityQrCode', label: '小程序码', kind: 'image' },
  { key: 'signupPrompt', label: '报名提示语', kind: 'text' },
  { key: 'activityStatusTag', label: '活动状态标签', kind: 'text' },
  { key: 'attendeeInfo', label: '活动人数信息', kind: 'text' },
  { key: 'customLineText', label: '自定义文案', kind: 'text' }
]

const ACTIVITY_TEMPLATE_STYLE_OPTIONS = [
  { label: '简洁信息模板', value: 'simpleInfo' },
  { label: '主视觉海报模板', value: 'heroVisual' },
  { label: '手机样式模板', value: 'mobileMockup' }
]

const ACTIVITY_TEMPLATE_STYLE_TEXT_MAP = ACTIVITY_TEMPLATE_STYLE_OPTIONS.reduce((result, item) => {
  result[item.value] = item.label
  return result
}, {})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeContentType(value) {
  const safeValue = normalizeText(value)
  return CONTENT_TYPE_OPTIONS.some((item) => item.value === safeValue)
    ? safeValue
    : DEFAULT_CONTENT_TYPE
}

function getContentTypeText(value) {
  const safeValue = normalizeContentType(value)
  return CONTENT_TYPE_TEXT_MAP[safeValue] || CONTENT_TYPE_TEXT_MAP[DEFAULT_CONTENT_TYPE]
}

function getFieldPool(contentType = DEFAULT_CONTENT_TYPE) {
  const safeType = normalizeContentType(contentType)

  if (safeType === 'activity') {
    return ACTIVITY_FIELD_POOL
  }

  if (safeType === 'poemPancake') {
    return POEM_PANCAKE_FIELD_POOL
  }

  if (safeType === 'blindPoemA' || safeType === 'blindPoemC') {
    return BLIND_POEM_FIELD_POOL
  }

  return SHARE_FIELD_POOL
}

function normalizeActivityTemplateStyle(value) {
  const safeValue = normalizeText(value)
  return ACTIVITY_TEMPLATE_STYLE_OPTIONS.some((item) => item.value === safeValue)
    ? safeValue
    : DEFAULT_ACTIVITY_TEMPLATE_STYLE
}

function getActivityTemplateStyleText(value) {
  return ACTIVITY_TEMPLATE_STYLE_TEXT_MAP[normalizeActivityTemplateStyle(value)]
}

function normalizeAuthorAttachMode(value) {
  const safeValue = normalizeText(value)
  return AUTHOR_ATTACH_OPTIONS.some((item) => item.value === safeValue) ? safeValue : 'none'
}

function toNumber(value, fallback) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : fallback
}

function normalizeNumberText(value, fallback) {
  const safeValue = normalizeText(value)
  return safeValue || String(fallback)
}

function buildShareDefaultFieldConfig(contentType = DEFAULT_CONTENT_TYPE) {
  const safeType = normalizeContentType(contentType)
  return {
    bookTitle: { visible: true, x: '72', y: '220', width: '760', height: '118', fontSize: '42', color: '#17306a', fontWeight: '700', textAlign: 'left', lineHeight: '58', maxLines: '2', autoBookTitleQuotes: safeType === 'reading' },
    author: { visible: true, x: '72', y: '352', width: '520', height: '52', fontSize: '28', color: '#6a7a95', fontWeight: '500', textAlign: 'left', lineHeight: '38', maxLines: '1', attachToBookTitle: 'none' },
    checkInDate: { visible: true, x: '72', y: '412', width: '360', height: '50', fontSize: '26', color: '#8190aa', fontWeight: '500', textAlign: 'left', lineHeight: '36', maxLines: '1' },
    contentTitle: { visible: safeType === 'reading', x: '72', y: '560', width: '420', height: '50', fontSize: '26', color: '#3d6fff', fontWeight: '700', textAlign: 'left', lineHeight: '36', maxLines: '1' },
    reflectionText: { visible: true, x: '72', y: '980', width: '836', height: '280', fontSize: '30', color: '#253558', fontWeight: '500', textAlign: 'left', lineHeight: '46', maxLines: '6', indentFirstLine: false },
    nickname: { visible: true, x: '220', y: '1330', width: '320', height: '54', fontSize: '28', color: '#4d76ff', fontWeight: '700', textAlign: 'left', lineHeight: '38', maxLines: '1' },
    readingMetric: { visible: true, x: '72', y: '470', width: '360', height: '56', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '38', maxLines: '1' },
    avatar: { visible: true, x: '72', y: '1304', width: '120', height: '120', borderRadius: '60' },
    activityQrCode: { visible: false, enabled: false, x: '836', y: '1596', width: '180', height: '180', borderRadius: '20' },
    customLineText: { visible: false, enabled: false, x: '72', y: '1468', width: '760', height: '52', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '38', maxLines: '1' }
  }
}

function buildBlindPoemDefaultFieldConfig() {
  return {
    modeText: { visible: true, x: '72', y: '136', width: '760', height: '80', fontSize: '56', color: '#17306a', fontWeight: '700', textAlign: 'left', lineHeight: '72', maxLines: '2' },
    createdAtText: { visible: true, x: '72', y: '240', width: '360', height: '46', fontSize: '24', color: '#8190aa', fontWeight: '600', textAlign: 'left', lineHeight: '34', maxLines: '1' },
    statusTagText: { visible: true, x: '760', y: '138', width: '248', height: '46', fontSize: '24', color: '#4d76ff', fontWeight: '700', textAlign: 'right', lineHeight: '34', maxLines: '1' },
    promptText: { visible: true, x: '72', y: '376', width: '836', height: '180', fontSize: '30', color: '#334869', fontWeight: '500', textAlign: 'left', lineHeight: '44', maxLines: '4' },
    resultContent: { visible: true, x: '72', y: '616', width: '836', height: '360', fontSize: '34', color: '#253558', fontWeight: '500', textAlign: 'left', lineHeight: '50', maxLines: '6' },
    myContent: { visible: true, x: '72', y: '1044', width: '836', height: '156', fontSize: '30', color: '#2c3d5f', fontWeight: '500', textAlign: 'left', lineHeight: '44', maxLines: '3' },
    partnerContent: { visible: true, x: '72', y: '1272', width: '836', height: '156', fontSize: '30', color: '#2c3d5f', fontWeight: '500', textAlign: 'left', lineHeight: '44', maxLines: '3' },
    activityQrCode: { visible: false, enabled: false, x: '836', y: '1428', width: '180', height: '180', borderRadius: '20' },
    customLineText: { visible: false, enabled: false, x: '72', y: '1496', width: '836', height: '52', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '38', maxLines: '1' }
  }
}

function buildPoemPancakeDefaultFieldConfig() {
  return {
    themeText: { visible: true, x: '84', y: '138', width: '720', height: '88', fontSize: '58', color: '#17306a', fontWeight: '700', textAlign: 'left', lineHeight: '72', maxLines: '2' },
    activityTimeText: { visible: true, x: '84', y: '246', width: '620', height: '52', fontSize: '26', color: '#6d7c97', fontWeight: '600', textAlign: 'left', lineHeight: '36', maxLines: '2' },
    snapshotImage: { visible: true, x: '84', y: '344', width: '912', height: '912', borderRadius: '40' },
    shareUserAvatar: { visible: true, x: '84', y: '1304', width: '124', height: '124', borderRadius: '62' },
    shareTimeText: { visible: true, x: '236', y: '1318', width: '420', height: '44', fontSize: '24', color: '#7f8ea8', fontWeight: '500', textAlign: 'left', lineHeight: '34', maxLines: '1' },
    contributionText: { visible: true, x: '236', y: '1360', width: '420', height: '56', fontSize: '30', color: '#2f6bff', fontWeight: '700', textAlign: 'left', lineHeight: '40', maxLines: '1' },
    totalCharsText: { visible: true, x: '696', y: '1318', width: '300', height: '44', fontSize: '24', color: '#7f8ea8', fontWeight: '500', textAlign: 'right', lineHeight: '34', maxLines: '1' },
    activityQrCode: { visible: false, enabled: false, x: '820', y: '1368', width: '176', height: '176', borderRadius: '24' },
    customLineText: { visible: false, enabled: false, x: '84', y: '1572', width: '912', height: '48', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '38', maxLines: '1' }
  }
}

function buildActivityTemplatePreset(style = DEFAULT_ACTIVITY_TEMPLATE_STYLE) {
  const templateStyle = normalizeActivityTemplateStyle(style)

  if (templateStyle === 'heroVisual') {
    return {
      canvasWidth: '1080',
      canvasHeight: '1920',
      fieldConfig: {
        activityTitle: { enabled: true, visible: true, x: '92', y: '1128', width: '896', height: '170', fontSize: '62', color: '#ffffff', fontWeight: '700', textAlign: 'left', lineHeight: '80', maxLines: '2' },
        activityTime: { enabled: true, visible: true, x: '92', y: '1328', width: '896', height: '62', fontSize: '30', color: '#e7efff', fontWeight: '600', textAlign: 'left', lineHeight: '42', maxLines: '2' },
        activityLocation: { enabled: true, visible: true, x: '92', y: '1404', width: '896', height: '62', fontSize: '30', color: '#dfe7fb', fontWeight: '500', textAlign: 'left', lineHeight: '42', maxLines: '2' },
        activitySummary: { enabled: true, visible: true, x: '92', y: '1500', width: '896', height: '220', fontSize: '30', color: '#f6f9ff', fontWeight: '500', textAlign: 'left', lineHeight: '44', maxLines: '4' },
        activityCover: { enabled: true, visible: true, x: '92', y: '220', width: '896', height: '760', borderRadius: '44' },
        activityMode: { enabled: true, visible: true, x: '92', y: '1038', width: '320', height: '56', fontSize: '28', color: '#ffffff', fontWeight: '600', textAlign: 'left', lineHeight: '40', maxLines: '1' },
        activityTag: { enabled: true, visible: true, x: '430', y: '1038', width: '558', height: '56', fontSize: '28', color: '#ffffff', fontWeight: '500', textAlign: 'right', lineHeight: '40', maxLines: '1' },
        organizerName: { enabled: false, visible: false, x: '92', y: '1740', width: '896', height: '52', fontSize: '26', color: '#d5e1ff', fontWeight: '500', textAlign: 'left', lineHeight: '36', maxLines: '1' },
        activityQrCode: { enabled: false, visible: false, x: '824', y: '1668', width: '164', height: '164', borderRadius: '20' },
        signupPrompt: { enabled: false, visible: false, x: '92', y: '1804', width: '688', height: '56', fontSize: '26', color: '#dfe7fb', fontWeight: '500', textAlign: 'left', lineHeight: '36', maxLines: '2' },
        activityStatusTag: { enabled: false, visible: false, x: '92', y: '150', width: '260', height: '52', fontSize: '26', color: '#ffffff', fontWeight: '700', textAlign: 'left', lineHeight: '36', maxLines: '1' },
        attendeeInfo: { enabled: false, visible: false, x: '92', y: '1688', width: '688', height: '52', fontSize: '26', color: '#d5e1ff', fontWeight: '500', textAlign: 'left', lineHeight: '36', maxLines: '1' },
        customLineText: { enabled: false, visible: false, x: '92', y: '1608', width: '688', height: '52', fontSize: '28', color: '#ffffff', fontWeight: '600', textAlign: 'left', lineHeight: '38', maxLines: '1' }
      }
    }
  }

  if (templateStyle === 'mobileMockup') {
    return {
      canvasWidth: '1080',
      canvasHeight: '2160',
      fieldConfig: {
        activityTitle: { enabled: true, visible: true, x: '196', y: '940', width: '688', height: '160', fontSize: '54', color: '#1f3158', fontWeight: '700', textAlign: 'left', lineHeight: '72', maxLines: '2' },
        activityTime: { enabled: true, visible: true, x: '196', y: '1134', width: '688', height: '64', fontSize: '30', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '42', maxLines: '2' },
        activityLocation: { enabled: true, visible: true, x: '196', y: '1210', width: '688', height: '64', fontSize: '30', color: '#65789d', fontWeight: '500', textAlign: 'left', lineHeight: '42', maxLines: '2' },
        activitySummary: { enabled: true, visible: true, x: '196', y: '1310', width: '688', height: '260', fontSize: '30', color: '#2a3b61', fontWeight: '500', textAlign: 'left', lineHeight: '46', maxLines: '5' },
        activityCover: { enabled: true, visible: true, x: '172', y: '300', width: '736', height: '520', borderRadius: '40' },
        activityMode: { enabled: true, visible: true, x: '196', y: '1598', width: '300', height: '54', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '40', maxLines: '1' },
        activityTag: { enabled: true, visible: true, x: '196', y: '1664', width: '688', height: '54', fontSize: '28', color: '#6a7a95', fontWeight: '500', textAlign: 'left', lineHeight: '40', maxLines: '1' },
        organizerName: { enabled: true, visible: true, x: '196', y: '1730', width: '688', height: '54', fontSize: '28', color: '#6a7a95', fontWeight: '500', textAlign: 'left', lineHeight: '40', maxLines: '1' },
        activityQrCode: { enabled: false, visible: false, x: '674', y: '1598', width: '210', height: '210', borderRadius: '28' },
        signupPrompt: { enabled: false, visible: false, x: '196', y: '1804', width: '688', height: '72', fontSize: '28', color: '#5e7296', fontWeight: '500', textAlign: 'left', lineHeight: '40', maxLines: '2' },
        activityStatusTag: { enabled: false, visible: false, x: '196', y: '236', width: '320', height: '54', fontSize: '28', color: '#4d76ff', fontWeight: '700', textAlign: 'left', lineHeight: '40', maxLines: '1' },
        attendeeInfo: { enabled: false, visible: false, x: '196', y: '1868', width: '688', height: '54', fontSize: '28', color: '#6a7a95', fontWeight: '500', textAlign: 'left', lineHeight: '40', maxLines: '1' },
        customLineText: { enabled: false, visible: false, x: '196', y: '1940', width: '688', height: '54', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '40', maxLines: '1' }
      }
    }
  }

  return {
    canvasWidth: '1080',
    canvasHeight: '1920',
    fieldConfig: {
      activityTitle: { enabled: true, visible: true, x: '92', y: '220', width: '896', height: '160', fontSize: '56', color: '#17306a', fontWeight: '700', textAlign: 'left', lineHeight: '72', maxLines: '2' },
      activityTime: { enabled: true, visible: true, x: '92', y: '468', width: '860', height: '72', fontSize: '30', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '42', maxLines: '2' },
      activityLocation: { enabled: true, visible: true, x: '92', y: '562', width: '860', height: '72', fontSize: '30', color: '#5e7296', fontWeight: '500', textAlign: 'left', lineHeight: '42', maxLines: '2' },
      activitySummary: { enabled: true, visible: true, x: '92', y: '860', width: '896', height: '320', fontSize: '34', color: '#243659', fontWeight: '500', textAlign: 'left', lineHeight: '50', maxLines: '6' },
      activityCover: { enabled: false, visible: false, x: '92', y: '1240', width: '896', height: '360', borderRadius: '36' },
      activityMode: { enabled: false, visible: false, x: '92', y: '656', width: '860', height: '56', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '40', maxLines: '1' },
      activityTag: { enabled: false, visible: false, x: '92', y: '726', width: '860', height: '56', fontSize: '28', color: '#6a7a95', fontWeight: '500', textAlign: 'left', lineHeight: '40', maxLines: '1' },
      organizerName: { enabled: false, visible: false, x: '92', y: '796', width: '860', height: '56', fontSize: '28', color: '#6a7a95', fontWeight: '500', textAlign: 'left', lineHeight: '40', maxLines: '1' },
      activityQrCode: { enabled: false, visible: false, x: '760', y: '1240', width: '228', height: '228', borderRadius: '24' },
      signupPrompt: { enabled: false, visible: false, x: '92', y: '1208', width: '620', height: '72', fontSize: '28', color: '#5e7296', fontWeight: '500', textAlign: 'left', lineHeight: '40', maxLines: '2' },
      activityStatusTag: { enabled: false, visible: false, x: '92', y: '150', width: '260', height: '52', fontSize: '26', color: '#4d76ff', fontWeight: '700', textAlign: 'left', lineHeight: '36', maxLines: '1' },
      attendeeInfo: { enabled: false, visible: false, x: '92', y: '1296', width: '620', height: '56', fontSize: '28', color: '#6a7a95', fontWeight: '500', textAlign: 'left', lineHeight: '40', maxLines: '1' },
      customLineText: { enabled: false, visible: false, x: '92', y: '1368', width: '620', height: '56', fontSize: '28', color: '#4d76ff', fontWeight: '600', textAlign: 'left', lineHeight: '40', maxLines: '1' }
    }
  }
}

function buildActivityDefaultFieldConfig(style = DEFAULT_ACTIVITY_TEMPLATE_STYLE) {
  return buildActivityTemplatePreset(style).fieldConfig
}

function getDefaultCanvasConfig(contentType = DEFAULT_CONTENT_TYPE, templateStyle = DEFAULT_ACTIVITY_TEMPLATE_STYLE) {
  const safeType = normalizeContentType(contentType)

  if (safeType === 'poemPancake') {
    return { canvasWidth: '1080', canvasHeight: '1680' }
  }

  if (safeType === 'activity') {
    const activityPreset = buildActivityTemplatePreset(templateStyle)
    return {
      canvasWidth: activityPreset.canvasWidth,
      canvasHeight: activityPreset.canvasHeight
    }
  }

  if (safeType === 'blindPoemA' || safeType === 'blindPoemC') {
    return { canvasWidth: '1080', canvasHeight: '1660' }
  }

  return { canvasWidth: '1080', canvasHeight: '1920' }
}

function buildDefaultFieldConfig(contentType = DEFAULT_CONTENT_TYPE, templateStyle = DEFAULT_ACTIVITY_TEMPLATE_STYLE) {
  const safeType = normalizeContentType(contentType)

  if (safeType === 'poemPancake') {
    return buildPoemPancakeDefaultFieldConfig()
  }

  if (safeType === 'activity') {
    return buildActivityDefaultFieldConfig(templateStyle)
  }

  if (safeType === 'blindPoemA' || safeType === 'blindPoemC') {
    return buildBlindPoemDefaultFieldConfig()
  }

  return buildShareDefaultFieldConfig(safeType)
}

function mergeFieldConfig(fieldConfig, contentType = DEFAULT_CONTENT_TYPE, templateStyle = DEFAULT_ACTIVITY_TEMPLATE_STYLE) {
  const defaultConfig = buildDefaultFieldConfig(contentType, templateStyle)
  const result = {}

  getFieldPool(contentType).forEach((field) => {
    const fieldKey = field.key
    const source = fieldConfig && typeof fieldConfig[fieldKey] === 'object' ? fieldConfig[fieldKey] : {}
    const defaultFieldConfig = defaultConfig[fieldKey] || {}
    const enabled = typeof source.enabled === 'boolean'
      ? source.enabled
      : (typeof source.visible === 'boolean' ? source.visible : defaultFieldConfig.enabled !== false)

    result[fieldKey] = {
      ...defaultFieldConfig,
      ...source,
      enabled,
      visible: enabled
    }

    Object.keys(result[fieldKey]).forEach((configKey) => {
      if (
        configKey === 'enabled'
        || configKey === 'visible'
        || configKey === 'indentFirstLine'
        || configKey === 'locked'
        || configKey === 'autoBookTitleQuotes'
        || configKey === 'attachToBookTitle'
        || configKey === 'color'
        || configKey === 'fontWeight'
        || configKey === 'textAlign'
      ) {
        return
      }

      result[fieldKey][configKey] = normalizeNumberText(result[fieldKey][configKey], defaultFieldConfig[configKey])
    })

    if (fieldKey === 'customLineText') {
      result[fieldKey].maxLines = '1'
    }

    if (fieldKey === 'bookTitle') {
      result[fieldKey].autoBookTitleQuotes = result[fieldKey].autoBookTitleQuotes !== false
    }

    if (fieldKey === 'author') {
      result[fieldKey].attachToBookTitle = normalizeAuthorAttachMode(result[fieldKey].attachToBookTitle)
    }
  })

  return result
}

function getDefaultTemplateName(contentType = DEFAULT_CONTENT_TYPE) {
  const safeType = normalizeContentType(contentType)

  if (safeType === 'activity') {
    return '系统默认活动海报'
  }

  if (safeType === 'poemPancake') {
    return '系统默认诗词摊煎饼海报'
  }

  if (safeType === 'blindPoemA') {
    return '系统默认创作互动模式A海报'
  }

  if (safeType === 'blindPoemC') {
    return '系统默认创作互动模式C海报'
  }

  return safeType === 'reading' ? '系统默认阅读打卡海报' : '系统默认分享海报'
}

function getDefaultTemplateDescription(contentType = DEFAULT_CONTENT_TYPE) {
  const safeType = normalizeContentType(contentType)

  if (safeType === 'activity') {
    return '未配置活动海报模板时使用系统默认模板'
  }

  if (safeType === 'poemPancake') {
    return '未配置诗词摊煎饼海报模板时使用系统默认模板'
  }

  if (safeType === 'blindPoemA') {
    return '未配置创作互动模式A海报模板时使用系统默认模板'
  }

  if (safeType === 'blindPoemC') {
    return '未配置创作互动模式C海报模板时使用系统默认模板'
  }

  return safeType === 'reading'
    ? '未配置阅读打卡海报模板时使用系统默认模板'
    : '未配置分享海报模板时使用系统默认模板'
}

module.exports = {
  MIN_POSTER_CANVAS_SIZE,
  DEFAULT_CONTENT_TYPE,
  DEFAULT_ACTIVITY_TEMPLATE_STYLE,
  CONTENT_TYPE_OPTIONS,
  CONTENT_TYPE_TEXT_MAP,
  AUTHOR_ATTACH_OPTIONS,
  SHARE_FIELD_POOL,
  BLIND_POEM_FIELD_POOL,
  POEM_PANCAKE_FIELD_POOL,
  ACTIVITY_FIELD_POOL,
  ACTIVITY_TEMPLATE_STYLE_OPTIONS,
  ACTIVITY_TEMPLATE_STYLE_TEXT_MAP,
  normalizeText,
  normalizeContentType,
  getContentTypeText,
  getFieldPool,
  normalizeActivityTemplateStyle,
  getActivityTemplateStyleText,
  normalizeAuthorAttachMode,
  toNumber,
  normalizeNumberText,
  buildShareDefaultFieldConfig,
  buildBlindPoemDefaultFieldConfig,
  buildPoemPancakeDefaultFieldConfig,
  buildActivityTemplatePreset,
  buildActivityDefaultFieldConfig,
  getDefaultCanvasConfig,
  buildDefaultFieldConfig,
  mergeFieldConfig,
  getDefaultTemplateName,
  getDefaultTemplateDescription
}
