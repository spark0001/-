const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeDayKey(value) {
  const safeValue = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(safeValue) ? safeValue : ''
}

function toTimestamp(value) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.getTime()
}

async function getAllRecords(collectionName, whereData) {
  const pageSize = 100
  let skip = 0
  let records = []

  while (true) {
    const res = await db.collection(collectionName)
      .where(whereData)
      .skip(skip)
      .limit(pageSize)
      .get()

    const currentBatch = res.data || []

    records = records.concat(currentBatch)

    if (currentBatch.length < pageSize) {
      break
    }

    skip += currentBatch.length
  }

  return records
}

function getImageList(item) {
  return Array.isArray(item && item.images)
    ? item.images.map((image) => normalizeText(image)).filter(Boolean)
    : []
}

function resolveReadingContentTitle(item) {
  const explicitTitle = normalizeText(item && (item.contentTitle || item.title))
  const insight = normalizeText(item && item.insight)
  const excerpt = normalizeText(item && item.excerpt)

  if (explicitTitle) {
    return explicitTitle
  }

  if (insight) {
    return '感悟'
  }

  if (excerpt) {
    return '摘抄'
  }

  return ''
}

function buildRecordList(readingLogList, lifeShareList) {
  const mixedList = []

  ;(readingLogList || []).forEach((item) => {
    const images = getImageList(item)
    const insight = normalizeText(item && item.insight)
    const excerpt = normalizeText(item && item.excerpt)
    const contentTitle = resolveReadingContentTitle(item)

    mixedList.push({
      _id: item && item._id ? item._id : '',
      type: 'reading',
      typeText: '阅读打卡',
      title: contentTitle || normalizeText(item && item.bookTitle) || '未填写书名',
      summary: insight || excerpt,
      createdAt: toTimestamp(item && item.createdAt),
      dayKey: normalizeDayKey(item && item.dayKey),
      imageUrl: normalizeText(images[0]),
      images,
      bookTitle: normalizeText(item && item.bookTitle),
      contentTitle,
      author: normalizeText(item && item.author),
      duration: Number(item && item.duration) || 0,
      pagesOrChapter: normalizeText(item && item.pagesOrChapter),
      insight,
      excerpt,
      activityId: normalizeText(item && item.activityId),
      activityTitle: normalizeText(item && item.activityTitle),
      content: ''
    })
  })

  ;(lifeShareList || []).forEach((item) => {
    const images = getImageList(item)
    const title = normalizeText(item && item.title)

    mixedList.push({
      _id: item && item._id ? item._id : '',
      type: 'life',
      typeText: '生活分享',
      title: title || '生活分享',
      summary: normalizeText(item && item.content),
      createdAt: toTimestamp(item && item.createdAt),
      dayKey: '',
      imageUrl: normalizeText(images[0]),
      images,
      bookTitle: '',
      author: '',
      duration: 0,
      pagesOrChapter: '',
      insight: '',
      excerpt: '',
      activityId: normalizeText(item && item.activityId),
      activityTitle: normalizeText(item && item.activityTitle),
      titleText: title,
      content: normalizeText(item && item.content)
    })
  })

  return mixedList.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const [readingLogList, lifeShareList] = await Promise.all([
      getAllRecords('reading_logs', { openid }),
      getAllRecords('life_shares', { openid }).catch(() => [])
    ])

    return {
      success: true,
      records: buildRecordList(readingLogList, lifeShareList)
    }
  } catch (error) {
    return {
      success: false,
      message: '获取我的打卡记录失败',
      error: error.message || error
    }
  }
}
