const { DEFAULT_AGREE_BUTTON_ID } = require('../../utils/privacy')

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '温馨提示'
    },
    contractName: {
      type: String,
      value: '用户隐私保护指引'
    },
    introText: {
      type: String,
      value: ''
    },
    confirmText: {
      type: String,
      value: '同意并继续'
    },
    cancelText: {
      type: String,
      value: '暂不同意'
    }
  },

  methods: {
    noop() {},

    onViewContractTap() {
      this.triggerEvent('viewcontract')
    },

    onDisagreeTap() {
      this.triggerEvent('disagree')
    },

    onAgreeTap() {
      this.triggerEvent('agree', {
        buttonId: DEFAULT_AGREE_BUTTON_ID
      })
    }
  }
})
