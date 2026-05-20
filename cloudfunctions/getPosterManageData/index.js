const cloud = require('wx-server-sdk')
const {
  CONTENT_TYPE_TEXT_MAP,
  normalizeText,
  normalizeActivityTemplateStyle,
  getActivityTemplateStyleText,
  getDefaultCanvasConfig,
  mergeFieldConfig
} = require('./shared/posterTemplateSchema')
const {
  ensureCollection,
  getAllRecords,
  getFirstRecord
} = require('./shared/db')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function toTimestamp(value) {
  if (!value) {
    return 0
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}`
}

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

function buildTemplateResponseItem(item) {
  const contentType = normalizeText(item.contentType) || 'reading'
  const templateStyle = contentType === 'activity'
    ? normalizeActivityTemplateStyle(item.templateStyle)
    : ''
  const defaultCanvasConfig = getDefaultCanvasConfig(contentType, templateStyle)

  return {
    templateId: item._id || '',
    templateName: normalizeText(item.templateName),
    contentType,
    contentTypeText: CONTENT_TYPE_TEXT_MAP[contentType] || CONTENT_TYPE_TEXT_MAP.reading,
    templateStyle,
    templateStyleText: contentType === 'activity' ? getActivityTemplateStyleText(templateStyle) : '',
    enabled: item.enabled === true,
    description: normalizeText(item.description),
    backgroundImageUrl: normalizeText(item.backgroundImageFileId || item.backgroundImageUrl),
    backgroundImageFileId: normalizeText(item.backgroundImageFileId || item.backgroundImageUrl),
    miniProgramCodeUrl: normalizeText(item.miniProgramCodeFileId || item.miniProgramCodeUrl),
    miniProgramCodeFileId: normalizeText(item.miniProgramCodeFileId || item.miniProgramCodeUrl),
    customLineText: normalizeText(item.customLineText),
    canvasWidth: String(item.canvasWidth || defaultCanvasConfig.canvasWidth),
    canvasHeight: String(item.canvasHeight || defaultCanvasConfig.canvasHeight),
    fieldConfig: mergeFieldConfig(item.fieldConfig, contentType, templateStyle),
    updatedAt: toTimestamp(item.updatedAt),
    updatedAtText: formatDateTime(item.updatedAt || item.createdAt)
  }
}

exports.main = async () => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    await ensureCollection(db, 'share_poster_templates')

    const userRecord = await getManagerUserRecord(openid)

    if (!canManagePoster(userRecord)) {
      return {
        success: false,
        message: '当前账号没有分享海报管理权限'
      }
    }

    const templateList = (await getAllRecords(db, 'share_poster_templates'))
      .map((item) => buildTemplateResponseItem(item))
      .sort((prev, next) => {
        if (prev.enabled !== next.enabled) {
          return prev.enabled ? -1 : 1
        }

        return next.updatedAt - prev.updatedAt
      })

    const activeTemplateMap = {}

    Object.keys(CONTENT_TYPE_TEXT_MAP).forEach((contentType) => {
      const target = templateList.find((item) => item.contentType === contentType && item.enabled)
      if (target) {
        activeTemplateMap[contentType] = target
      }
    })

    return {
      success: true,
      permissionInfo: {
        superAdmin: userRecord && userRecord.superAdmin === true,
        posterManagePermission: userRecord && userRecord.posterManagePermission === true
      },
      templateList,
      activeTemplateMap
    }
  } catch (error) {
    console.error('getPosterManageData error:', error)
    return {
      success: false,
      message: error.message || '分享海报管理数据加载失败'
    }
  }
}
