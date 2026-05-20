const cloud = require('wx-server-sdk')
const {
  MIN_POSTER_CANVAS_SIZE,
  DEFAULT_CONTENT_TYPE,
  normalizeText,
  normalizeContentType,
  normalizeActivityTemplateStyle,
  toNumber,
  getDefaultCanvasConfig,
  mergeFieldConfig,
  getDefaultTemplateName,
  getDefaultTemplateDescription,
  buildDefaultFieldConfig
} = require('./shared/posterTemplateSchema')
const {
  ensureCollection,
  getAllRecords
} = require('./shared/db')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function buildDefaultTemplate(contentType = DEFAULT_CONTENT_TYPE) {
  const templateStyle = contentType === 'activity' ? 'simpleInfo' : ''
  const defaultCanvasConfig = getDefaultCanvasConfig(contentType, templateStyle)

  return {
    templateId: '',
    templateName: getDefaultTemplateName(contentType),
    contentType,
    enabled: true,
    templateStyle,
    description: getDefaultTemplateDescription(contentType),
    backgroundImageUrl: '',
    backgroundImageFileId: '',
    miniProgramCodeUrl: '',
    miniProgramCodeFileId: '',
    customLineText: '',
    canvasWidth: Number(defaultCanvasConfig.canvasWidth),
    canvasHeight: Number(defaultCanvasConfig.canvasHeight),
    fieldConfig: buildDefaultFieldConfig(contentType, templateStyle),
    source: 'builtin'
  }
}

function buildTemplateItem(item, contentType) {
  const templateStyle = contentType === 'activity'
    ? normalizeActivityTemplateStyle(item.templateStyle)
    : ''
  const defaultCanvasConfig = getDefaultCanvasConfig(contentType, templateStyle)

  return {
    templateId: item._id || '',
    templateName: normalizeText(item.templateName) || getDefaultTemplateName(contentType),
    contentType,
    enabled: item.enabled === true,
    templateStyle,
    description: normalizeText(item.description) || getDefaultTemplateDescription(contentType),
    backgroundImageUrl: normalizeText(item.backgroundImageFileId || item.backgroundImageUrl),
    backgroundImageFileId: normalizeText(item.backgroundImageFileId || item.backgroundImageUrl),
    miniProgramCodeUrl: normalizeText(item.miniProgramCodeFileId || item.miniProgramCodeUrl),
    miniProgramCodeFileId: normalizeText(item.miniProgramCodeFileId || item.miniProgramCodeUrl),
    customLineText: normalizeText(item.customLineText),
    canvasWidth: Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(item.canvasWidth, defaultCanvasConfig.canvasWidth)),
    canvasHeight: Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(item.canvasHeight, defaultCanvasConfig.canvasHeight)),
    fieldConfig: mergeFieldConfig(item.fieldConfig, contentType, templateStyle),
    source: 'configured'
  }
}

exports.main = async (event = {}) => {
  const contentType = normalizeContentType(event.contentType)

  try {
    await ensureCollection(db, 'share_poster_templates')

    const templateList = (await getAllRecords(db, 'share_poster_templates', { contentType }))
      .sort((prev, next) => {
        if ((prev.enabled === true) !== (next.enabled === true)) {
          return prev.enabled === true ? -1 : 1
        }

        const nextTimestamp = new Date(next.updatedAt || next.createdAt || 0).getTime() || 0
        const prevTimestamp = new Date(prev.updatedAt || prev.createdAt || 0).getTime() || 0
        return nextTimestamp - prevTimestamp
      })

    const configuredTemplateList = templateList.map((item) => buildTemplateItem(item, contentType))
    const enabledTemplateList = configuredTemplateList.filter((item) => item.enabled === true)
    const activeTemplate = enabledTemplateList[0] || buildDefaultTemplate(contentType)

    return {
      success: true,
      template: activeTemplate,
      templateList: enabledTemplateList
    }
  } catch (error) {
    console.error('getActivityPosterTemplate error:', error)
    return {
      success: false,
      message: error.message || '分享海报模板加载失败'
    }
  }
}
