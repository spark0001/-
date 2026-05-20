function callCloudFunction(name, data = {}) {
  return wx.cloud.callFunction({
    name,
    data
  }).then((res) => res.result || {})
}

function getFileExtension(filePath) {
  const safePath = String(filePath || '')
  const dotIndex = safePath.lastIndexOf('.')

  if (dotIndex === -1) {
    return 'png'
  }

  return safePath.slice(dotIndex + 1).toLowerCase()
}

function buildTemplateAssetCloudPath(filePath) {
  const extension = getFileExtension(filePath)
  const randomPart = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  return `activity-template-assets/${randomPart}.${extension}`
}

function uploadTemplateAsset(filePath) {
  return wx.cloud.uploadFile({
    cloudPath: buildTemplateAssetCloudPath(filePath),
    filePath
  }).then((res) => res.fileID || '')
}

function getActivityList(data) {
  return callCloudFunction('getActivityList', data)
}

function createOrUpdateActivity(data) {
  return callCloudFunction('createOrUpdateActivity', data)
}

module.exports = {
  uploadTemplateAsset,
  getActivityList,
  createOrUpdateActivity
}
