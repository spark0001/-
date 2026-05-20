function normalizeText(value) {
  return String(value || '').trim()
}

function isCollectionNotExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_NOT_EXIST') !== -1
    || message.indexOf('collection.get:fail -502005') !== -1
}

function isCollectionAlreadyExistError(error) {
  const message = normalizeText(error && (error.errMsg || error.message || error))
  return message.indexOf('DATABASE_COLLECTION_EXIST') !== -1
    || message.indexOf('DATABASE_COLLECTION_ALREADY_EXIST') !== -1
    || message.indexOf('already exists') !== -1
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

async function runTransactionWithRetry(db, executor, maxRetryCount = 3) {
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

async function ensureCollection(db, collectionName) {
  try {
    await db.createCollection(collectionName)
  } catch (error) {
    if (isCollectionAlreadyExistError(error)) {
      return
    }

    throw error
  }
}

async function getAllRecords(db, collectionName, whereData) {
  const list = []
  let skip = 0
  const pageSize = 100

  while (true) {
    try {
      let query = db.collection(collectionName)

      if (whereData && Object.keys(whereData).length) {
        query = query.where(whereData)
      }

      const res = await query.skip(skip).limit(pageSize).get()
      const data = res.data || []

      list.push(...data)

      if (data.length < pageSize) {
        break
      }

      skip += data.length
    } catch (error) {
      if (isCollectionNotExistError(error)) {
        return []
      }

      throw error
    }
  }

  return list
}

async function getFirstRecord(db, collectionName, whereData) {
  const list = await getAllRecords(db, collectionName, whereData)
  return (list || [])[0] || null
}

module.exports = {
  normalizeText,
  isCollectionNotExistError,
  isCollectionAlreadyExistError,
  isTransactionConflictError,
  wait,
  runTransactionWithRetry,
  ensureCollection,
  getAllRecords,
  getFirstRecord
}
