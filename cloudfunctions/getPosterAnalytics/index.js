const cloud = require('wx-server-sdk')
const {
  CONTENT_TYPE_TEXT_MAP,
  normalizeText,
  normalizeContentType
} = require('./shared/posterTemplateSchema')
const {
  getAllRecords,
  isCollectionNotExistError
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

  if (Number.isNaN(date.getTime())) {
    return 0
  }

  return date.getTime()
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

function buildPermissionInfo(userRecord) {
  return {
    dataPermission: typeof (userRecord && userRecord.dataPermission) === 'boolean'
      ? userRecord.dataPermission
      : false
  }
}

function getDefaultTemplateName(contentType) {
  if (contentType === 'blindPoemA') {
    return '系统默认创作互动模式A海报'
  }

  if (contentType === 'blindPoemC') {
    return '系统默认创作互动模式C海报'
  }

  if (contentType === 'activity') {
    return '系统默认活动海报'
  }

  return contentType === 'reading'
    ? '系统默认阅读打卡海报'
    : '系统默认分享海报'
}

function buildTemplateCard(item) {
  const contentType = normalizeContentType(item && item.contentType) || 'reading'

  return {
    templateKey: normalizeText(item && item._id),
    templateId: normalizeText(item && item._id),
    templateName: normalizeText(item && item.templateName) || getDefaultTemplateName(contentType),
    contentType,
    contentTypeText: CONTENT_TYPE_TEXT_MAP[contentType] || CONTENT_TYPE_TEXT_MAP.reading,
    enabled: item && item.enabled === true,
    source: 'configured',
    previewImageUrl: normalizeText(item && (item.backgroundImageFileId || item.backgroundImageUrl)),
    updatedAt: toTimestamp(item && (item.updatedAt || item.createdAt)),
    updatedAtText: formatDateTime(item && (item.updatedAt || item.createdAt)),
    usageCount: 0,
    uniqueUserCount: 0,
    lastUsedAt: 0,
    lastUsedAtText: ''
  }
}

function buildEventOnlyCard(templateKey, sampleEvent) {
  const contentType = normalizeContentType(sampleEvent && sampleEvent.contentType) || 'reading'
  const source = normalizeText(sampleEvent && sampleEvent.source) || 'builtin'
  const lastUsedAt = toTimestamp(sampleEvent && sampleEvent.createdAt)

  return {
    templateKey,
    templateId: normalizeText(sampleEvent && sampleEvent.templateId),
    templateName: normalizeText(sampleEvent && sampleEvent.templateName) || getDefaultTemplateName(contentType),
    contentType,
    contentTypeText: CONTENT_TYPE_TEXT_MAP[contentType] || CONTENT_TYPE_TEXT_MAP.reading,
    enabled: false,
    source,
    previewImageUrl: normalizeText(sampleEvent && sampleEvent.previewImageUrl),
    updatedAt: 0,
    updatedAtText: '',
    usageCount: 0,
    uniqueUserCount: 0,
    lastUsedAt,
    lastUsedAtText: formatDateTime(sampleEvent && sampleEvent.createdAt)
  }
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = normalizeText(wxContext.OPENID)

  try {
    const [userList, templateList, eventList] = await Promise.all([
      getAllRecords(db, 'users', { openid }),
      getAllRecords(db, 'share_poster_templates'),
      getAllRecords(db, 'poster_template_events')
    ])

    const userRecord = (userList || [])[0] || null
    const permissionInfo = buildPermissionInfo(userRecord)

    if (!permissionInfo.dataPermission) {
      return {
        success: false,
        message: '当前账号无权限查看海报数据'
      }
    }

    const cardMap = {}

    ;(templateList || []).forEach((item) => {
      const card = buildTemplateCard(item)

      if (card.templateKey) {
        cardMap[card.templateKey] = card
      }
    })

    const usageMap = {}
    const globalUserMap = {}

    ;(eventList || []).forEach((item) => {
      if (normalizeText(item && item.eventType) !== 'generate') {
        return
      }

      const templateKey = normalizeText(item && (item.templateKey || item.templateId))

      if (!templateKey) {
        return
      }

      if (!usageMap[templateKey]) {
        usageMap[templateKey] = {
          usageCount: 0,
          userMap: {},
          lastUsedAt: 0,
          sampleEvent: item
        }
      }

      usageMap[templateKey].usageCount += 1

      const eventOpenid = normalizeText(item && item.openid)

      if (eventOpenid) {
        usageMap[templateKey].userMap[eventOpenid] = true
        globalUserMap[eventOpenid] = true
      }

      const eventTimestamp = toTimestamp(item && item.createdAt)

      if (eventTimestamp > usageMap[templateKey].lastUsedAt) {
        usageMap[templateKey].lastUsedAt = eventTimestamp
        usageMap[templateKey].sampleEvent = item
      }
    })

    Object.keys(usageMap).forEach((templateKey) => {
      if (!cardMap[templateKey]) {
        cardMap[templateKey] = buildEventOnlyCard(templateKey, usageMap[templateKey].sampleEvent)
      }

      const usageInfo = usageMap[templateKey]
      const currentCard = cardMap[templateKey]

      currentCard.usageCount = usageInfo.usageCount
      currentCard.uniqueUserCount = Object.keys(usageInfo.userMap).length
      currentCard.lastUsedAt = usageInfo.lastUsedAt
      currentCard.lastUsedAtText = usageInfo.lastUsedAt ? formatDateTime(usageInfo.lastUsedAt) : ''
    })

    const posterCards = Object.values(cardMap).sort((prev, next) => {
      if (next.usageCount !== prev.usageCount) {
        return next.usageCount - prev.usageCount
      }

      if (next.uniqueUserCount !== prev.uniqueUserCount) {
        return next.uniqueUserCount - prev.uniqueUserCount
      }

      if (prev.enabled !== next.enabled) {
        return prev.enabled ? -1 : 1
      }

      const nextTimestamp = next.lastUsedAt || next.updatedAt || 0
      const prevTimestamp = prev.lastUsedAt || prev.updatedAt || 0

      if (nextTimestamp !== prevTimestamp) {
        return nextTimestamp - prevTimestamp
      }

      return normalizeText(prev.templateName).localeCompare(normalizeText(next.templateName), 'zh-CN')
    })

    return {
      success: true,
      summary: {
        templateCount: posterCards.length,
        usedTemplateCount: posterCards.filter((item) => item.usageCount > 0).length,
        usageCount: posterCards.reduce((sum, item) => sum + (Number(item.usageCount) || 0), 0),
        usageUserCount: Object.keys(globalUserMap).length
      },
      posterCards
    }
  } catch (error) {
    return {
      success: false,
      message: '获取海报数据失败',
      error: error.message || error
    }
  }
}
