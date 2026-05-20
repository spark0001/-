const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const JOIN_CLUB_PASSPHRASE = '我要加入读书会'
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

function buildApplicationDocId(openid, applicationType) {
  return buildStableDocId(applicationType === 'member' ? 'app' : 'vapp', openid, Date.now(), Math.random())
}

function buildUserDocId(openid) {
  return buildStableDocId('usr', openid)
}

function isCollectionAlreadyExistError(error) {
  const message = String(
    (error && (error.message || error.errMsg || error.error || error.code || error))
    || ''
  )

  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
}

function isCollectionNotExistError(error) {
  const message = String(
    (error && (error.message || error.errMsg || error.error || error.code || error))
    || ''
  )

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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const name = normalizeText(event.name)
  const gradeMajor = normalizeText(event.gradeMajor)
  const reason = normalizeText(event.reason)
  const contact = normalizeText(event.contact)
  const applyPassphrase = normalizeText(event.applyPassphrase)

  if (!name) {
    return {
      success: false,
      message: '姓名不能为空'
    }
  }

  if (!gradeMajor) {
    return {
      success: false,
      message: '年级/专业不能为空'
    }
  }

  if (!reason) {
    return {
      success: false,
      message: '申请理由不能为空'
    }
  }

  const applicationType = applyPassphrase === JOIN_CLUB_PASSPHRASE ? 'member' : 'visitor'
  const targetCollectionName = applicationType === 'member' ? 'applications' : 'visitor_applications'

  try {
    await Promise.all([
      ensureCollection(targetCollectionName),
      ensureCollection(APPLICATION_SUBMISSION_STATE_COLLECTION),
      ensureCollection('users')
    ])

    const applicationRes = await db.collection(targetCollectionName)
      .where({
        openid,
        status: 'pending'
      })
      .get()

    if (applicationRes.data.length > 0) {
      return {
        success: false,
        message: '你已经提交过报名信息，请等待审核'
      }
    }

    const userRes = await db.collection('users')
      .where({
        openid
      })
      .get()

    const existingUserRecord = (userRes.data || [])[0] || null
    const applicationId = buildApplicationDocId(openid, applicationType)
    const applicationStateDocId = buildApplicationStateDocId(openid, applicationType)
    const now = new Date()

    const transactionResult = await runTransactionWithRetry(async (transaction) => {
      const stateRecord = await getDocumentOrNull(transaction, APPLICATION_SUBMISSION_STATE_COLLECTION, applicationStateDocId)

      if (stateRecord && stateRecord.status === 'pending') {
        return {
          success: false,
          message: '你已经提交过报名信息，请等待审核'
        }
      }

      await transaction.collection(targetCollectionName).add({
        data: {
          _id: applicationId,
          openid,
          name,
          gradeMajor,
          reason,
          contact,
          applyPassphrase,
          applicationType,
          canEnterReview: applicationType === 'member',
          status: 'pending',
          reviewedBy: '',
          reviewedAt: null,
          createdAt: now
        }
      })

      if (!existingUserRecord) {
        const userDocId = buildUserDocId(openid)
        const deterministicUserRecord = await getDocumentOrNull(transaction, 'users', userDocId)

        if (!deterministicUserRecord) {
          await transaction.collection('users').doc(userDocId).set({
            data: {
              openid,
              nickName: '',
              avatarUrl: '',
              role: 'guest',
              status: 'pending',
              createdAt: now,
              updatedAt: now
            }
          })
        }
      }

      await transaction.collection(APPLICATION_SUBMISSION_STATE_COLLECTION).doc(applicationStateDocId).set({
        data: {
          openid,
          applicationType,
          targetCollectionName,
          status: 'pending',
          pendingApplicationId: applicationId,
          latestApplicationId: applicationId,
          reviewedBy: '',
          reviewedAt: null,
          createdAt: stateRecord && stateRecord.createdAt ? stateRecord.createdAt : now,
          updatedAt: now
        }
      })

      return {
        success: true,
        applicationId
      }
    })

    if (!transactionResult.success) {
      return transactionResult
    }

    return {
      success: true,
      message: '报名提交成功',
      applicationId: transactionResult.applicationId,
      applicationType
    }
  } catch (error) {
    return {
      success: false,
      message: '报名提交失败',
      error: error.message || error
    }
  }
}
