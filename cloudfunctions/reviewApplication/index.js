const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const APPLICATION_SUBMISSION_STATE_COLLECTION = 'application_submission_states'

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

function buildStableDocId(prefix, ...parts) {
  const safePrefix = normalizeText(prefix).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'doc'
  const hash = crypto
    .createHash('sha1')
    .update(parts.map((item) => normalizeText(item)).join('|'))
    .digest('hex')
  const hashLength = Math.max(8, 32 - safePrefix.length - 1)

  return `${safePrefix}_${hash.slice(0, hashLength)}`
}

function buildApplicationStateDocId(openid, applicationType) {
  return buildStableDocId('appst', openid, applicationType)
}

function buildUserDocId(openid) {
  return buildStableDocId('usr', openid)
}

function isDocumentNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_RECORD_NOT_EXIST') !== -1
    || message.indexOf('cannot find document with _id') !== -1
    || message.indexOf('document.get:fail') !== -1
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
    || message.indexOf('document.get:fail -502005') !== -1
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
}

async function ensureCollection(collectionName) {
  if (!db || typeof db.createCollection !== 'function') {
    return
  }

  try {
    await db.createCollection(collectionName)
  } catch (error) {
    if (!isCollectionAlreadyExistError(error)) {
      throw error
    }
  }
}

async function getDocumentOrNull(source, collectionName, docId) {
  if (!docId) {
    return null
  }

  try {
    const res = await source.collection(collectionName).doc(docId).get()
    return res.data || null
  } catch (error) {
    if (isDocumentNotExistError(error) || isCollectionNotExistError(error)) {
      return null
    }

    throw error
  }
}

function resolveApplicationProfileField(userRecord, application, fieldName) {
  const applicationValue = normalizeText(application && application[fieldName])
  const userValue = normalizeText(userRecord && userRecord[fieldName])

  return applicationValue || userValue
}

function getNextProfileSupplementPrompted(userRecord) {
  const birthday = normalizeText(userRecord && userRecord.birthday)
  const signature = normalizeText(userRecord && userRecord.signature)

  if (!birthday || !signature) {
    return false
  }

  return !!(userRecord && userRecord.profileSupplementPrompted === true)
}

function hasApplicationReviewPermission(userRecord) {
  if (!userRecord) {
    return false
  }

  if (userRecord.superAdmin === true) {
    return true
  }

  if (userRecord.status !== 'approved') {
    return false
  }

  if (typeof userRecord.applicationReviewPermission === 'boolean') {
    return userRecord.applicationReviewPermission
  }

  return userRecord.role === 'admin'
}

