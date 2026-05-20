const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000

function normalizeText(value) {
  return String(value || '').trim()
}

function buildChinaDate(year, monthIndex, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, second) - CHINA_UTC_OFFSET_MS)
}

function parseDateValue(value) {
  if (!value && value !== 0) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime())
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (value && typeof value === 'object') {
    if (typeof value.getTime === 'function') {
      const timestamp = Number(value.getTime())

      if (Number.isFinite(timestamp)) {
        return new Date(timestamp)
      }
    }

    if (typeof value.toDate === 'function') {
      const date = value.toDate()
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
    }

    if (value.$date) {
      return parseDateValue(value.$date)
    }

    if (Number.isFinite(Number(value.seconds))) {
      const milliseconds = (Number(value.seconds) * 1000) + Math.floor((Number(value.nanoseconds) || 0) / 1000000)
      return new Date(milliseconds)
    }

    if (Number.isFinite(Number(value._seconds))) {
      const milliseconds = (Number(value._seconds) * 1000) + Math.floor((Number(value._nanoseconds) || 0) / 1000000)
      return new Date(milliseconds)
    }
  }

  const safeValue = normalizeText(value).replace(/[/.]/g, '-').replace('T', ' ')

  if (!safeValue) {
    return null
  }

  const exactMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/.exec(safeValue)

  if (exactMatch) {
    const year = Number(exactMatch[1])
    const month = Number(exactMatch[2]) - 1
    const day = Number(exactMatch[3])
    const hour = Number(exactMatch[4] || 0)
    const minute = Number(exactMatch[5] || 0)
    const second = Number(exactMatch[6] || 0)
    const date = buildChinaDate(year, month, day, hour, minute, second)

    return Number.isNaN(date.getTime()) ? null : date
  }

  const timestamp = Date.parse(safeValue.replace(/-/g, '/'))

  if (Number.isNaN(timestamp)) {
    return null
  }

  return new Date(timestamp)
}

function toTimestamp(value) {
  const date = parseDateValue(value)
  return date ? date.getTime() : 0
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function formatDateTime(value) {
  const timestamp = toTimestamp(value)

  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp + CHINA_UTC_OFFSET_MS)

  return `${date.getUTCFullYear()}-${padNumber(date.getUTCMonth() + 1)}-${padNumber(date.getUTCDate())} ${padNumber(date.getUTCHours())}:${padNumber(date.getUTCMinutes())}`
}

function getActivityStartValue(activity = {}) {
  return normalizeText(activity && activity.startAtText) || (activity && activity.startAt) || ''
}

function getActivityDeadlineValue(activity = {}) {
  return normalizeText(activity && activity.deadlineAtText) || (activity && activity.deadlineAt) || ''
}

module.exports = {
  CHINA_UTC_OFFSET_MS,
  normalizeText,
  buildChinaDate,
  parseDateValue,
  toTimestamp,
  formatDateTime,
  getActivityStartValue,
  getActivityDeadlineValue
}
