const {
  buildPrivacyReminderData,
  privacyReminderMethods
} = require('../../utils/privacy')

const TIME_TYPE_OPTIONS = [
  {
    label: '单个时间点',
    value: 'singlePoint'
  },
  {
    label: '单日时间段',
    value: 'singleDayRange'
  },
  {
    label: '日期范围',
    value: 'dateRange'
  }
]

const ACTIVITY_MODE_OPTIONS = [
  {
    label: '线下',
    value: 'offline'
  },
  {
    label: '线上',
    value: 'online'
  }
]

const ACTIVITY_TYPE_OPTIONS = [
  {
    label: '普通活动',
    value: 'normal'
  },
  {
    label: '奖励领取活动',
    value: 'rewardClaim'
  }
]

const TEMPLATE_OPTIONS = [
  {
    label: '模板1：左侧信息 + 右侧缩略图',
    value: 'template1'
  },
  {
    label: '模板2：自定义画板（占位）',
    value: 'template2'
  },
  {
    label: '模板3：纯图片展示',
    value: 'template3'
  }
]

const SHAPE_OPTIONS = [
  {
    label: '矩形',
    value: 'rect'
  },
  {
    label: '三角形',
    value: 'triangle'
  },
  {
    label: '圆形',
    value: 'circle'
  },
  {
    label: '星形',
    value: 'star'
  }
]

const TEMPLATE1_THUMB_SIZE = 200
const TEMPLATE1_THUMB_MIN_SCALE = 100
const TEMPLATE1_THUMB_MAX_SCALE = 240
const TEMPLATE2_BOARD_WIDTH = 560
const TEMPLATE2_BOARD_HEIGHT = 315
const TEMPLATE2_TEXT_GROUP_HEIGHT = 164
const TEMPLATE2_TEXT_FIELD_OPTIONS = [
  {
    key: 'title',
    label: '标题',
    defaultText: '活动标题',
    defaultY: 74,
    defaultFontSize: 28
  },
  {
    key: 'time',
    label: '时间',
    defaultText: '时间待定',
    defaultY: 122,
    defaultFontSize: 22
  },
  {
    key: 'location',
    label: '地点',
    defaultText: '地点待定',
    defaultY: 156,
    defaultFontSize: 22
  },
  {
    key: 'theme',
    label: '主题',
    defaultText: '主题待定',
    defaultY: 190,
    defaultFontSize: 22
  }
]

function buildDefaultPermission() {
  return {
    role: 'guest',
    superAdmin: false,
    dataPermission: false,
    activityPermission: false,
    rewardPermission: false,
    imageUploadPermission: true
  }
}

function buildShapeId() {
  return `shape-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function buildDefaultImageElement() {
  return {
    url: '',
    x: TEMPLATE2_BOARD_WIDTH - 188,
    y: 62,
    width: 150,
    height: 150
  }
}

function buildDefaultThumbElement() {
  return {
    x: 0,
    y: 0,
    scalePercent: 100
  }
}

function getCurrentRewardMeta(currentDate = new Date()) {
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')

  return {
    monthKey: `${year}-${month}`,
    rewardLabel: `${year}年${month}月奖励`
  }
}

function buildDefaultTextGroup() {
  const titleField = buildDefaultTextField('title')
  const timeField = buildDefaultTextField('time')
  const locationField = buildDefaultTextField('location')
  const themeField = buildDefaultTextField('theme')

  return {
    x: 24,
    y: 74,
    width: 280,
    color: '#222222',
    showTitle: true,
    showTime: true,
    showLocation: true,
    showTheme: true,
    title: titleField,
    time: timeField,
    location: locationField,
    theme: themeField
  }
}

function getTemplate2TextFieldOption(fieldKey) {
  return TEMPLATE2_TEXT_FIELD_OPTIONS.find((item) => item.key === fieldKey) || TEMPLATE2_TEXT_FIELD_OPTIONS[0]
}

function buildDefaultTextField(fieldKey) {
  const option = getTemplate2TextFieldOption(fieldKey)

  return {
    visible: true,
    x: 24,
    y: option.defaultY,
    fontSize: option.defaultFontSize,
    color: '#222222'
  }
}

function normalizeTemplateTextField(fieldKey, fieldValue, textGroupFallback) {
  const safeField = fieldValue && typeof fieldValue === 'object' ? fieldValue : {}
  const fallbackField = buildDefaultTextField(fieldKey)
  const legacyVisibleFieldName = `show${fieldKey.charAt(0).toUpperCase()}${fieldKey.slice(1)}`

  return {
    visible: typeof safeField.visible === 'boolean'
      ? safeField.visible
      : (typeof textGroupFallback[legacyVisibleFieldName] === 'boolean'
        ? textGroupFallback[legacyVisibleFieldName]
        : fallbackField.visible),
    x: clampNumber(
      normalizeShapeValue(safeField.x, fallbackField.x),
      0,
      TEMPLATE2_BOARD_WIDTH - 40
    ),
    y: clampNumber(
      normalizeShapeValue(safeField.y, fallbackField.y),
      0,
      TEMPLATE2_BOARD_HEIGHT - 30
    ),
    fontSize: clampNumber(
      normalizeShapeValue(safeField.fontSize, fallbackField.fontSize),
      18,
      60
    ),
    color: String(safeField.color || textGroupFallback.color || fallbackField.color).trim() || fallbackField.color
  }
}

function getTemplate1ThumbMaxOffset(scalePercent) {
  const safeScalePercent = clampNumber(Number(scalePercent) || 100, TEMPLATE1_THUMB_MIN_SCALE, TEMPLATE1_THUMB_MAX_SCALE)
  return TEMPLATE1_THUMB_SIZE * (safeScalePercent / 100 - 1) / 2
}

function buildDefaultShape(shapeType = 'rect') {
  const colorHue = 224
  const colorSaturation = 100
  const colorLightness = 65

  return {
    shapeId: buildShapeId(),
    shapeType,
    shapeTypeIndex: getShapeTypeIndex(shapeType),
    x: 20,
    y: 20,
    width: 80,
    height: 80,
    colorHue,
    colorSaturation,
    colorLightness,
    color: buildHslColor(colorHue, colorSaturation, colorLightness),
    opacity: 100
  }
}

function normalizeShapeValue(value, fallback) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return parsed
}

function buildHslColor(hue, saturation, lightness) {
  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`
}

function parseHexColor(color) {
  const normalized = String(color || '').trim().replace('#', '')

  if (!/^[\da-fA-F]{3}$|^[\da-fA-F]{6}$/.test(normalized)) {
    return null
  }

  const fullHex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized

  return {
    r: parseInt(fullHex.slice(0, 2), 16),
    g: parseInt(fullHex.slice(2, 4), 16),
    b: parseInt(fullHex.slice(4, 6), 16)
  }
}

function parseRgbColor(color) {
  const match = String(color || '').trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)

  if (!match) {
    return null
  }

  return {
    r: clampNumber(Number(match[1]) || 0, 0, 255),
    g: clampNumber(Number(match[2]) || 0, 0, 255),
    b: clampNumber(Number(match[3]) || 0, 0, 255)
  }
}

function rgbToHsl(r, g, b) {
  const red = clampNumber(Number(r) || 0, 0, 255) / 255
  const green = clampNumber(Number(g) || 0, 0, 255) / 255
  const blue = clampNumber(Number(b) || 0, 0, 255) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0
  let saturation = 0
  const lightness = (max + min) / 2

  if (delta !== 0) {
    saturation = lightness > 0.5
      ? delta / (2 - max - min)
      : delta / (max + min)

    switch (max) {
      case red:
        hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60
        break
      case green:
        hue = ((blue - red) / delta + 2) * 60
        break
      default:
        hue = ((red - green) / delta + 4) * 60
        break
    }
  }

  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  }
}

function parseHslColor(color) {
  const match = String(color || '').trim().match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i)

  if (!match) {
    return null
  }

  return {
    h: clampNumber(Number(match[1]) || 0, 0, 360),
    s: clampNumber(Number(match[2]) || 0, 0, 100),
    l: clampNumber(Number(match[3]) || 0, 0, 100)
  }
}

function parseShapeColorMeta(color, fallbackMeta) {
  const fallback = fallbackMeta || {
    h: 224,
    s: 100,
    l: 65
  }
  const hslColor = parseHslColor(color)

  if (hslColor) {
    return hslColor
  }

  const hexColor = parseHexColor(color)

  if (hexColor) {
    return rgbToHsl(hexColor.r, hexColor.g, hexColor.b)
  }

  const rgbColor = parseRgbColor(color)

  if (rgbColor) {
    return rgbToHsl(rgbColor.r, rgbColor.g, rgbColor.b)
  }

  return fallback
}

