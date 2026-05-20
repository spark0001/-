function callCloudFunction(name, data = {}) {
  return wx.cloud.callFunction({
    name,
    data
  }).then((res) => res.result || {})
}

function getPoemPancakeActivityDetail(activityId) {
  return callCloudFunction('getPoemPancakeActivityDetail', { activityId })
}

function reportPoemPancakeDetailClick(activityId) {
  return callCloudFunction('reportPoemPancakeEvent', {
    eventType: 'detail_click',
    activityId
  })
}

function reservePoemPancakeCell(activityId, rowIndex, colIndex) {
  return callCloudFunction('reservePoemPancakeCell', {
    activityId,
    rowIndex,
    colIndex
  })
}

function releasePoemPancakeCellReservation(activityId, cellKey) {
  return callCloudFunction('releasePoemPancakeCellReservation', {
    activityId,
    cellKey
  })
}

function submitPoemPancakeCell(activityId, rowIndex, colIndex, content, actionType = 'upsert') {
  return callCloudFunction('submitPoemPancakeCell', {
    activityId,
    rowIndex,
    colIndex,
    content,
    actionType
  })
}

module.exports = {
  getPoemPancakeActivityDetail,
  reportPoemPancakeDetailClick,
  reservePoemPancakeCell,
  releasePoemPancakeCellReservation,
  submitPoemPancakeCell
}
