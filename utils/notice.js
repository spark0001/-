function normalizeText(value) {
  return String(value || '').trim()
}

function markNoticeRead(noticeId) {
  const safeNoticeId = normalizeText(noticeId)

  if (!safeNoticeId) {
    return Promise.resolve()
  }

  return wx.cloud.callFunction({
    name: 'markNoticeRead',
    data: {
      noticeId: safeNoticeId
    }
  }).catch((error) => {
    console.error('markNoticeRead error:', error)
  })
}

function setPageData(page, nextData) {
  if (!page || typeof page.setData !== 'function') {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    page.setData(nextData, resolve)
  })
}

function showNoticePrompt(page, notice) {
  return setPageData(page, {
    noticePromptVisible: true,
    noticePromptTitle: normalizeText(notice && notice.title) || '公告',
    noticePromptContent: normalizeText(notice && notice.content) || '暂无公告内容',
    noticePromptNoticeId: normalizeText(notice && notice.noticeId)
  })
}

function clearNoticePrompt(page) {
  return setPageData(page, {
    noticePromptVisible: false,
    noticePromptTitle: '',
    noticePromptContent: '',
    noticePromptNoticeId: ''
  })
}

function maybeShowLatestNotice(page) {
  if (!page || page.noticePromptShowing || page.noticePromptHandled) {
    return Promise.resolve(false)
  }

  page.noticePromptShowing = true
  page.noticePromptHandled = true

  let modalShown = false

  return wx.cloud.callFunction({
    name: 'getLatestNotice'
  }).then((res) => {
    const result = res.result || {}
    const notice = result.notice || null

    if (!result.success || !notice || result.hasRead) {
      return false
    }

    modalShown = true

    return showNoticePrompt(page, notice).then(() => true)
  }).catch((error) => {
    console.error('getLatestNotice error:', error)
    return false
  }).finally(() => {
    if (!modalShown) {
      page.noticePromptShowing = false
    }
  })
}

function confirmLatestNotice(page) {
  const noticeId = normalizeText(page && page.data && page.data.noticePromptNoticeId)

  return clearNoticePrompt(page).finally(() => {
    if (page) {
      page.noticePromptShowing = false
    }
  }).then(() => {
    if (!noticeId) {
      return false
    }

    return markNoticeRead(noticeId).then(() => true)
  })
}

module.exports = {
  maybeShowLatestNotice,
  confirmLatestNotice
}
