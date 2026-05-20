function callCloudFunction(name, data = {}) {
  return wx.cloud.callFunction({
    name,
    data
  }).then((res) => res.result || {})
}

function getMonthlyGiftProgress() {
  return callCloudFunction('getMonthlyGiftProgress')
}

function getActivityList(data) {
  return callCloudFunction('getActivityList', data)
}

function uploadQuickAddFile(cloudPath, filePath) {
  return wx.cloud.uploadFile({
    cloudPath,
    filePath
  }).then((res) => res.fileID)
}

function submitReadingLog(data) {
  return callCloudFunction('submitReadingLog', data)
}

function submitLifeShare(data) {
  return callCloudFunction('submitLifeShare', data)
}

function submitRewardShare(data) {
  return callCloudFunction('submitRewardShare', data)
}

module.exports = {
  getMonthlyGiftProgress,
  getActivityList,
  uploadQuickAddFile,
  submitReadingLog,
  submitLifeShare,
  submitRewardShare
}
