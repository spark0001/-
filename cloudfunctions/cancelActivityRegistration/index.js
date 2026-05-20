const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function isTransactionConflictError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('TransactionConflict') !== -1
    || message.indexOf('DATABASE_TRANSACTION_CONFLICT') !== -1
    || message.indexOf('resource system error') !== -1
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function runTransactionWithRetry(executor, maxRetryCount = 3) {
  let lastError = null

  for (let attempt = 0; attempt < maxRetryCount; attempt += 1) {
    try {
      return await db.runTransaction(executor)
    } catch (error) {
      lastError = error

      if (!isTransactionConflictError(error) || attempt === (maxRetryCount - 1)) {
        throw error
      }

      await wait(80 * (attempt + 1))
    }
  }

  throw lastError || new Error('事务执行失败')
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const activityId = normalizeText(event.activityId || event.id)

  if (!activityId) {
    return {
      success: false,
      message: '缺少活动ID'
    }
  }

  try {
    return await runTransactionWithRetry(async (transaction) => {
      const detailRes = await transaction.collection('activities').doc(activityId).get()
      const activity = detailRes.data || null

      if (!activity) {
        return {
          success: false,
          message: '活动不存在'
        }
      }

      if (activity.status !== 'published') {
        return {
          success: false,
          message: '当前活动暂不可取消报名'
        }
      }

      const registrations = Array.isArray(activity.registrations) ? activity.registrations.slice() : []
      const nextRegistrations = registrations.filter((item) => !(item && item.openid === openid))

      if (nextRegistrations.length === registrations.length) {
        return {
          success: false,
          message: '你还没有报名该活动'
        }
      }

      await transaction.collection('activities').doc(activityId).update({
        data: {
          registrations: nextRegistrations,
          registrationCount: nextRegistrations.length,
          updatedAt: new Date()
        }
      })

      return {
        success: true,
        message: '取消报名成功',
        registrationCount: nextRegistrations.length
      }
    })
  } catch (error) {
    return {
      success: false,
      message: '取消报名失败',
      error: error.message || error
    }
  }
}