function normalizeTemplateData(templateData) {
  const safeData = templateData && typeof templateData === 'object' && !Array.isArray(templateData)
    ? templateData
    : {}
  const safeShapes = Array.isArray(safeData.shapes) ? safeData.shapes : []
  const safeImageElement = safeData.imageElement && typeof safeData.imageElement === 'object'
    ? safeData.imageElement
    : (safeData.image && typeof safeData.image === 'object' ? safeData.image : {})
  const safeThumbElement = safeData.thumbElement && typeof safeData.thumbElement === 'object'
    ? safeData.thumbElement
    : {}
  const safeTextGroup = safeData.textGroup && typeof safeData.textGroup === 'object'
    ? safeData.textGroup
    : {}
  const defaultThumbElement = buildDefaultThumbElement()
  const defaultImageElement = buildDefaultImageElement()
  const defaultTextGroup = buildDefaultTextGroup()
  const thumbScalePercent = clampNumber(
    normalizeShapeValue(safeThumbElement.scalePercent, defaultThumbElement.scalePercent),
    TEMPLATE1_THUMB_MIN_SCALE,
    TEMPLATE1_THUMB_MAX_SCALE
  )
  const thumbMaxOffset = getTemplate1ThumbMaxOffset(thumbScalePercent)

  const titleField = normalizeTemplateTextField('title', safeTextGroup.title, {
    ...defaultTextGroup,
    ...safeTextGroup
  })
  const timeField = normalizeTemplateTextField('time', safeTextGroup.time, {
    ...defaultTextGroup,
    ...safeTextGroup
  })
  const locationField = normalizeTemplateTextField('location', safeTextGroup.location, {
    ...defaultTextGroup,
    ...safeTextGroup
  })
  const themeField = normalizeTemplateTextField('theme', safeTextGroup.theme, {
    ...defaultTextGroup,
    ...safeTextGroup
  })

  return {
    ...safeData,
    backgroundColor: String(safeData.backgroundColor || '#f5f7fc').trim() || '#f5f7fc',
    thumbElement: {
      x: clampNumber(normalizeShapeValue(safeThumbElement.x, defaultThumbElement.x), -thumbMaxOffset, thumbMaxOffset),
      y: clampNumber(normalizeShapeValue(safeThumbElement.y, defaultThumbElement.y), -thumbMaxOffset, thumbMaxOffset),
      scalePercent: thumbScalePercent
    },
    imageElement: {
      url: String(safeImageElement.url || safeImageElement.imageUrl || '').trim(),
      x: clampNumber(normalizeShapeValue(safeImageElement.x, defaultImageElement.x), 0, TEMPLATE2_BOARD_WIDTH - 40),
      y: clampNumber(normalizeShapeValue(safeImageElement.y, defaultImageElement.y), 0, TEMPLATE2_BOARD_HEIGHT - 40),
      width: Math.max(40, normalizeShapeValue(safeImageElement.width, defaultImageElement.width)),
      height: Math.max(40, normalizeShapeValue(safeImageElement.height, defaultImageElement.height))
    },
    textGroup: {
      x: clampNumber(normalizeShapeValue(safeTextGroup.x, defaultTextGroup.x), 0, TEMPLATE2_BOARD_WIDTH - 120),
      y: clampNumber(normalizeShapeValue(safeTextGroup.y, defaultTextGroup.y), 0, TEMPLATE2_BOARD_HEIGHT - 60),
      width: Math.max(120, normalizeShapeValue(safeTextGroup.width, defaultTextGroup.width)),
      color: String(safeTextGroup.color || defaultTextGroup.color).trim() || defaultTextGroup.color,
      showTitle: titleField.visible,
      showTime: timeField.visible,
      showLocation: locationField.visible,
      showTheme: themeField.visible,
      title: titleField,
      time: timeField,
      location: locationField,
      theme: themeField
    },
    shapes: safeShapes.map((item) => {
      const defaultShape = buildDefaultShape(item && item.shapeType)
      const parsedColorMeta = parseShapeColorMeta(item && item.color, {
        h: defaultShape.colorHue,
        s: defaultShape.colorSaturation,
        l: defaultShape.colorLightness
      })
      const colorHue = clampNumber(normalizeShapeValue(item && item.colorHue, parsedColorMeta.h), 0, 360)
      const colorSaturation = clampNumber(normalizeShapeValue(item && item.colorSaturation, parsedColorMeta.s), 0, 100)
      const colorLightness = clampNumber(normalizeShapeValue(item && item.colorLightness, parsedColorMeta.l), 0, 100)

      return {
        shapeId: item && item.shapeId ? item.shapeId : buildShapeId(),
        shapeType: item && SHAPE_OPTIONS.some((option) => option.value === item.shapeType) ? item.shapeType : 'rect',
        shapeTypeIndex: getShapeTypeIndex(item && item.shapeType),
        x: clampNumber(normalizeShapeValue(item && item.x, 20), 0, TEMPLATE2_BOARD_WIDTH - 20),
        y: clampNumber(normalizeShapeValue(item && item.y, 20), 0, TEMPLATE2_BOARD_HEIGHT - 20),
        width: Math.max(20, normalizeShapeValue(item && item.width, 80)),
        height: Math.max(20, normalizeShapeValue(item && item.height, 80)),
        colorHue,
        colorSaturation,
        colorLightness,
        color: buildHslColor(colorHue, colorSaturation, colorLightness),
        opacity: Math.min(100, Math.max(0, normalizeShapeValue(item && item.opacity, 100)))
      }
    })
  }
}

function buildTemplate2PreviewTextField(fieldKey, fieldConfig, textWidth, fieldText, pxPerRpx) {
  const option = getTemplate2TextFieldOption(fieldKey)

  return {
    fieldKey,
    label: option.label,
    text: fieldText,
    visible: !!fieldConfig.visible,
    x: Math.round(fieldConfig.x),
    y: Math.round(fieldConfig.y),
    fontSize: Math.round(fieldConfig.fontSize),
    color: fieldConfig.color,
    metaText: `X ${Math.round(fieldConfig.x)} / Y ${Math.round(fieldConfig.y)} / 字号 ${Math.round(fieldConfig.fontSize)}`,
    style: [
      `left:${rpxToPx(fieldConfig.x, pxPerRpx)}px`,
      `top:${rpxToPx(fieldConfig.y, pxPerRpx)}px`,
      `width:${rpxToPx(textWidth, pxPerRpx)}px`,
      `font-size:${rpxToPx(fieldConfig.fontSize, pxPerRpx)}px`,
      `color:${fieldConfig.color}`,
      `font-weight:${fieldKey === 'title' ? 700 : 500}`
    ].join(';')
  }
}

function rpxToPx(value, pxPerRpx) {
  return Math.round((Number(value) || 0) * pxPerRpx)
}

function pxToRpx(value, pxPerRpx) {
  if (!pxPerRpx) {
    return 0
  }

  return Math.round((Number(value) || 0) / pxPerRpx)
}

function buildTemplateAssetCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `activity-template-assets/${randomPart}.${extension}`
}