async function assertApplicationReviewPermission(openid) {
  const userRes = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()

  const userRecord = (userRes.data && userRes.data[0]) || null

  if (!hasApplicationReviewPermission(userRecord)) {
    throw new Error('当前账号没有成员申请审核权限')
  }

  return userRecord
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const reviewerOpenid = wxContext.OPENID
  const applicationId = normalizeText(event.applicationId)
  const action = normalizeText(event.action)

  if (!applicationId) {
    return {
      success: false,
      message: '缺少申请ID'
    }
  }

  if (action !== 'approve' && action !== 'reject') {
    return {
      success: false,
      message: '不支持的审核动作'
    }
  }

  try {
    await ensureCollection(APPLICATION_SUBMISSION_STATE_COLLECTION)
    await assertApplicationReviewPermission(reviewerOpenid)

    const applicationRes = await db.collection('applications').doc(applicationId).get()
    const application = applicationRes.data

    if (!application) {
      return {
        success: false,
        message: '申请不存在'
      }
    }

    if (application.status !== 'pending') {
      return {
        success: false,
        message: '该申请已审核'
      }
    }

    const userRes = await db.collection('users')
      .where({
        openid: application.openid
      })
      .limit(1)
      .get()

    const userRecord = (userRes.data && userRes.data[0]) || null
    const preferredUserDocId = normalizeText(userRecord && userRecord._id) || buildUserDocId(application.openid)
    const applicationType = normalizeText(application.applicationType) || 'member'
    const applicationStateDocId = buildApplicationStateDocId(application.openid, applicationType)

    return await runTransactionWithRetry(async (transaction) => {
      const freshApplicationRes = await transaction.collection('applications').doc(applicationId).get()
      const freshApplication = freshApplicationRes.data || null
      const freshUserRecord = await getDocumentOrNull(transaction, 'users', preferredUserDocId)

      if (!freshApplication) {
        return {
          success: false,
          message: '申请不存在'
        }
      }

      if (freshApplication.status !== 'pending') {
        return {
          success: false,
          message: '该申请已审核'
        }
      }

      const now = new Date()
      const nextStatus = action === 'approve' ? 'approved' : 'rejected'

      await transaction.collection('applications').doc(applicationId).update({
        data: {
          status: nextStatus,
          reviewedBy: reviewerOpenid,
          reviewedAt: now
        }
      })

      if (action === 'approve') {
        const nextProfileSupplementPrompted = getNextProfileSupplementPrompted(freshUserRecord)
        const approveData = {
          role: 'member',
          status: 'approved',
          name: resolveApplicationProfileField(freshUserRecord, freshApplication, 'name'),
          contact: resolveApplicationProfileField(freshUserRecord, freshApplication, 'contact'),
          gradeMajor: resolveApplicationProfileField(freshUserRecord, freshApplication, 'gradeMajor'),
          birthday: normalizeText(freshUserRecord && freshUserRecord.birthday),
          signature: normalizeText(freshUserRecord && freshUserRecord.signature),
          profileSupplementPrompted: nextProfileSupplementPrompted,
          updatedAt: now
        }

        if (freshUserRecord) {
          await transaction.collection('users').doc(preferredUserDocId).update({
            data: approveData
          })
        } else {
          await transaction.collection('users').doc(buildUserDocId(freshApplication.openid)).set({
            data: {
              openid: freshApplication.openid,
              nickName: '',
              avatarUrl: '',
              name: normalizeText(freshApplication && freshApplication.name),
              contact: normalizeText(freshApplication && freshApplication.contact),
              gradeMajor: normalizeText(freshApplication && freshApplication.gradeMajor),
              role: 'member',
              status: 'approved',
              birthday: '',
              signature: '',
              profileSupplementPrompted: false,
              createdAt: now,
              updatedAt: now
            }
          })
        }
      } else {
        const rejectData = {
          role: freshUserRecord ? (freshUserRecord.role || 'guest') : 'guest',
          status: 'rejected',
          updatedAt: now
        }

        if (freshUserRecord) {
          await transaction.collection('users').doc(preferredUserDocId).update({
            data: rejectData
          })
        } else {
          await transaction.collection('users').doc(buildUserDocId(freshApplication.openid)).set({
            data: {
              openid: freshApplication.openid,
              nickName: '',
              avatarUrl: '',
              role: 'guest',
              status: 'rejected',
              createdAt: now,
              updatedAt: now
            }
          })
        }
      }

      const stateRecord = await getDocumentOrNull(transaction, APPLICATION_SUBMISSION_STATE_COLLECTION, applicationStateDocId)

      await transaction.collection(APPLICATION_SUBMISSION_STATE_COLLECTION).doc(applicationStateDocId).set({
        data: {
          openid: freshApplication.openid,
          applicationType,
          targetCollectionName: 'applications',
          status: nextStatus,
          pendingApplicationId: '',
          latestApplicationId: applicationId,
          reviewedBy: reviewerOpenid,
          reviewedAt: now,
          createdAt: stateRecord && stateRecord.createdAt ? stateRecord.createdAt : now,
          updatedAt: now
        }
      })

      return {
        success: true,
        message: action === 'approve' ? '申请已通过' : '申请已拒绝'
      }
    })
  } catch (error) {
    return {
      success: false,
      message: error.message || '审核申请失败',
      error: error.message || error
    }
  }
}
