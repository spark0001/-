// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数，获取用户openid
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID,
  }
}