function getFileExtension(filePath) {
  const safePath = String(filePath || '')
  const dotIndex = safePath.lastIndexOf('.')

  if (dotIndex === -1) {
    return 'png'
  }

  return safePath.slice(dotIndex + 1).toLowerCase()
}

function buildAvatarCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `avatars/${randomPart}.${extension}`
}

function buildActivityCoverCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `activity-covers/${randomPart}.${extension}`
}

function getEditorConfig(mode, windowWidth) {
  if (mode === 'activityCover') {
    const cropWidth = Math.min(windowWidth - 48, 336)
    const cropHeight = Math.round(cropWidth * 9 / 16)

    return {
      pageTitleText: '裁剪封面',
      pageDescText: '拖动图片并调整缩放，让封面落在矩形区域中。',
      saveButtonText: '保存封面',
      cropShape: 'rect',
      cropWidth,
      cropHeight,
      outputWidth: 1280,
      outputHeight: 720
    }
  }

  const cropSize = Math.min(windowWidth - 48, 320)

  return {
    pageTitleText: '裁剪头像',
    pageDescText: '拖动图片并调整缩放，让头像落在圆形区域中。',
    saveButtonText: '保存头像',
    cropShape: 'circle',
    cropWidth: cropSize,
    cropHeight: cropSize,
    outputWidth: 400,
    outputHeight: 400
  }
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function buildScaleMeta(baseImageWidth, baseImageHeight, cropWidth, cropHeight) {
  const safeBaseWidth = Number(baseImageWidth) || 1
  const safeBaseHeight = Number(baseImageHeight) || 1
  const safeCropWidth = Number(cropWidth) || 1
  const safeCropHeight = Number(cropHeight) || 1
  const minScale = Math.max(
    safeCropWidth / safeBaseWidth,
    safeCropHeight / safeBaseHeight
  )
  const minScalePercent = Math.ceil(minScale * 100)
  const defaultScalePercent = minScalePercent >= 100
    ? minScalePercent
    : Math.max(minScalePercent, Math.round((minScalePercent + 100) / 2))
  const maxScalePercent = Math.max(300, defaultScalePercent + 200)

  return {
    minScale,
    minScalePercent,
    maxScalePercent,
    defaultScalePercent
  }
}

Page({
  data: {
    mode: 'avatar',
    imagePath: '',
    ready: false,
    saving: false,
    errorMessage: '',
    pageTitleText: '裁剪头像',
    pageDescText: '',
    saveButtonText: '保存头像',
    cropShape: 'circle',
    cropWidth: 0,
    cropHeight: 0,
    outputWidth: 400,
    outputHeight: 400,
    imageWidth: 0,
    imageHeight: 0,
    baseImageWidth: 0,
    baseImageHeight: 0,
    translateX: 0,
    translateY: 0,
    scale: 0,
    scalePercent: 0,
    minScale: 0,
    minScalePercent: 0,
    maxScalePercent: 300,
    imageStyle: ''
  },

  onLoad(options = {}) {
    const mode = options.mode === 'activityCover' ? 'activityCover' : 'avatar'
    const systemInfo = wx.getSystemInfoSync()
    const editorConfig = getEditorConfig(mode, systemInfo.windowWidth)

    this.setData({
      mode,
      ...editorConfig
    })

    wx.setNavigationBarTitle({
      title: editorConfig.pageTitleText
    })

    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()
    const imageEventName = mode === 'activityCover' ? 'acceptActivityCoverImage' : 'acceptAvatarImage'

    if (eventChannel && eventChannel.on) {
      eventChannel.on(imageEventName, ({ tempFilePath }) => {
        this.initializeImage(tempFilePath)
      })
    }

    if (options.imagePath) {
      this.initializeImage(decodeURIComponent(options.imagePath))
    }
  },

  initializeImage(imagePath) {
    if (!imagePath) {
      return
    }

    wx.getImageInfo({
      src: imagePath,
      success: (res) => {
        const imageWidth = Number(res.width) || 0
        const imageHeight = Number(res.height) || 0
        const cropWidth = this.data.cropWidth || 280
        const cropHeight = this.data.cropHeight || 280

        if (!imageWidth || !imageHeight) {
          this.setData({
            errorMessage: '图片读取失败，请重新选择。',
            ready: false
          })
          return
        }

        const baseImageWidth = imageWidth
        const baseImageHeight = imageHeight
        const scaleMeta = buildScaleMeta(imageWidth, imageHeight, cropWidth, cropHeight)

        this.setTransformState({
          imagePath,
          ready: true,
          errorMessage: '',
          imageWidth,
          imageHeight,
          baseImageWidth,
          baseImageHeight,
          translateX: 0,
          translateY: 0,
          scale: scaleMeta.defaultScalePercent / 100,
          scalePercent: scaleMeta.defaultScalePercent,
          minScale: scaleMeta.minScale,
          minScalePercent: scaleMeta.minScalePercent,
          maxScalePercent: scaleMeta.maxScalePercent
        })
      },
      fail: () => {
        this.setData({
          errorMessage: '图片读取失败，请重新选择。',
          ready: false
        })
      }
    })
  },

  clampTranslate(translateX, translateY, scale) {
    const displayWidth = (Number(this.data.baseImageWidth) || 0) * scale
    const displayHeight = (Number(this.data.baseImageHeight) || 0) * scale
    const cropWidth = Number(this.data.cropWidth) || 0
    const cropHeight = Number(this.data.cropHeight) || 0
    const maxX = Math.max(0, (displayWidth - cropWidth) / 2)
    const maxY = Math.max(0, (displayHeight - cropHeight) / 2)

    return {
      translateX: Math.min(maxX, Math.max(-maxX, translateX)),
      translateY: Math.min(maxY, Math.max(-maxY, translateY))
    }
  },

  buildImageStyle(state) {
    return [
      'left: 50%',
      'top: 50%',
      `width: ${state.baseImageWidth}px`,
      `height: ${state.baseImageHeight}px`,
      `margin-left: -${state.baseImageWidth / 2}px`,
      `margin-top: -${state.baseImageHeight / 2}px`,
      `transform: translate3d(${state.translateX}px, ${state.translateY}px, 0) scale(${state.scale})`
    ].join('; ')
  },

  setTransformState(patch) {
    const nextState = {
      imagePath: this.data.imagePath,
      ready: this.data.ready,
      saving: this.data.saving,
      errorMessage: this.data.errorMessage,
      pageTitleText: this.data.pageTitleText,
      pageDescText: this.data.pageDescText,
      saveButtonText: this.data.saveButtonText,
      cropShape: this.data.cropShape,
      cropWidth: this.data.cropWidth,
      cropHeight: this.data.cropHeight,
      outputWidth: this.data.outputWidth,
      outputHeight: this.data.outputHeight,
      imageWidth: this.data.imageWidth,
      imageHeight: this.data.imageHeight,
      baseImageWidth: this.data.baseImageWidth,
      baseImageHeight: this.data.baseImageHeight,
      translateX: this.data.translateX,
      translateY: this.data.translateY,
      scale: this.data.scale,
      scalePercent: this.data.scalePercent,
      minScale: this.data.minScale,
      minScalePercent: this.data.minScalePercent,
      maxScalePercent: this.data.maxScalePercent,
      ...patch
    }

    const minScalePercent = Number.isFinite(Number(nextState.minScalePercent))
      ? Number(nextState.minScalePercent)
      : 0
    const maxScalePercent = Number.isFinite(Number(nextState.maxScalePercent))
      ? Number(nextState.maxScalePercent)
      : Math.max(300, minScalePercent + 200)
    const minScale = Number.isFinite(Number(nextState.minScale))
      ? Number(nextState.minScale)
      : 0
    const maxScale = maxScalePercent / 100
    const nextScalePercent = clampNumber(
      Number(nextState.scalePercent) || Math.round(nextState.scale * 100),
      minScalePercent,
      maxScalePercent
    )
    nextState.scalePercent = nextScalePercent
    nextState.scale = clampNumber(nextScalePercent / 100, minScale, maxScale)

    const clamped = this.clampTranslate(nextState.translateX, nextState.translateY, nextState.scale)
    nextState.translateX = clamped.translateX
    nextState.translateY = clamped.translateY
    nextState.imageStyle = this.buildImageStyle(nextState)

    this.setData(nextState)
  },

  onCropTouchStart(e) {
    if (!this.data.ready || this.data.saving || !(e.touches || []).length) {
      return
    }

    const touch = e.touches[0]

    this.dragState = {
      startX: touch.clientX,
      startY: touch.clientY,
      translateX: this.data.translateX,
      translateY: this.data.translateY
    }
  },

  onCropTouchMove(e) {
    if (!this.dragState || !(e.touches || []).length) {
      return
    }

    const touch = e.touches[0]
    const translateX = this.dragState.translateX + (touch.clientX - this.dragState.startX)
    const translateY = this.dragState.translateY + (touch.clientY - this.dragState.startY)

    this.setTransformState({
      translateX,
      translateY
    })
  },

  onCropTouchEnd() {
    this.dragState = null
  },

  onScaleChange(e) {
    const minScalePercent = Number.isFinite(Number(this.data.minScalePercent))
      ? Number(this.data.minScalePercent)
      : 0
    const maxScalePercent = Number.isFinite(Number(this.data.maxScalePercent))
      ? Number(this.data.maxScalePercent)
      : Math.max(300, minScalePercent + 200)
    const scalePercent = clampNumber(
      Number(e.detail.value) || minScalePercent,
      minScalePercent,
      maxScalePercent
    )

    this.setTransformState({
      scalePercent,
      scale: scalePercent / 100
    })
  },

  buildCropSourceRect() {
    const cropWidth = Number(this.data.cropWidth) || 0
    const cropHeight = Number(this.data.cropHeight) || 0
    const baseImageWidth = Number(this.data.baseImageWidth) || 0
    const baseImageHeight = Number(this.data.baseImageHeight) || 0
    const scale = Number(this.data.scale) || 1
    const imageWidth = Number(this.data.imageWidth) || 0
    const imageHeight = Number(this.data.imageHeight) || 0
    const translateX = Number(this.data.translateX) || 0
    const translateY = Number(this.data.translateY) || 0
    const displayWidth = baseImageWidth * scale
    const displayHeight = baseImageHeight * scale
    const ratioX = imageWidth / displayWidth
    const ratioY = imageHeight / displayHeight
    const sourceWidth = cropWidth * ratioX
    const sourceHeight = cropHeight * ratioY
    const maxSourceX = Math.max(0, imageWidth - sourceWidth)
    const maxSourceY = Math.max(0, imageHeight - sourceHeight)
    const sourceX = Math.min(
      maxSourceX,
      Math.max(0, (((displayWidth - cropWidth) / 2) - translateX) * ratioX)
    )
    const sourceY = Math.min(
      maxSourceY,
      Math.max(0, (((displayHeight - cropHeight) / 2) - translateY) * ratioY)
    )

    return {
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight
    }
  },

  uploadAvatarFile(filePath) {
    return wx.cloud.uploadFile({
      cloudPath: buildAvatarCloudPath(filePath),
      filePath
    }).then((res) => res.fileID)
  },

  uploadActivityCoverFile(filePath) {
    return wx.cloud.uploadFile({
      cloudPath: buildActivityCoverCloudPath(filePath),
      filePath
    }).then((res) => res.fileID)
  },

  syncMinePageAvatar(avatarUrl) {
    const pageStack = getCurrentPages()

    if (!Array.isArray(pageStack) || pageStack.length < 2) {
      return
    }

    const previousPage = pageStack[pageStack.length - 2]

    if (!previousPage || previousPage.route !== 'pages/mine/mine' || typeof previousPage.setData !== 'function') {
      return
    }

    previousPage.setData({
      'profile.avatarUrl': avatarUrl
    })
  },

  backToPreviousPage() {
    const pageStack = getCurrentPages()

    if (Array.isArray(pageStack) && pageStack.length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }

    wx.switchTab({
      url: '/pages/mine/mine'
    })
  },

  onCancel() {
    if (this.data.saving) {
      return
    }

    this.backToPreviousPage()
  },

  emitEditedActivityCover(coverUrl) {
    const eventChannel = this.getOpenerEventChannel && this.getOpenerEventChannel()

    if (eventChannel && eventChannel.emit) {
      eventChannel.emit('acceptEditedActivityCover', {
        coverUrl
      })
    }
  },

  onSaveImage() {
    if (!this.data.ready || this.data.saving || !this.data.imagePath) {
      return
    }

    this.setData({
      saving: true
    })

    wx.showLoading({
      title: '保存中...'
    })

    const cropRect = this.buildCropSourceRect()
    const outputWidth = Number(this.data.outputWidth) || 400
    const outputHeight = Number(this.data.outputHeight) || 400
    const ctx = wx.createCanvasContext('avatarCropCanvas')

    ctx.clearRect(0, 0, outputWidth, outputHeight)

    if (this.data.mode === 'avatar') {
      ctx.save()
      ctx.beginPath()
      ctx.arc(outputWidth / 2, outputHeight / 2, Math.min(outputWidth, outputHeight) / 2, 0, Math.PI * 2)
      ctx.clip()
    }

    ctx.drawImage(
      this.data.imagePath,
      cropRect.sourceX,
      cropRect.sourceY,
      cropRect.sourceWidth,
      cropRect.sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    )

    if (this.data.mode === 'avatar') {
      ctx.restore()
    }

    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'avatarCropCanvas',
        fileType: this.data.mode === 'activityCover' ? 'jpg' : 'png',
        quality: 1,
        width: outputWidth,
        height: outputHeight,
        destWidth: outputWidth,
        destHeight: outputHeight,
        success: (canvasRes) => {
          if (this.data.mode === 'activityCover') {
            this.uploadActivityCoverFile(canvasRes.tempFilePath).then((fileID) => {
              this.emitEditedActivityCover(fileID)
              wx.hideLoading()
              this.backToPreviousPage()
            }).catch((error) => {
              wx.hideLoading()
              console.error('save activity cover error:', error)
              wx.showToast({
                title: error.message || '封面保存失败',
                icon: 'none'
              })
            }).finally(() => {
              this.setData({
                saving: false
              })
            })
            return
          }

          this.uploadAvatarFile(canvasRes.tempFilePath).then((fileID) => {
            return wx.cloud.callFunction({
              name: 'updateMyAvatar',
              data: {
                avatarUrl: fileID
              }
            }).then((res) => {
              const result = res.result || {}

              if (!result.success) {
                throw new Error(result.message || '头像保存失败')
              }

              this.syncMinePageAvatar(fileID)
              wx.hideLoading()
              wx.showToast({
                title: '头像已更新',
                icon: 'success'
              })
              this.backToPreviousPage()
            })
          }).catch((error) => {
            wx.hideLoading()
            console.error('save avatar error:', error)
            wx.showToast({
              title: error.message || '头像保存失败',
              icon: 'none'
            })
          }).finally(() => {
            this.setData({
              saving: false
            })
          })
        },
        fail: (error) => {
          wx.hideLoading()
          console.error('canvasToTempFilePath error:', error)
          this.setData({
            saving: false
          })
          wx.showToast({
            title: this.data.mode === 'activityCover' ? '封面裁剪失败' : '头像裁剪失败',
            icon: 'none'
          })
        }
      })
    })
  }
})
