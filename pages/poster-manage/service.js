function unwrapCloudResult(res, fallbackMessage) {
  const result = res && res.result ? res.result : {}

  if (!result.success) {
    throw new Error(result.message || fallbackMessage)
  }

  return result
}

function getPosterManageData() {
  return wx.cloud.callFunction({
    name: 'getPosterManageData'
  }).then((res) => unwrapCloudResult(res, '分享海报管理数据加载失败'))
}

function savePosterTemplate(data, fallbackMessage = '模板保存失败') {
  return wx.cloud.callFunction({
    name: 'savePosterTemplate',
    data
  }).then((res) => unwrapCloudResult(res, fallbackMessage))
}

function getFileExtension(filePath) {
  const safePath = String(filePath || '')
  const extensionMatch = safePath.match(/\.[^.]+$/)

  return extensionMatch ? extensionMatch[0] : '.png'
}

function buildPosterAssetCloudPath(filePath, cloudFolder = 'poster-assets') {
  return `${cloudFolder}/${Date.now()}-${Math.random().toString(36).slice(2)}${getFileExtension(filePath)}`
}

function uploadPosterAsset(filePath, cloudFolder) {
  return wx.cloud.uploadFile({
    cloudPath: buildPosterAssetCloudPath(filePath, cloudFolder),
    filePath
  }).then((res) => res.fileID || '')
}

module.exports = {
  getPosterManageData,
  savePosterTemplate,
  uploadPosterAsset
}
