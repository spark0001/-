function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeArticleUrl(url) {
  const safeUrl = normalizeText(url)

  if (!/^https?:\/\//i.test(safeUrl)) {
    return ''
  }

  if (safeUrl.indexOf('mp.weixin.qq.com/') === -1) {
    return safeUrl
  }

  if (safeUrl.indexOf('#wechat_redirect') !== -1) {
    return safeUrl
  }

  return `${safeUrl}#wechat_redirect`
}

function isMpArticleUrl(url) {
  return /^https?:\/\/mp\.weixin\.qq\.com\//i.test(normalizeText(url))
}

Page({
  data: {
    title: '图书推荐',
    url: '',
    errorMessage: '',
    fallbackUrl: ''
  },

  onLoad(options = {}) {
    const title = decodeURIComponent(options.title || '图书推荐')
    const url = decodeURIComponent(options.url || '')
    const safeUrl = normalizeArticleUrl(url)
    const isMpUrl = isMpArticleUrl(safeUrl)

    wx.setNavigationBarTitle({
      title: title || '图书推荐'
    })

    this.setData({
      title: title || '图书推荐',
      url: isMpUrl ? '' : safeUrl,
      fallbackUrl: isMpUrl ? safeUrl : '',
      errorMessage: !safeUrl
        ? '当前推荐链接无效'
        : (isMpUrl ? '当前公众号文章请优先从首页推荐卡片打开；若当前环境不支持直接打开，可先复制链接后在微信中查看。' : '')
    })
  },

  onCopyTap() {
    const safeUrl = normalizeText(this.data.fallbackUrl)

    if (!safeUrl) {
      return
    }

    wx.setClipboardData({
      data: safeUrl,
      success: () => {
        wx.showToast({
          title: '链接已复制',
          icon: 'none'
        })
      }
    })
  }
})
