const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const NOTICE_META_COLLECTION = 'notice_meta'
const LATEST_NOTICE_STATE_DOC_ID = 'latest_notice_state'

function normalizeText(value) {
  return String(value || '').trim()
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

async function getUserRecord(openid) {
  const res = await db.collection('users')
    .where({
      openid
    })
    .limit(1)
    .get()

  return (res.data || [])[0] || null
}

async function getLatestRemainingNotice(targetRecordId) {
  const res = await db.collection('notices')
    .where({
      _id: db.command.neq(targetRecordId)
    })
    .orderBy('updatedAt', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  return (res.data || [])[0] || null
}

function buildNoticeReconcileToken(targetNoticeDocId) {
  const safeTargetNoticeDocId = normalizeText(targetNoticeDocId) || 'notice'
  return `reconcile-${safeTargetNoticeDocId}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

async function reconcileLatestNoticeState(targetRecordId, reconcileToken, operatorOpenid, maxRetryCount = 5) {
  const safeTargetRecordId = normalizeText(targetRecordId)
  const safeReconcileToken = normalizeText(reconcileToken)
  const safeOperatorOpenid = normalizeText(operatorOpenid)

  if (!safeTargetRecordId || !safeReconcileToken) {
    return false
  }

  for (let attempt = 0; attempt < maxRetryCount; attempt += 1) {
    const candidateNotice = await getLatestRemainingNotice(safeTargetRecordId)
    const candidateNoticeDocId = normalizeText(candidateNotice && candidateNotice._id)
    const reconciliationResult = await runTransactionWithRetry(async (transaction) => {
      const stateRecord = await getDocumentOrNull(transaction, NOTICE_META_COLLECTION, LATEST_NOTICE_STATE_DOC_ID)

      if (normalizeText(stateRecord && stateRecord.reconcileToken) !== safeReconcileToken) {
        return {
          settled: true
        }
      }

      const now = new Date()

      if (!candidateNoticeDocId) {
        await transaction.collection(NOTICE_META_COLLECTION).doc(LATEST_NOTICE_STATE_DOC_ID).set({
          data: {
            latestNoticeId: '',
            latestNoticeDocId: '',
            reconcileToken: '',
            createdAt: stateRecord && stateRecord.createdAt ? stateRecord.createdAt : now,
            updatedAt: now,
            updatedBy: safeOperatorOpenid
          }
        })

        return {
          settled: true
        }
      }

      const candidateNoticeRecord = await getDocumentOrNull(transaction, 'notices', candidateNoticeDocId)

      if (!candidateNoticeRecord) {
        return {
          settled: false
        }
      }

      await transaction.collection('notices').doc(candidateNoticeDocId).update({
        data: {
          isLatest: true
        }
      })

      await transaction.collection(NOTICE_META_COLLECTION).doc(LATEST_NOTICE_STATE_DOC_ID).set({
        data: {
          latestNoticeId: normalizeText(candidateNoticeRecord.noticeId || candidateNoticeRecord._id),
          latestNoticeDocId: candidateNoticeDocId,
          reconcileToken: '',
          createdAt: stateRecord && stateRecord.createdAt ? stateRecord.createdAt : now,
          updatedAt: now,
          updatedBy: safeOperatorOpenid
        }
      })

      return {
        settled: true
      }
    })

    if (reconciliationResult && reconciliationResult.settled === true) {
      return true
    }
  }

  return false
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const userRecord = await getUserRecord(OPENID)

    if (!userRecord || userRecord.superAdmin !== true) {
      return {
        success: false,
        message: '当前账号没有公告管理权限'
      }
    }

    const noticeId = normalizeText(event.noticeId)

    if (!noticeId) {
      return {
        success: false,
        message: '缺少公告ID'
      }
    }

    const targetRes = await db.collection('notices')
      .where({
        noticeId
      })
      .limit(1)
      .get()

    const targetRecord = (targetRes.data || [])[0] || null

    if (!targetRecord) {
      return {
        success: false,
        message: '公告不存在'
      }
    }

    await ensureCollection(NOTICE_META_COLLECTION)

    const targetNoticeDocId = normalizeText(targetRecord._id)
    const reconcileToken = buildNoticeReconcileToken(targetNoticeDocId)

    const transactionResult = await runTransactionWithRetry(async (transaction) => {
      const freshTargetRecord = await getDocumentOrNull(transaction, 'notices', targetNoticeDocId)

      if (!freshTargetRecord) {
        return {
          success: false,
          message: '公告不存在'
        }
      }

      const stateRecord = await getDocumentOrNull(transaction, NOTICE_META_COLLECTION, LATEST_NOTICE_STATE_DOC_ID)
      const currentLatestDocId = normalizeText(stateRecord && stateRecord.latestNoticeDocId)
      const shouldPromoteNext = currentLatestDocId
        ? currentLatestDocId === targetNoticeDocId
        : freshTargetRecord.isLatest !== false
      const now = new Date()

      await transaction.collection('notices').doc(targetNoticeDocId).remove()

      if (!shouldPromoteNext) {
        return {
          success: true,
          shouldReconcile: false
        }
      }

      await transaction.collection(NOTICE_META_COLLECTION).doc(LATEST_NOTICE_STATE_DOC_ID).set({
        data: {
          latestNoticeId: '',
          latestNoticeDocId: '',
          reconcileToken,
          createdAt: stateRecord && stateRecord.createdAt ? stateRecord.createdAt : now,
          updatedAt: now,
          updatedBy: OPENID
        }
      })

      return {
        success: true,
        shouldReconcile: true
      }
    })

    if (!transactionResult.success) {
      return transactionResult
    }

    if (transactionResult.shouldReconcile === true) {
      const reconciled = await reconcileLatestNoticeState(targetNoticeDocId, reconcileToken, OPENID)

      if (!reconciled) {
        console.error('deleteNotice reconcileLatestNoticeState failed:', {
          targetNoticeDocId,
          reconcileToken
        })
      }
    }

    return {
      success: true,
      message: '公告已删除'
    }
  } catch (error) {
    return {
      success: false,
      message: '删除公告失败',
      error: error.message || error
    }
  }
}
