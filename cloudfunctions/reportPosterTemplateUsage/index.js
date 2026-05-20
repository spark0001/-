const cloud = require('wx-server-sdk')
const {
  CONTENT_TYPE_TEXT_MAP,
  normalizeText,
  normalizeContentType
} = require('./shared/posterTemplateSchema')
const {
  ensureCollection
} = require('./shared/db')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = normalizeText(wxContext.OPENID)
  const templateKey = normalizeText(event.templateKey || event.templateOptionId || event.optionId || event.templateId)
  const templateId = normalizeText(event.templateId)
  const templateName = normalizeText(event.templateName)
  const contentType = normalizeContentType(event.contentType)
  const previewImageUrl = normalizeText(event.previewImageUrl || event.backgroundImageFileId || event.backgroundImageUrl)
  const source = normalizeText(event.source || 'configured') || 'configured'

  if (!openid) {
    return {
      success: false,
      message: '缺少用户信息'
    }
  }

  if (!templateKey || !contentType || !CONTENT_TYPE_TEXT_MAP[contentType]) {
    return {
      success: false,
      message: '缺少海报模板信息'
    }
  }

  try {
    await ensureCollection(db, 'poster_template_events')

    await db.collection('poster_template_events').add({
      data: {
        openid,
        eventType: 'generate',
        templateKey,
        templateId,
        templateName,
        contentType,
        previewImageUrl,
        source,
        createdAt: new Date()
      }
    })

    return {
      success: true
    }
  } catch (error) {
    return {
      success: false,
      message: '记录海报模板使用失败',
      error: error.message || error
    }
  }
}
