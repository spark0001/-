Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/home/home',
        text: '首页',
        icon: '⌂',
        key: 'home'
      },
      {
        pagePath: '/pages/create/create',
        text: '创作互动',
        icon: '✦',
        key: 'create'
      },
      {
        pagePath: '/pages/quick-add/quick-add',
        text: '打卡',
        icon: '✎',
        key: 'quickAdd'
      },
      {
        pagePath: '/pages/mine/mine',
        text: '我的',
        icon: '◉',
        key: 'mine'
      }
    ]
  },

  lifetimes: {
    attached() {
      this.syncSelectedWithPage()
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelectedWithPage()
    }
  },

  methods: {
    setSelected(index) {
      const nextIndex = Number(index)

      if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= this.data.list.length) {
        return
      }

      if (nextIndex !== this.data.selected) {
        this.setData({
          selected: nextIndex
        })
      }
    },

    syncSelectedWithPage() {
      const pageStack = getCurrentPages()
      const currentPage = pageStack[pageStack.length - 1]

      if (!currentPage || !currentPage.route) {
        return
      }

      const currentPath = `/${currentPage.route}`
      const selected = this.data.list.findIndex((item) => item.pagePath === currentPath)

      if (selected >= 0) {
        this.setSelected(selected)
      }
    },

    onSwitchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]

      if (!item) {
        return
      }

      this.setSelected(index)

      wx.switchTab({
        url: item.pagePath
      })
    }
  }
})
