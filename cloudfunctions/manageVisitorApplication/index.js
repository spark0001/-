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

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
    || message.indexOf('document.get:fail -502005') !== -1
}

function isDocumentNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))

  return message.indexOf('DATABASE_RECORD_NOT_EXIST') !== -1
    || message.indexOf('cannot find document with _id') !== -1
    || message.indexOf('document.get:fail') !== -1
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

function resolveProfileField(userRecord, application, fieldName) {
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

async function getUserRecord(openid) {
  const res = await db.collection('users')
    .where({ openid })
    .limit(1)
    .get()

  return (res.data || [])[0] || null
}

async function assertSuperAdminPermission(openid) {
  const userRecord = await getUserRecord(openid)

  if (!userRecord || userRecord.superAdmin !== true) {
    throw new Error('当前账号没有外来访客管理权限')
  }

  return userRecord
}

function buildApprovedUserData(userRecord, application, now) {
  const currentRole = normalizeText(userRecord && userRecord.role)
  const nextRole = userRecord && userRecord.superAdmin === true
    ? 'admin'
    : (currentRole === 'admin' ? 'admin' : 'member')

  return {
    role: nextRole,
    status: 'approved',
    name: resolveProfileField(userRecord, application, 'name'),
    contact: resolveProfileField(userRecord, application, 'contact'),
    gradeMajor: resolveProfileField(userRecord, application, 'gradeMajor'),
    birthday: normalizeText(userRecord && userRecord.birthday),
    signature: normalizeText(userRecord && userRecord.signature),
    profileSupplementPrompted: getNextProfileSupplementPrompted(userRecord),
    updatedAt: now
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const applicationId = normalizeText(event.applicationId)
  const action = normalizeText(event.action)

  if (!applicationId) {
    return {
      success: false,
      message: '缺少访客记录ID'
    }
  }

  if (action !== 'approve' && action !== 'delete') {
    return {
      success: false,
      message: '不支持的操作'
    }
  }

  try {
    await ensureCollection(APPLICATION_SUBMISSION_STATE_COLLECTION)
    await assertSuperAdminPermission(OPENID)

    const application = await db.collection('visitor_applications').doc(applicationId).get().then((res) => {
      return res.data || null
    }).catch(() => null)

    if (!application) {
      return {
        success: false,
        message: '访客记录不存在'
      }
    }

    const applicationStateDocId = buildApplicationStateDocId(application.openid, 'visitor')
    const userRecord = await getUserRecord(application.openid)
    const preferredUserDocId = normalizeText(userRecord && userRecord._id) || buildUserDocId(application.openid)

    if (action === 'delete') {
      const transactionResult = await runTransactionWithRetry(async (transaction) => {
        const freshApplication = await getDocumentOrNull(transaction, 'visitor_applications', applicationId)

        if (!freshApplication) {
          return {
            success: false,
            message: '访客记录不存在'
          }
        }

        const now = new Date()
        const stateRecord = await getDocumentOrNull(transaction, APPLICATION_SUBMISSION_STATE_COLLECTION, applicationStateDocId)

        await transaction.collection('visitor_applications').doc(applicationId).remove()
        await transaction.collection(APPLICATION_SUBMISSION_STATE_COLLECTION).doc(applicationStateDocId).set({
          data: {
            openid: freshApplication.openid,
            applicationType: 'visitor',
            targetCollectionName: 'visitor_applications',
            status: 'deleted',
            pendingApplicationId: '',
            latestApplicationId: applicationId,
            reviewedBy: OPENID,
            reviewedAt: now,
            createdAt: stateRecord && stateRecord.createdAt ? stateRecord.createdAt : now,
            updatedAt: now
          }
        })

        return {
          success: true,
          message: '访客记录已删除'
        }
      })

      if (!transactionResult.success) {
        return transactionResult
      }

      return transactionResult
    }

    return await runTransactionWithRetry(async (transaction) => {
      const freshApplication = await getDocumentOrNull(transaction, 'visitor_applications', applicationId)
      const freshUserRecord = await getDocumentOrNull(transaction, 'users', preferredUserDocId)

      if (!freshApplication) {
        return {
          success: false,
          message: '访客记录不存在'
        }
      }

      const now = new Date()

      await transaction.collection('visitor_applications').doc(applicationId).update({
        data: {
          status: 'approved',
          reviewedBy: OPENID,
          reviewedAt: now,
          canEnterReview: true
        }
      })

      if (freshUserRecord) {
        await transaction.collection('users').doc(preferredUserDocId).update({
          data: buildApprovedUserData(freshUserRecord, freshApplication, now)
        })
      } else {
        await transaction.collection('users').doc(buildUserDocId(freshApplication.openid)).set({
          data: {
            openid: freshApplication.openid,
            nickName: '',
            avatarUrl: '',
            name: normalizeText(freshApplication.name),
            contact: normalizeText(freshApplication.contact),
            gradeMajor: normalizeText(freshApplication.gradeMajor),
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

      const stateRecord = await getDocumentOrNull(transaction, APPLICATION_SUBMISSION_STATE_COLLECTION, applicationStateDocId)

      await transaction.collection(APPLICATION_SUBMISSION_STATE_COLLECTION).doc(applicationStateDocId).set({
        data: {
          openid: freshApplication.openid,
          applicationType: 'visitor',
          targetCollectionName: 'visitor_applications',
          status: 'approved',
          pendingApplicationId: '',
          latestApplicationId: applicationId,
          reviewedBy: OPENID,
          reviewedAt: now,
          createdAt: stateRecord && stateRecord.createdAt ? stateRecord.createdAt : now,
          updatedAt: now
        }
      })

      return {
        success: true,
        message: '该访客已直接通过审核'
      }
    })
  } catch (error) {
    return {
      success: false,
      message: error.message || '外来访客处理失败',
      error: error.message || error
    }
  }
}