function buildPreviewShapeItem(shape, pxPerRpx) {
  const x = Math.max(0, normalizeShapeValue(shape && shape.x, 20))
  const y = Math.max(0, normalizeShapeValue(shape && shape.y, 20))
  const width = Math.max(20, normalizeShapeValue(shape && shape.width, 80))
  const height = Math.max(20, normalizeShapeValue(shape && shape.height, 80))
  const color = shape && shape.color ? shape.color : '#4D76FF'
  const opacity = clampNumber(normalizeShapeValue(shape && shape.opacity, 100), 0, 100) / 100
  const shapeType = shape && shape.shapeType ? shape.shapeType : 'rect'

  if (shapeType === 'triangle') {
    return {
      shapeId: shape && shape.shapeId ? shape.shapeId : buildShapeId(),
      shapeClass: 'triangle',
      shapeText: '',
      xPx: rpxToPx(x, pxPerRpx),
      yPx: rpxToPx(y, pxPerRpx),
      boxStyle: `width:${rpxToPx(width, pxPerRpx)}px;height:${rpxToPx(height, pxPerRpx)}px;`,
      innerStyle: [
        'width:0',
        'height:0',
        `opacity:${opacity}`,
        `border-left:${rpxToPx(width / 2, pxPerRpx)}px solid transparent`,
        `border-right:${rpxToPx(width / 2, pxPerRpx)}px solid transparent`,
        `border-bottom:${rpxToPx(height, pxPerRpx)}px solid ${color}`
      ].join(';')
    }
  }

  if (shapeType === 'star') {
    const fontSize = Math.max(24, Math.min(width, height))

    return {
      shapeId: shape && shape.shapeId ? shape.shapeId : buildShapeId(),
      shapeClass: 'star',
      shapeText: '★',
      xPx: rpxToPx(x, pxPerRpx),
      yPx: rpxToPx(y, pxPerRpx),
      boxStyle: `width:${rpxToPx(width, pxPerRpx)}px;height:${rpxToPx(height, pxPerRpx)}px;`,
      innerStyle: [
        `width:${rpxToPx(width, pxPerRpx)}px`,
        `height:${rpxToPx(height, pxPerRpx)}px`,
        `color:${color}`,
        `opacity:${opacity}`,
        `font-size:${rpxToPx(fontSize, pxPerRpx)}px`
      ].join(';')
    }
  }

  return {
    shapeId: shape && shape.shapeId ? shape.shapeId : buildShapeId(),
    shapeClass: shapeType === 'circle' ? 'circle' : 'rect',
    shapeText: '',
    xPx: rpxToPx(x, pxPerRpx),
    yPx: rpxToPx(y, pxPerRpx),
    boxStyle: `width:${rpxToPx(width, pxPerRpx)}px;height:${rpxToPx(height, pxPerRpx)}px;`,
    innerStyle: [
      'width:100%',
      'height:100%',
      `background:${color}`,
      `opacity:${opacity}`
    ].join(';')
  }
}

function buildTemplate1Preview(form, pxPerRpx) {
  const safeTemplateData = normalizeTemplateData(form.templateData)
  const thumbElement = safeTemplateData.thumbElement
  const scale = thumbElement.scalePercent / 100

  return {
    hasImage: !!form.coverUrl,
    imageUrl: form.coverUrl || '',
    scalePercent: thumbElement.scalePercent,
    metaText: form.coverUrl
      ? `拖动右侧缩略图显示区域，当前缩放 ${thumbElement.scalePercent}%`
      : '请先上传【详情页】封面图，再调整首页右侧缩略图。',
    imageStyle: [
      `transform: translate(${rpxToPx(thumbElement.x, pxPerRpx)}px, ${rpxToPx(thumbElement.y, pxPerRpx)}px) scale(${scale})`,
      'transform-origin:center center;'
    ].join(';')
  }
}

function buildTemplate2Preview(form, pxPerRpx) {
  const safeTemplateData = normalizeTemplateData(form.templateData)
  const imageElement = safeTemplateData.imageElement
  const textGroup = safeTemplateData.textGroup
  const textWidth = Math.max(120, normalizeShapeValue(textGroup.width, 280))
  const textFields = [
    buildTemplate2PreviewTextField('title', textGroup.title, textWidth, form.title || '活动标题', pxPerRpx),
    buildTemplate2PreviewTextField('time', textGroup.time, textWidth, form.timeText || '时间待定', pxPerRpx),
    buildTemplate2PreviewTextField('location', textGroup.location, textWidth, form.location || '地点待定', pxPerRpx),
    buildTemplate2PreviewTextField('theme', textGroup.theme, textWidth, form.theme || '主题待定', pxPerRpx)
  ]

  return {
    boardStyle: `background:${safeTemplateData.backgroundColor};`,
    image: {
      hasImage: !!imageElement.url,
      url: imageElement.url,
      xPx: rpxToPx(imageElement.x, pxPerRpx),
      yPx: rpxToPx(imageElement.y, pxPerRpx),
      boxStyle: [
        `width:${rpxToPx(imageElement.width, pxPerRpx)}px`,
        `height:${rpxToPx(imageElement.height, pxPerRpx)}px`
      ].join(';'),
      metaText: `X ${Math.round(imageElement.x)} / Y ${Math.round(imageElement.y)} / ${Math.round(imageElement.width)} x ${Math.round(imageElement.height)}`
    },
    textGroup: {
      width: textWidth,
      metaText: `统一宽度 ${Math.round(textWidth)}`
    },
    textFields,
    shapes: safeTemplateData.shapes.map((shape) => buildPreviewShapeItem(shape, pxPerRpx))
  }
}

function buildEmptyTemplate2Preview() {
  return {
    boardStyle: 'background:#f5f7fc;',
    image: {
      hasImage: false,
      url: '',
      xPx: 0,
      yPx: 0,
      boxStyle: '',
      metaText: ''
    },
    textGroup: {
      width: 280,
      metaText: ''
    },
    textFields: [],
    shapes: []
  }
}

