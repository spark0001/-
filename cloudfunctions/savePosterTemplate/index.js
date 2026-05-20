const cloud = require('wx-server-sdk')
const {
  MIN_POSTER_CANVAS_SIZE,
  CONTENT_TYPE_OPTIONS,
  DEFAULT_ACTIVITY_TEMPLATE_STYLE,
  normalizeText,
  normalizeActivityTemplateStyle,
  toNumber,
  getDefaultCanvasConfig,
  mergeFieldConfig
} = require('./shared/posterTemplateSchema')
const {
  ensureCollection,
  getFirstRecord
} = require('./shared/db')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const CONTENT_TYPE_VALUE_LIST = CONTENT_TYPE_OPTIONS.map((item) => item.value)

function canManagePoster(userRecord) {
  return !!(
    userRecord
    && (
      userRecord.superAdmin === true
      || (
        userRecord.role === 'admin'
        && userRecord.status === 'approved'
        && userRecord.posterManagePermission === true
      )
    )
  )
}

async function getManagerUserRecord(openid) {
  return getFirstRecord(db, 'users', { openid })
}

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const userRecord = await getManagerUserRecord(openid)

    if (!canManagePoster(userRecord)) {
      return {
        success: false,
        message: '当前账号没有分享海报管理权限'
      }
    }

    await ensureCollection(db, 'share_poster_templates')

    const templateId = normalizeText(event.templateId)
    const templateName = normalizeText(event.templateName)
    const contentType = CONTENT_TYPE_VALUE_LIST.includes(normalizeText(event.contentType))
      ? normalizeText(event.contentType)
      : 'reading'
    const templateStyle = contentType === 'activity'
      ? normalizeActivityTemplateStyle(event.templateStyle)
      : DEFAULT_ACTIVITY_TEMPLATE_STYLE
    const enabled = event.enabled === true
    const description = normalizeText(event.description)
    const backgroundImageUrl = normalizeText(event.backgroundImageUrl)
    const backgroundImageFileId = normalizeText(event.backgroundImageFileId || backgroundImageUrl)
    const miniProgramCodeUrl = normalizeText(event.miniProgramCodeUrl)
    const miniProgramCodeFileId = normalizeText(event.miniProgramCodeFileId || miniProgramCodeUrl)
    const customLineText = normalizeText(event.customLineText)
    const defaultCanvasConfig = getDefaultCanvasConfig(contentType, templateStyle)
    const canvasWidth = Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(event.canvasWidth, defaultCanvasConfig.canvasWidth))
    const canvasHeight = Math.max(MIN_POSTER_CANVAS_SIZE, toNumber(event.canvasHeight, defaultCanvasConfig.canvasHeight))
    const fieldConfig = mergeFieldConfig(event.fieldConfig, contentType, templateStyle)

    if (!templateName) {
      return {
        success: false,
        message: '请先填写模板名称'
      }
    }

    if (!backgroundImageUrl) {
      return {
        success: false,
        message: '请先上传底图'
      }
    }

    if (!canvasWidth || !canvasHeight) {
      return {
        success: false,
        message: '请填写有效画布尺寸'
      }
    }

    const now = new Date()
    const baseData = {
      templateName,
      contentType,
      templateStyle: contentType === 'activity' ? templateStyle : '',
      enabled,
      description,
      backgroundImageUrl,
      backgroundImageFileId,
      miniProgramCodeUrl,
      miniProgramCodeFileId,
      customLineText,
      canvasWidth,
      canvasHeight,
      fieldConfig,
      updatedAt: now,
      updatedBy: openid
    }

    let savedTemplateId = templateId

    if (savedTemplateId) {
      await db.collection('share_poster_templates').doc(savedTemplateId).update({
        data: baseData
      })
    } else {
      const addRes = await db.collection('share_poster_templates').add({
        data: {
          ...baseData,
          createdAt: now,
          createdBy: openid
        }
      })

      savedTemplateId = addRes._id || ''
    }

    return {
      success: true,
      templateId: savedTemplateId
    }
  } catch (error) {
    console.error('savePosterTemplate error:', error)
    return {
      success: false,
      message: error.message || '海报模板保存失败'
    }
  }
}