function buildEmptyTemplate1Preview() {
  return {
    hasImage: false,
    imageUrl: '',
    scalePercent: 100,
    metaText: '请先上传【详情页】封面图，再调整首页右侧缩略图。',
    imageStyle: ''
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function isValidArticleUrl(url) {
  return /^https?:\/\//i.test(normalizeText(url))
}

function normalizeArticleUrl(url) {
  const safeUrl = normalizeText(url)

  if (!isValidArticleUrl(safeUrl)) {
    return safeUrl
  }

  if (safeUrl.indexOf('mp.weixin.qq.com/') === -1 || safeUrl.indexOf('#wechat_redirect') !== -1) {
    return safeUrl
  }

  return `${safeUrl}#wechat_redirect`
}

function buildDefaultForm() {
  return {
    title: '',
    timeType: 'singlePoint',
    startDate: '',
    endDate: '',
    hasExactTime: true,
    startTime: '19:00',
    endTime: '21:00',
    timeText: '',
    hasPublishSchedule: false,
    publishDate: '',
    publishTime: '09:00',
    publishTimeText: '',
    location: '',
    description: '',
    theme: '',
    officialAccountUrl: '',
    activityMode: 'offline',
    activityType: 'normal',
    isReadingIncentiveActivity: false,
    rewardMonthKey: '',
    rewardLabel: '',
    coverUrl: '',
    templateType: 'template1',
    templateData: normalizeTemplateData({})
  }
}

function normalizeTimeForm(form) {
  return {
    ...form,
    startDate: form.startDate || '',
    endDate: form.endDate || '',
    startTime: form.startTime || '19:00',
    endTime: form.endTime || '21:00',
    hasExactTime: typeof form.hasExactTime === 'boolean' ? form.hasExactTime : true
  }
}

function buildPublishTimeText(form) {
  if (!form.hasPublishSchedule || !form.publishDate || !form.publishTime) {
    return ''
  }

  return `${form.publishDate} ${form.publishTime}`
}

function formatDateByTimestamp(timestamp) {
  const date = new Date(Number(timestamp) || 0)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatTimeByTimestamp(timestamp) {
  const date = new Date(Number(timestamp) || 0)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${hour}:${minute}`
}

function getMissingOptionalMessage(form) {
  const missingFields = []

  if (!form.location.trim()) {
    missingFields.push('活动地点')
  }

  if (!form.description.trim()) {
    missingFields.push('活动简介')
  }

  if (!missingFields.length) {
    return ''
  }

  if (missingFields.length === 2) {
    return '活动地点和活动简介尚未填写，是否仍然发布活动？'
  }

  return `${missingFields[0]}尚未填写，是否仍然发布活动？`
}

function buildActivityTimeSignature(form) {
  const safeForm = normalizeTimeForm(form)

  if (safeForm.timeType === 'singlePoint') {
    return JSON.stringify({
      timeType: 'singlePoint',
      startDate: safeForm.startDate || '',
      startTime: safeForm.startTime || ''
    })
  }

  if (safeForm.timeType === 'singleDayRange') {
    return JSON.stringify({
      timeType: 'singleDayRange',
      startDate: safeForm.startDate || '',
      startTime: safeForm.startTime || '',
      endTime: safeForm.endTime || ''
    })
  }

  return JSON.stringify({
    timeType: 'dateRange',
    startDate: safeForm.startDate || '',
    endDate: safeForm.endDate || '',
    hasExactTime: !!safeForm.hasExactTime,
    startTime: safeForm.hasExactTime ? (safeForm.startTime || '') : '',
    endTime: safeForm.hasExactTime ? (safeForm.endTime || '') : ''
  })
}

function hasOwnProperty(target, key) {
  return Object.prototype.hasOwnProperty.call(target || {}, key)
}

function isDuplicatePublishReady(editingActivityId, editingOriginalTimeSignature, form) {
  if (!editingActivityId) {
    return false
  }

  if (!editingOriginalTimeSignature) {
    return false
  }

  return buildActivityTimeSignature(form) !== editingOriginalTimeSignature
}

function buildDuplicatePublishHint(editingActivityId, editingOriginalTimeSignature, form) {
  if (!editingActivityId) {
    return ''
  }

  return isDuplicatePublishReady(editingActivityId, editingOriginalTimeSignature, form)
    ? '已检测到活动时间变更，点击后会保留原活动，并按当前时间复制发布一条新活动。'
    : '复制发布要求活动时间与原活动不同，请先调整活动时间。'
}

function getTimestamp(dateText, timeText) {
  return new Date(`${dateText} ${timeText}`.replace(/-/g, '/')).getTime()
}

function buildTimeText(form) {
  const safeForm = normalizeTimeForm(form)

  if (safeForm.timeType === 'singlePoint') {
    if (!safeForm.startDate || !safeForm.startTime) {
      return ''
    }

    return `${safeForm.startDate} ${safeForm.startTime}`
  }

  if (safeForm.timeType === 'singleDayRange') {
    if (!safeForm.startDate || !safeForm.startTime || !safeForm.endTime) {
      return ''
    }

    return `${safeForm.startDate} ${safeForm.startTime} - ${safeForm.endTime}`
  }

  if (!safeForm.startDate || !safeForm.endDate) {
    return ''
  }

  if (!safeForm.hasExactTime) {
    return `${safeForm.startDate} ~ ${safeForm.endDate}`
  }

  if (!safeForm.startTime || !safeForm.endTime) {
    return ''
  }

  return `${safeForm.startDate} ${safeForm.startTime} ~ ${safeForm.endDate} ${safeForm.endTime}`
}

function getTimeTypeIndex(value) {
  const index = TIME_TYPE_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 0 : index
}

function getTemplateTypeIndex(value) {
  const index = TEMPLATE_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 0 : index
}

function getActivityModeIndex(value) {
  const index = ACTIVITY_MODE_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 0 : index
}

function getActivityTypeIndex(value) {
  const index = ACTIVITY_TYPE_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 0 : index
}

function normalizeEditorTemplateType(value) {
  if (value === 'template2' || value === 'template3') {
    return value
  }

  return 'template1'
}

function normalizeEditorActivityMode(value) {
  return value === 'online' ? 'online' : 'offline'
}

function normalizeEditorActivityType(value) {
  return value === 'rewardClaim' ? 'rewardClaim' : 'normal'
}

function canSetReadingIncentiveActivity(form) {
  return normalizeEditorActivityMode(form && form.activityMode) === 'offline'
    && normalizeEditorActivityType(form && form.activityType) !== 'rewardClaim'
}

function getShapeTypeIndex(value) {
  const index = SHAPE_OPTIONS.findIndex((item) => item.value === value)
  return index === -1 ? 0 : index
}

function getFileExtension(filePath) {
  const safePath = String(filePath || '')
  const dotIndex = safePath.lastIndexOf('.')

  if (dotIndex === -1) {
    return 'png'
  }

  return safePath.slice(dotIndex + 1).toLowerCase()
}

function normalizeFormByTimeType(form, nextTimeType) {
  const safeForm = normalizeTimeForm(form)
  const baseDate = safeForm.startDate || safeForm.endDate || ''

  if (nextTimeType === 'singlePoint') {
    return {
      ...safeForm,
      timeType: nextTimeType,
      startDate: baseDate,
      endDate: baseDate,
      hasExactTime: true,
      endTime: safeForm.startTime || '19:00'
    }
  }

  if (nextTimeType === 'singleDayRange') {
    return {
      ...safeForm,
      timeType: nextTimeType,
      startDate: baseDate,
      endDate: baseDate,
      hasExactTime: true
    }
  }

  return {
    ...safeForm,
    timeType: nextTimeType,
    startDate: safeForm.startDate || baseDate,
    endDate: safeForm.endDate || baseDate,
    hasExactTime: false
  }
}

function parseLegacyTime(activity) {
  const sourceText = (activity.timeText || activity.activityTime || '').trim()

  if (!sourceText) {
    return {
      timeType: 'singlePoint',
      startDate: '',
      endDate: '',
      hasExactTime: true,
      startTime: '19:00',
      endTime: '21:00',
      timeText: ''
    }
  }

  if (sourceText.indexOf(' ~ ') > -1) {
    const parts = sourceText.split(' ~ ')
    const startPart = parts[0] || ''
    const endPart = parts[1] || ''
    const startTokens = startPart.split(' ')
    const endTokens = endPart.split(' ')
    const startDate = startTokens[0] || ''
    const endDate = endTokens[0] || ''
    const hasExactTime = startTokens.length > 1 || endTokens.length > 1

    return {
      timeType: 'dateRange',
      startDate,
      endDate,
      hasExactTime,
      startTime: startTokens[1] || '19:00',
      endTime: endTokens[1] || '21:00',
      timeText: sourceText
    }
  }

  if (sourceText.indexOf(' - ') > -1) {
    const parts = sourceText.split(' - ')
    const startPart = parts[0] || ''
    const endPart = parts[1] || ''
    const startTokens = startPart.split(' ')

    return {
      timeType: 'singleDayRange',
      startDate: startTokens[0] || '',
      endDate: startTokens[0] || '',
      hasExactTime: true,
      startTime: startTokens[1] || '19:00',
      endTime: endPart || '21:00',
      timeText: sourceText
    }
  }

  const tokens = sourceText.split(' ')

  return {
    timeType: 'singlePoint',
    startDate: tokens[0] || '',
    endDate: tokens[0] || '',
    hasExactTime: true,
    startTime: tokens[1] || '19:00',
    endTime: tokens[1] || '19:00',
    timeText: sourceText
  }
}

function isActivityOngoing(activity, currentTimestamp = Date.now()) {
  const startTimestamp = Number(activity && activity.sortTime) || 0
  const endTimestamp = Number(activity && activity.endSortTime) || startTimestamp

  if (!startTimestamp || !endTimestamp) {
    return false
  }

  return currentTimestamp >= startTimestamp && currentTimestamp <= endTimestamp
}

function buildCurrentOfflineActivityList(list) {
  const currentTimestamp = Date.now()

  return (list || []).filter((item) => {
    return item
      && item.status === 'published'
      && !item.isScheduled
      && normalizeEditorActivityMode(item.activityMode) === 'offline'
      && isActivityOngoing(item, currentTimestamp)
  })
}

function getActivityDistanceToNow(item, currentTimestamp = Date.now()) {
  const startTimestamp = Number(item && item.sortTime) || 0
  const endTimestamp = Number(item && item.endSortTime) || startTimestamp

  if (startTimestamp && endTimestamp && currentTimestamp >= startTimestamp && currentTimestamp <= endTimestamp) {
    return 0
  }

  if (startTimestamp && endTimestamp) {
    return Math.min(
      Math.abs(startTimestamp - currentTimestamp),
      Math.abs(endTimestamp - currentTimestamp)
    )
  }

  if (startTimestamp) {
    return Math.abs(startTimestamp - currentTimestamp)
  }

  return Number.MAX_SAFE_INTEGER
}

function buildNearestActivityPreviewList(list, limit = 2) {
  const currentTimestamp = Date.now()

  return (list || [])
    .slice()
    .sort((a, b) => {
      const distanceDiff = getActivityDistanceToNow(a, currentTimestamp) - getActivityDistanceToNow(b, currentTimestamp)

      if (distanceDiff !== 0) {
        return distanceDiff
      }

      return (Number(a && a.sortTime) || 0) - (Number(b && b.sortTime) || 0)
    })
    .slice(0, limit)
}

function buildFormFromActivity(activity) {
  const legacyTime = parseLegacyTime(activity)
  const displayConfig = activity && activity.displayConfig && typeof activity.displayConfig === 'object'
    ? activity.displayConfig
    : {}
  const templateData = normalizeTemplateData(displayConfig.templateData)
  const resolvedTemplateType = normalizeEditorTemplateType(
    activity && activity.templateType
      ? activity.templateType
      : displayConfig.templateType
  )
  const resolvedActivityType = normalizeEditorActivityType(activity && activity.activityType)
  const rewardMeta = getCurrentRewardMeta()
  const timeType = activity.timeType || legacyTime.timeType
  const startDate = activity.startDate || legacyTime.startDate
  const endDate = activity.endDate || legacyTime.endDate
  const hasExactTime = typeof activity.hasExactTime === 'boolean' ? activity.hasExactTime : legacyTime.hasExactTime
  const startTime = activity.startTime || legacyTime.startTime
  const endTime = activity.endTime || legacyTime.endTime
  const timeText = buildTimeText({
    timeType,
    startDate,
    endDate,
    hasExactTime,
    startTime,
    endTime
  }) || activity.timeText || legacyTime.timeText
  const publishAt = Number(activity.publishAt) || 0
  const publishDate = publishAt ? formatDateByTimestamp(publishAt) : ''
  const publishTime = publishAt ? formatTimeByTimestamp(publishAt) : '09:00'

  return {
    title: activity.title || '',
    timeType,
    startDate,
    endDate,
    hasExactTime,
    startTime,
    endTime,
    timeText,
    hasPublishSchedule: !!publishAt,
    publishDate,
    publishTime,
    publishTimeText: publishAt ? `${publishDate} ${publishTime}` : '',
    location: activity.location || '',
    description: activity.description || '',
    theme: activity.theme || '',
    officialAccountUrl: activity.officialAccountUrl || '',
    activityMode: normalizeEditorActivityMode(activity.activityMode),
    activityType: resolvedActivityType,
    isReadingIncentiveActivity: !!(
      activity.isReadingIncentiveActivity === true
      || activity.isCurrentReadingIncentive === true
    ),
    rewardMonthKey: resolvedActivityType === 'rewardClaim'
      ? (activity.rewardMonthKey || rewardMeta.monthKey)
      : '',
    rewardLabel: resolvedActivityType === 'rewardClaim'
      ? (activity.rewardLabel || rewardMeta.rewardLabel)
      : '',
    coverUrl: activity.coverUrl || '',
    templateType: resolvedTemplateType,
    templateData
  }
}

Page({
  data: {
      form: buildDefaultForm(),
      editingActivityId: '',
      editingOriginalTimeSignature: '',
      duplicateReady: false,
      duplicateHintText: '',
      pendingEditActivityId: '',
      submitting: false,
      uploadingCover: false,
      uploadingTemplateAsset: false,
      loading: false,
      activityList: [],
      activityPreviewList: [],
      currentOfflineActivityList: [],
      permission: buildDefaultPermission(),
    timeTypeOptions: TIME_TYPE_OPTIONS.map((item) => item.label),
    timeTypeIndex: getTimeTypeIndex('singlePoint'),
    activityModeOptions: ACTIVITY_MODE_OPTIONS.map((item) => item.label),
    activityModeIndex: getActivityModeIndex('offline'),
    activityTypeOptions: ACTIVITY_TYPE_OPTIONS.map((item) => item.label),
    activityTypeIndex: getActivityTypeIndex('normal'),
    templateTypeOptions: TEMPLATE_OPTIONS.map((item) => item.label),
    templateTypeIndex: getTemplateTypeIndex('template1'),
    shapeTypeOptions: SHAPE_OPTIONS.map((item) => item.label),
    templatePanelExpanded: {
      text: false,
      image: false,
      shapes: false
    },
    template1Preview: buildEmptyTemplate1Preview(),
    template2Preview: buildEmptyTemplate2Preview(),
    ...buildPrivacyReminderData()
  },

  ...privacyReminderMethods,

  onLoad(options = {}) {
      const systemInfo = wx.getSystemInfoSync()
      this.pxPerRpx = systemInfo.windowWidth / 750
      this.applyForm(this.data.form)
      if (options.activityId) {
        this.setData({
          pendingEditActivityId: options.activityId
        })
      }
    },

  applyForm(nextForm, extraData = {}) {
    const safeForm = {
      ...nextForm,
      hasPublishSchedule: !!nextForm.hasPublishSchedule,
      publishDate: nextForm.publishDate || '',
      publishTime: nextForm.publishTime || '09:00',
      publishTimeText: buildPublishTimeText({
        ...nextForm,
        hasPublishSchedule: !!nextForm.hasPublishSchedule,
        publishDate: nextForm.publishDate || '',
        publishTime: nextForm.publishTime || '09:00'
      }),
      activityMode: normalizeEditorActivityMode(nextForm.activityMode),
      activityType: normalizeEditorActivityType(nextForm.activityType),
      isReadingIncentiveActivity: !!nextForm.isReadingIncentiveActivity,
      templateData: normalizeTemplateData(nextForm.templateData)
    }

    if (!canSetReadingIncentiveActivity(safeForm)) {
      safeForm.isReadingIncentiveActivity = false
    }

    const nextEditingActivityId = hasOwnProperty(extraData, 'editingActivityId')
      ? extraData.editingActivityId
      : this.data.editingActivityId
    const nextEditingOriginalTimeSignature = hasOwnProperty(extraData, 'editingOriginalTimeSignature')
      ? extraData.editingOriginalTimeSignature
      : this.data.editingOriginalTimeSignature
    const duplicateReady = isDuplicatePublishReady(
      nextEditingActivityId,
      nextEditingOriginalTimeSignature,
      safeForm
    )
    const duplicateHintText = buildDuplicatePublishHint(
      nextEditingActivityId,
      nextEditingOriginalTimeSignature,
      safeForm
    )

    this.setData({
      form: safeForm,
      activityModeIndex: getActivityModeIndex(safeForm.activityMode),
      activityTypeIndex: getActivityTypeIndex(safeForm.activityType),
      template1Preview: buildTemplate1Preview(safeForm, this.pxPerRpx || (wx.getSystemInfoSync().windowWidth / 750)),
      template2Preview: buildTemplate2Preview(safeForm, this.pxPerRpx || (wx.getSystemInfoSync().windowWidth / 750)),
      duplicateReady,
      duplicateHintText,
      ...extraData
    })
  },

  updateTemplateData(nextTemplateData, extraData = {}) {
    const nextForm = {
      ...this.data.form,
      templateData: normalizeTemplateData(nextTemplateData)
    }

    this.applyForm(nextForm, extraData)
  },

  validateSubmitForm(form) {
    if (!this.data.permission.activityPermission) {
      return '当前账号没有活动管理权限'
    }

    if (!form.title.trim()) {
      return '请填写活动标题'
    }

    const timeErrorMessage = this.validateTimeForm(form)

    if (timeErrorMessage) {
      return timeErrorMessage
    }

    if (form.hasPublishSchedule && (!form.publishDate || !form.publishTime)) {
      return '请完整选择发布时间'
    }

    if (!form.theme.trim()) {
      return '请填写活动主题'
    }

    if (normalizeText(form.officialAccountUrl) && !isValidArticleUrl(form.officialAccountUrl)) {
      return '请填写有效的相关公众号链接'
    }

    return ''
  },

  onShow() {
    this.getActivityList()
  },

  onPullDownRefresh() {
    this.getActivityList({
      stopPullDownRefresh: true
    })
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    this.applyForm({
      ...this.data.form,
      [field]: e.detail.value
    })
  },

  onTimeTypeChange(e) {
    const nextIndex = Number(e.detail.value)
    const nextOption = TIME_TYPE_OPTIONS[nextIndex]

    if (!nextOption) {
      return
    }

    const nextForm = normalizeFormByTimeType(this.data.form, nextOption.value)
    nextForm.timeText = buildTimeText(nextForm)

    this.applyForm(nextForm, {
      timeTypeIndex: nextIndex
    })
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    const nextForm = {
      ...this.data.form,
      [field]: e.detail.value
    }

    nextForm.timeText = buildTimeText(nextForm)

    this.applyForm(nextForm)
  },

  onTimeChange(e) {
    const field = e.currentTarget.dataset.field

    if (!field) {
      return
    }

    const nextForm = {
      ...this.data.form,
      [field]: e.detail.value
    }

    nextForm.timeText = buildTimeText(nextForm)

    this.applyForm(nextForm)
  },

  onExactTimeChange(e) {
    const nextForm = {
      ...this.data.form,
      hasExactTime: !!e.detail.value
    }

    nextForm.timeText = buildTimeText(nextForm)

    this.applyForm(nextForm)
  },

  onPublishScheduleChange(e) {
    const hasPublishSchedule = !!e.detail.value
    const nextForm = {
      ...this.data.form,
      hasPublishSchedule,
      publishDate: hasPublishSchedule ? (this.data.form.publishDate || this.data.form.startDate || '') : '',
      publishTime: hasPublishSchedule ? (this.data.form.publishTime || '09:00') : '09:00'
    }

    this.applyForm(nextForm)
  },

  onActivityModeChange(e) {
    const nextIndex = Number(e.detail.value)
    const nextOption = ACTIVITY_MODE_OPTIONS[nextIndex]

    if (!nextOption) {
      return
    }

    this.applyForm({
      ...this.data.form,
      activityMode: nextOption.value
    }, {
      activityModeIndex: nextIndex
    })
  },

  onActivityTypeChange(e) {
    const nextIndex = Number(e.detail.value)
    const nextOption = ACTIVITY_TYPE_OPTIONS[nextIndex]

    if (!nextOption) {
      return
    }

    const rewardMeta = getCurrentRewardMeta()
    const nextActivityType = normalizeEditorActivityType(nextOption.value)

    this.applyForm({
      ...this.data.form,
      activityType: nextActivityType,
      rewardMonthKey: nextActivityType === 'rewardClaim'
        ? (this.data.form.rewardMonthKey || rewardMeta.monthKey)
        : '',
      rewardLabel: nextActivityType === 'rewardClaim'
        ? (this.data.form.rewardLabel || rewardMeta.rewardLabel)
        : ''
    }, {
      activityTypeIndex: nextIndex
    })
  },

  onReadingIncentiveChange(e) {
    this.applyForm({
      ...this.data.form,
      isReadingIncentiveActivity: !!e.detail.value
    })
  },

  onTemplateTypeChange(e) {
    const nextIndex = Number(e.detail.value)
    const nextOption = TEMPLATE_OPTIONS[nextIndex]
    const templateData = normalizeTemplateData(this.data.form.templateData)

    if (!nextOption) {
      return
    }

    this.applyForm({
      ...this.data.form,
      templateType: nextOption.value,
      templateData
    }, {
      templateTypeIndex: nextIndex
    })
  },

  onTemplate1ScaleChange(e) {
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextScalePercent = clampNumber(
      Number(e.detail.value) || TEMPLATE1_THUMB_MIN_SCALE,
      TEMPLATE1_THUMB_MIN_SCALE,
      TEMPLATE1_THUMB_MAX_SCALE
    )
    const nextMaxOffset = getTemplate1ThumbMaxOffset(nextScalePercent)

    this.updateTemplateData({
      ...templateData,
      thumbElement: {
        ...templateData.thumbElement,
        scalePercent: nextScalePercent,
        x: clampNumber(templateData.thumbElement.x, -nextMaxOffset, nextMaxOffset),
        y: clampNumber(templateData.thumbElement.y, -nextMaxOffset, nextMaxOffset)
      }
    })
  },

  onTemplate1ThumbTouchStart(e) {
    if (!this.data.form.coverUrl) {
      return
    }

    const touch = e.touches && e.touches[0]

    if (!touch) {
      return
    }

    const templateData = normalizeTemplateData(this.data.form.templateData)

    this.template1ThumbDrag = {
      startX: touch.clientX,
      startY: touch.clientY,
      originX: templateData.thumbElement.x,
      originY: templateData.thumbElement.y
    }
  },

  onTemplate1ThumbTouchMove(e) {
    if (!this.template1ThumbDrag || !this.data.form.coverUrl) {
      return
    }

    const touch = e.touches && e.touches[0]

    if (!touch) {
      return
    }

    const templateData = normalizeTemplateData(this.data.form.templateData)
    const thumbElement = templateData.thumbElement
    const nextMaxOffset = getTemplate1ThumbMaxOffset(thumbElement.scalePercent)
    const deltaXRpx = pxToRpx(touch.clientX - this.template1ThumbDrag.startX, this.pxPerRpx)
    const deltaYRpx = pxToRpx(touch.clientY - this.template1ThumbDrag.startY, this.pxPerRpx)

    this.updateTemplateData({
      ...templateData,
      thumbElement: {
        ...thumbElement,
        x: clampNumber(this.template1ThumbDrag.originX + deltaXRpx, -nextMaxOffset, nextMaxOffset),
        y: clampNumber(this.template1ThumbDrag.originY + deltaYRpx, -nextMaxOffset, nextMaxOffset)
      }
    })
  },

  onTemplate1ThumbTouchEnd() {
    this.template1ThumbDrag = null
  },

  onTemplateBackgroundInput(e) {
    const templateData = normalizeTemplateData(this.data.form.templateData)

    this.updateTemplateData({
      ...templateData,
      backgroundColor: e.detail.value
    })
  },

  onToggleTemplatePanel(e) {
    const panel = e.currentTarget.dataset.panel

    if (!panel) {
      return
    }

    this.setData({
      [`templatePanelExpanded.${panel}`]: !this.data.templatePanelExpanded[panel]
    })
  },

  onTextGroupFieldInput(e) {
    const field = e.currentTarget.dataset.field
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextTextGroup = {
      ...templateData.textGroup
    }

    if (!field) {
      return
    }

    if (field === 'color') {
      nextTextGroup.color = e.detail.value
    } else if (field === 'width') {
      nextTextGroup.width = Math.max(120, normalizeShapeValue(e.detail.value, nextTextGroup.width))
    } else {
      nextTextGroup[field] = Math.max(0, normalizeShapeValue(e.detail.value, nextTextGroup[field]))
    }

    this.updateTemplateData({
      ...templateData,
      textGroup: nextTextGroup
    })
  },

  onTextFieldInput(e) {
    const key = e.currentTarget.dataset.key
    const field = e.currentTarget.dataset.field
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextTextGroup = {
      ...templateData.textGroup
    }
    const nextField = nextTextGroup[key] && typeof nextTextGroup[key] === 'object'
      ? { ...nextTextGroup[key] }
      : null

    if (!key || !field || !nextField) {
      return
    }

    if (field === 'color') {
      nextField.color = e.detail.value
    } else if (field === 'fontSize') {
      nextField.fontSize = clampNumber(normalizeShapeValue(e.detail.value, nextField.fontSize), 18, 60)
    } else if (field === 'x') {
      nextField.x = clampNumber(normalizeShapeValue(e.detail.value, nextField.x), 0, TEMPLATE2_BOARD_WIDTH - 40)
    } else if (field === 'y') {
      nextField.y = clampNumber(normalizeShapeValue(e.detail.value, nextField.y), 0, TEMPLATE2_BOARD_HEIGHT - 30)
    }

    this.updateTemplateData({
      ...templateData,
      textGroup: {
        ...nextTextGroup,
        [key]: nextField
      }
    })
  },

  onTextVisibilityChange(e) {
    const key = e.currentTarget.dataset.key
    const templateData = normalizeTemplateData(this.data.form.templateData)

    if (!key || !templateData.textGroup[key]) {
      return
    }

    this.updateTemplateData({
      ...templateData,
      textGroup: {
        ...templateData.textGroup,
        [key]: {
          ...templateData.textGroup[key],
          visible: !!e.detail.value
        }
      }
    })
  },

  onPreviewTextGroupChange(e) {
    const templateData = normalizeTemplateData(this.data.form.templateData)

    this.updateTemplateData({
      ...templateData,
      textGroup: {
        ...templateData.textGroup,
        x: pxToRpx(e.detail.x, this.pxPerRpx),
        y: pxToRpx(e.detail.y, this.pxPerRpx)
      }
    })
  },

  onChooseTemplateImage() {
    if (this.data.uploadingTemplateAsset) {
      return
    }

    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseTemplateImage('camera')
          return
        }

        if (res.tapIndex === 1) {
          this.chooseTemplateImage('album')
        }
      }
    })
  },

  chooseTemplateImage(sourceType) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: [sourceType],
      success: (res) => {
        const tempFilePath = res.tempFilePaths && res.tempFilePaths[0]

        if (!tempFilePath) {
          return
        }

        this.setData({
          uploadingTemplateAsset: true
        })

        wx.showLoading({
          title: '上传中...'
        })

        wx.cloud.uploadFile({
          cloudPath: buildTemplateAssetCloudPath(tempFilePath),
          filePath: tempFilePath
        }).then((uploadRes) => {
          const templateData = normalizeTemplateData(this.data.form.templateData)

          this.updateTemplateData({
            ...templateData,
            imageElement: {
              ...templateData.imageElement,
              url: uploadRes.fileID
            }
          })

          wx.hideLoading()
          wx.showToast({
            title: '模板图片已上传',
            icon: 'success'
          })
        }).catch((error) => {
          wx.hideLoading()
          console.error('upload template image error:', error)
          wx.showToast({
            title: '模板图片上传失败',
            icon: 'none'
          })
        }).finally(() => {
          this.setData({
            uploadingTemplateAsset: false
          })
        })
      }
    })
  },

  onClearTemplateImage() {
    const templateData = normalizeTemplateData(this.data.form.templateData)

    this.updateTemplateData({
      ...templateData,
      imageElement: {
        ...templateData.imageElement,
        url: ''
      }
    })
  },

  onImageElementFieldInput(e) {
    const field = e.currentTarget.dataset.field
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextImageElement = {
      ...templateData.imageElement
    }

    if (!field) {
      return
    }

    if (field === 'width' || field === 'height') {
      nextImageElement[field] = Math.max(40, normalizeShapeValue(e.detail.value, nextImageElement[field]))
    } else {
      nextImageElement[field] = Math.max(0, normalizeShapeValue(e.detail.value, nextImageElement[field]))
    }

    this.updateTemplateData({
      ...templateData,
      imageElement: nextImageElement
    })
  },

  onPreviewImageChange(e) {
    const templateData = normalizeTemplateData(this.data.form.templateData)

    this.updateTemplateData({
      ...templateData,
      imageElement: {
        ...templateData.imageElement,
        x: pxToRpx(e.detail.x, this.pxPerRpx),
        y: pxToRpx(e.detail.y, this.pxPerRpx)
      }
    })
  },

  onAddShapeTap() {
    wx.showActionSheet({
      itemList: SHAPE_OPTIONS.map((item) => item.label),
      success: (res) => {
        const nextOption = SHAPE_OPTIONS[res.tapIndex]

        if (!nextOption) {
          return
        }

        const templateData = normalizeTemplateData(this.data.form.templateData)
        const nextShapes = templateData.shapes.concat(buildDefaultShape(nextOption.value))

        this.updateTemplateData({
          ...templateData,
          shapes: nextShapes
        })
      }
    })
  },

  onShapeTypeChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const optionIndex = Number(e.detail.value)
    const nextOption = SHAPE_OPTIONS[optionIndex]
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextShapes = templateData.shapes.slice()

    if (!nextOption || Number.isNaN(index) || index < 0 || index >= nextShapes.length) {
      return
    }

    nextShapes[index] = {
      ...nextShapes[index],
      shapeType: nextOption.value,
      shapeTypeIndex: optionIndex
    }

    this.updateTemplateData({
      ...templateData,
      shapes: nextShapes
    })
  },

  onShapeFieldInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextShapes = templateData.shapes.slice()

    if (!field || Number.isNaN(index) || index < 0 || index >= nextShapes.length) {
      return
    }

    const currentShape = nextShapes[index]
    const nextValue = e.detail.value

    if (field === 'color') {
      const parsedColorMeta = parseShapeColorMeta(nextValue, {
        h: currentShape.colorHue,
        s: currentShape.colorSaturation,
        l: currentShape.colorLightness
      })

      nextShapes[index] = {
        ...currentShape,
        colorHue: parsedColorMeta.h,
        colorSaturation: parsedColorMeta.s,
        colorLightness: parsedColorMeta.l,
        color: buildHslColor(parsedColorMeta.h, parsedColorMeta.s, parsedColorMeta.l)
      }
    } else if (field === 'width' || field === 'height') {
      nextShapes[index] = {
        ...currentShape,
        [field]: Math.max(20, normalizeShapeValue(nextValue, currentShape[field]))
      }
    } else if (field === 'opacity') {
      nextShapes[index] = {
        ...currentShape,
        opacity: Math.min(100, Math.max(0, normalizeShapeValue(nextValue, currentShape[field])))
      }
    } else {
      nextShapes[index] = {
        ...currentShape,
        [field]: Math.max(0, normalizeShapeValue(nextValue, currentShape[field]))
      }
    }

    this.updateTemplateData({
      ...templateData,
      shapes: nextShapes
    })
  },

  onShapeColorSliderChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const field = e.currentTarget.dataset.field
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextShapes = templateData.shapes.slice()

    if (!field || Number.isNaN(index) || index < 0 || index >= nextShapes.length) {
      return
    }

    const currentShape = nextShapes[index]
    const nextShape = {
      ...currentShape
    }
    const nextValue = Number(e.detail.value)

    if (field === 'colorHue') {
      nextShape.colorHue = clampNumber(nextValue || 0, 0, 360)
    } else if (field === 'colorSaturation') {
      nextShape.colorSaturation = clampNumber(nextValue || 0, 0, 100)
    } else if (field === 'colorLightness') {
      nextShape.colorLightness = clampNumber(nextValue || 0, 0, 100)
    } else {
      return
    }

    nextShape.color = buildHslColor(nextShape.colorHue, nextShape.colorSaturation, nextShape.colorLightness)
    nextShapes[index] = nextShape

    this.updateTemplateData({
      ...templateData,
      shapes: nextShapes
    })
  },

  onShapeOpacityChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextShapes = templateData.shapes.slice()

    if (Number.isNaN(index) || index < 0 || index >= nextShapes.length) {
      return
    }

    nextShapes[index] = {
      ...nextShapes[index],
      opacity: Math.min(100, Math.max(0, Number(e.detail.value) || 0))
    }

    this.updateTemplateData({
      ...templateData,
      shapes: nextShapes
    })
  },

  onPreviewShapeChange(e) {
    const index = Number(e.currentTarget.dataset.index)
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextShapes = templateData.shapes.slice()

    if (Number.isNaN(index) || index < 0 || index >= nextShapes.length) {
      return
    }

    nextShapes[index] = {
      ...nextShapes[index],
      x: pxToRpx(e.detail.x, this.pxPerRpx),
      y: pxToRpx(e.detail.y, this.pxPerRpx)
    }

    this.updateTemplateData({
      ...templateData,
      shapes: nextShapes
    })
  },

  onRemoveShapeTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const templateData = normalizeTemplateData(this.data.form.templateData)
    const nextShapes = templateData.shapes.slice()

    if (Number.isNaN(index) || index < 0 || index >= nextShapes.length) {
      return
    }

    nextShapes.splice(index, 1)

    this.updateTemplateData({
      ...templateData,
      shapes: nextShapes
    })
  },

  onChooseCover() {
    if (this.data.uploadingCover) {
      return
    }

    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseCoverImage('camera')
          return
        }

        if (res.tapIndex === 1) {
          this.chooseCoverImage('album')
        }
      }
    })
  },

  chooseCoverImage(sourceType) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: [sourceType],
      success: (res) => {
        const tempFilePath = res.tempFilePaths && res.tempFilePaths[0]

        if (!tempFilePath) {
          return
        }

        wx.navigateTo({
          url: '/pages/avatar-editor/avatar-editor?mode=activityCover',
          success: (navRes) => {
            navRes.eventChannel.emit('acceptActivityCoverImage', {
              tempFilePath
            })

            navRes.eventChannel.on('acceptEditedActivityCover', ({ coverUrl }) => {
              if (!coverUrl) {
                return
              }

              this.applyForm({
                ...this.data.form,
                coverUrl
              })

              wx.showToast({
                title: '封面已更新',
                icon: 'success'
              })
            })
          }
        })
      }
    })
  },

  onClearCover() {
    this.applyForm({
      ...this.data.form,
      coverUrl: ''
    })
  },

  getActivityList(options = {}) {
    this.setData({
      loading: true
    })

    wx.cloud.callFunction({
      name: 'getActivityList',
        data: {
          limit: 100,
          includePast: true,
          withPermission: true
        }
      }).then((res) => {
        const result = res.result || {}

        if (result.success) {
          this.setData({
            activityList: result.list || [],
            activityPreviewList: buildNearestActivityPreviewList(result.list || []),
            currentOfflineActivityList: buildCurrentOfflineActivityList(result.list || []),
            permission: result.currentUserPermission || buildDefaultPermission()
          })

          if (this.data.pendingEditActivityId) {
            this.startEditActivity(this.data.pendingEditActivityId, result.list || [], {
              clearPending: true
            })
          }
        } else {
          this.setData({
            activityList: [],
            activityPreviewList: [],
            currentOfflineActivityList: [],
            permission: buildDefaultPermission()
          })
        }
      }).catch((error) => {
        console.error('admin getActivityList error:', error)
        this.setData({
          activityList: [],
          activityPreviewList: [],
          currentOfflineActivityList: [],
          permission: buildDefaultPermission()
        })
      wx.showToast({
        title: '活动列表加载失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        loading: false
      })

      if (options.stopPullDownRefresh) {
        wx.stopPullDownRefresh()
      }
    })
  },

  validateTimeForm(form) {
    if (form.timeType === 'singlePoint') {
      if (!form.startDate || !form.startTime) {
        return '请完整选择活动时间'
      }

      return ''
    }

    if (form.timeType === 'singleDayRange') {
      if (!form.startDate || !form.startTime || !form.endTime) {
        return '请完整选择活动时间'
      }

      const startTimestamp = getTimestamp(form.startDate, form.startTime)
      const endTimestamp = getTimestamp(form.startDate, form.endTime)

      if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
        return '活动时间格式不正确'
      }

      if (endTimestamp < startTimestamp) {
        return '结束时间不能早于开始时间'
      }

      return ''
    }

    if (!form.startDate || !form.endDate) {
      return '请完整选择活动日期范围'
    }

    const startDateTimestamp = getTimestamp(form.startDate, '00:00')
    const endDateTimestamp = getTimestamp(form.endDate, '23:59')

    if (Number.isNaN(startDateTimestamp) || Number.isNaN(endDateTimestamp)) {
      return '活动日期格式不正确'
    }

    if (endDateTimestamp < startDateTimestamp) {
      return '结束日期不能早于开始日期'
    }

    if (!form.hasExactTime) {
      return ''
    }

    if (!form.startTime || !form.endTime) {
      return '请完整选择具体时间'
    }

    const startDateTime = getTimestamp(form.startDate, form.startTime)
    const endDateTime = getTimestamp(form.endDate, form.endTime)

    if (Number.isNaN(startDateTime) || Number.isNaN(endDateTime)) {
      return '具体时间格式不正确'
    }

    if (endDateTime < startDateTime) {
      return '结束时间不能早于开始时间'
    }

    return ''
  },

  onSubmit() {
    const form = this.data.form
    const validationMessage = this.validateSubmitForm(form)

    if (validationMessage) {
      wx.showToast({
        title: validationMessage,
        icon: 'none'
      })
      return
    }

    const confirmMessage = getMissingOptionalMessage(form)

    if (confirmMessage) {
      wx.showModal({
        title: '确认发布',
        content: confirmMessage,
        confirmText: '确认发布',
        cancelText: '返回填写',
        success: (res) => {
          if (res.confirm) {
            this.submitActivity()
          }
        }
      })
      return
    }

    this.submitActivity()
  },

  onDuplicatePublishTap() {
    const form = this.data.form

    if (!this.data.editingActivityId) {
      wx.showToast({
        title: '请先进入活动编辑状态',
        icon: 'none'
      })
      return
    }

    const validationMessage = this.validateSubmitForm(form)

    if (validationMessage) {
      wx.showToast({
        title: validationMessage,
        icon: 'none'
      })
      return
    }

    if (buildActivityTimeSignature(form) === this.data.editingOriginalTimeSignature) {
      wx.showModal({
        title: '无法复制发布',
        content: '当前活动时间未修改，请先调整活动时间后，再复制并发布新活动。',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    const missingOptionalMessage = getMissingOptionalMessage(form)
    const content = [
      '将保留原活动信息不变，并按当前表单内容发布一条新的活动。',
      '已检测到活动时间已修改，可以继续复制发布。'
    ]

    if (missingOptionalMessage) {
      content.push(missingOptionalMessage)
    }

    wx.showModal({
      title: '复制并发布新活动',
      content: content.join('\n\n'),
      confirmText: '发布新活动',
      cancelText: '继续编辑',
      success: (res) => {
        if (res.confirm) {
          this.submitActivity({
            duplicateAsNew: true
          })
        }
      }
    })
  },

  submitActivity(options = {}) {
    const form = this.data.form
    const duplicateAsNew = !!options.duplicateAsNew
    const templateType = normalizeEditorTemplateType(form.templateType)
    const activityType = normalizeEditorActivityType(form.activityType)
    const rewardMeta = getCurrentRewardMeta()

    if (this.data.submitting) {
      return
    }

    this.setData({
      submitting: true
    })

    wx.showLoading({
      title: duplicateAsNew ? '发布中...' : '保存中...'
    })

    wx.cloud.callFunction({
      name: 'createOrUpdateActivity',
      data: {
        activityId: duplicateAsNew ? '' : this.data.editingActivityId,
        title: form.title,
        timeType: form.timeType,
        startDate: form.startDate,
        endDate: form.endDate,
        startTime: form.startTime,
        endTime: form.endTime,
        hasExactTime: form.timeType === 'dateRange' ? form.hasExactTime : true,
        hasPublishSchedule: form.hasPublishSchedule,
        publishDate: form.publishDate,
        publishTime: form.publishTime,
        location: form.location,
        description: form.description,
        theme: form.theme,
        officialAccountUrl: normalizeArticleUrl(form.officialAccountUrl),
        activityMode: normalizeEditorActivityMode(form.activityMode),
        activityType,
        isReadingIncentiveActivity: !!form.isReadingIncentiveActivity,
        rewardMonthKey: activityType === 'rewardClaim'
          ? (form.rewardMonthKey || rewardMeta.monthKey)
          : '',
        rewardLabel: activityType === 'rewardClaim'
          ? (form.rewardLabel || rewardMeta.rewardLabel)
          : '',
        coverUrl: form.coverUrl,
        displayConfig: {
          templateType,
          templateData: form.templateData || {}
        }
      }
    }).then((res) => {
      const result = res.result || {}
      const nextActivityId = typeof result.activityId === 'string' ? result.activityId : ''

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        })
        return
      }

      if (duplicateAsNew && nextActivityId) {
        const duplicatedTimeText = buildTimeText(form) || '时间待定'

        this.applyForm(buildDefaultForm(), {
          editingActivityId: '',
          editingOriginalTimeSignature: '',
          pendingEditActivityId: '',
          timeTypeIndex: getTimeTypeIndex('singlePoint'),
          activityTypeIndex: getActivityTypeIndex('normal'),
          templateTypeIndex: getTemplateTypeIndex('template1')
        })
        this.getActivityList()
        wx.showModal({
          title: '新活动已发布',
          content: `已保留原活动，并按当前时间复制发布一条新活动。\n\n活动标题：${form.title}\n活动时间：${duplicatedTimeText}`,
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }

      wx.showToast({
        title: this.data.editingActivityId ? '活动已更新' : '活动已创建',
        icon: 'success'
      })

      this.applyForm(buildDefaultForm(), {
        editingActivityId: '',
        editingOriginalTimeSignature: '',
        timeTypeIndex: getTimeTypeIndex('singlePoint'),
        activityTypeIndex: getActivityTypeIndex('normal'),
        templateTypeIndex: getTemplateTypeIndex('template1')
      })

      this.getActivityList()
    }).catch((error) => {
      wx.hideLoading()
      console.error('createOrUpdateActivity error:', error)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }).finally(() => {
      this.setData({
        submitting: false
      })
    })
  },

    startEditActivity(activityId, sourceList = this.data.activityList, options = {}) {
      if (!activityId) {
        return
      }

      const activity = (sourceList || []).find((item) => item._id === activityId)

      if (!activity) {
        return
      }

      const form = buildFormFromActivity(activity)

      this.applyForm(form, {
        editingActivityId: activityId,
        editingOriginalTimeSignature: buildActivityTimeSignature(form),
        pendingEditActivityId: options.clearPending ? '' : this.data.pendingEditActivityId,
        timeTypeIndex: getTimeTypeIndex(form.timeType),
        activityTypeIndex: getActivityTypeIndex(form.activityType),
        templateTypeIndex: getTemplateTypeIndex(form.templateType)
      })
    },

    onEditActivity(e) {
      if (!this.data.permission.activityPermission) {
        wx.showToast({
          title: '当前账号没有活动管理权限',
          icon: 'none'
        })
      return
    }

      const activityId = e.currentTarget.dataset.id
      this.startEditActivity(activityId)
    },

  onResetEdit() {
    this.applyForm(buildDefaultForm(), {
      editingActivityId: '',
      editingOriginalTimeSignature: '',
      timeTypeIndex: getTimeTypeIndex('singlePoint'),
      activityTypeIndex: getActivityTypeIndex('normal'),
      templateTypeIndex: getTemplateTypeIndex('template1')
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
    },

    goActivityListPage() {
      wx.navigateTo({
        url: '/pages/activity-list-manage/activity-list-manage'
      })
    }
  })
