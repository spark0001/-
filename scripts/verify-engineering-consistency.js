const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const cloudFunctionsRoot = path.join(repoRoot, 'cloudfunctions')
const expectedCloudSdkVersion = '~3.0.4'

const checks = []

function fileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath))
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function addCheck(condition, message) {
  checks.push({
    ok: Boolean(condition),
    message
  })
}

function listDirectories(relativePath) {
  const targetPath = path.join(repoRoot, relativePath)

  if (!fs.existsSync(targetPath)) {
    return []
  }

  return fs.readdirSync(targetPath, {
    withFileTypes: true
  }).filter((item) => item.isDirectory()).map((item) => item.name)
}

function walkFiles(relativePath, predicate) {
  const rootPath = path.join(repoRoot, relativePath)
  const result = []

  if (!fs.existsSync(rootPath)) {
    return result
  }

  function walk(currentPath) {
    fs.readdirSync(currentPath, {
      withFileTypes: true
    }).forEach((item) => {
      const itemPath = path.join(currentPath, item.name)

      if (item.isDirectory()) {
        walk(itemPath)
        return
      }

      if (!predicate || predicate(itemPath)) {
        result.push(path.relative(repoRoot, itemPath).replace(/\\/g, '/'))
      }
    })
  }

  walk(rootPath)
  return result
}

function readJson(relativePath) {
  return JSON.parse(readFile(relativePath))
}

function contentIncludes(relativePath, snippet) {
  return fileExists(relativePath) && readFile(relativePath).includes(snippet)
}

const sharedPosterSchemaPath = 'shared/posterTemplateSchema.js'
const sharedPoemTimePath = 'shared/poemPancakeTime.js'
const cloudFunctionNames = listDirectories('cloudfunctions').filter((name) => name !== '_shared-src')
const targetCloudFunctions = [
  'getActivityPosterTemplate',
  'getPosterAnalytics',
  'getPosterManageData',
  'reportPosterTemplateUsage',
  'savePosterTemplate',
  'getPoemPancakeActivityDetail',
  'getPoemPancakeActivityList',
  'getPoemPancakeManageData',
  'getPoemPancakePosterSource',
  'releasePoemPancakeCellReservation',
  'reservePoemPancakeCell',
  'savePoemPancakeActivity',
  'submitPoemPancakeCell',
  'updatePoemPancakeActivityStatus'
]

const sharedImportExpectations = [
  {
    path: 'cloudfunctions/getActivityPosterTemplate/index.js',
    includes: ["require('./shared/posterTemplateSchema')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/getPosterManageData/index.js',
    includes: ["require('./shared/posterTemplateSchema')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/savePosterTemplate/index.js',
    includes: ["require('./shared/posterTemplateSchema')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/getPoemPancakeActivityDetail/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/getPoemPancakeActivityList/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/getPoemPancakeManageData/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/getPoemPancakePosterSource/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/releasePoemPancakeCellReservation/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/reservePoemPancakeCell/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/savePoemPancakeActivity/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/submitPoemPancakeCell/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/updatePoemPancakeActivityStatus/index.js',
    includes: ["require('./shared/poemPancakeTime')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/getPosterAnalytics/index.js',
    includes: ["require('./shared/posterTemplateSchema')", "require('./shared/db')"]
  },
  {
    path: 'cloudfunctions/reportPosterTemplateUsage/index.js',
    includes: ["require('./shared/posterTemplateSchema')", "require('./shared/db')"]
  }
]

addCheck(fileExists(sharedPosterSchemaPath), 'shared/posterTemplateSchema.js exists')
addCheck(fileExists(sharedPoemTimePath), 'shared/poemPancakeTime.js exists')
addCheck(fileExists('cloudfunctions/_shared-src/db.js'), 'cloudfunctions/_shared-src/db.js exists')
addCheck(fileExists('cloudfunctions/_shared-src/poemPancakeBoard.js'), 'cloudfunctions/_shared-src/poemPancakeBoard.js exists')
addCheck(fileExists('utils/posterTemplateSchema.js'), 'utils/posterTemplateSchema.js exists')
addCheck(fileExists('utils/poemPancakeTime.js'), 'utils/poemPancakeTime.js exists')
addCheck(fileExists('scripts/sync-cloudfunction-shared.js'), 'sync script exists')
addCheck(fileExists('docs/API_CONTRACT.md'), 'docs/API_CONTRACT.md exists')
addCheck(fileExists('docs/QUERY_HOTSPOTS.md'), 'docs/QUERY_HOTSPOTS.md exists')
addCheck(fileExists('docs/SDK_UPGRADE_NOTES.md'), 'docs/SDK_UPGRADE_NOTES.md exists')

if (fileExists('docs/API_CONTRACT.md')) {
  const apiContractContent = readFile('docs/API_CONTRACT.md')
  ;['success', 'code', 'message', 'data'].forEach((fieldName) => {
    addCheck(apiContractContent.includes(fieldName), `API contract documents ${fieldName}`)
  })
}

if (fileExists('docs/QUERY_HOTSPOTS.md')) {
  const queryHotspotContent = readFile('docs/QUERY_HOTSPOTS.md')
  ;[
    'cloudfunctions/getRewardManageData/index.js',
    'cloudfunctions/getMyCenterData/index.js',
    'cloudfunctions/getActivityDetail/index.js',
    'pages/data-center/data-center.js'
  ].forEach((hotspotPath) => {
    addCheck(queryHotspotContent.includes(hotspotPath), `query hotspot documents ${hotspotPath}`)
  })
}

if (fileExists('pages/poster-manage/poster-manage.js')) {
  const posterManageContent = readFile('pages/poster-manage/poster-manage.js')
  addCheck(
    posterManageContent.includes("require('../../utils/posterTemplateSchema')"),
    'poster-manage uses shared poster schema'
  )
}

if (fileExists('utils/poemPancake.js')) {
  const poemPancakeContent = readFile('utils/poemPancake.js')
  addCheck(
    poemPancakeContent.includes("require('./poemPancakeTime')"),
    'poemPancake util uses shared time module'
  )
}

targetCloudFunctions.forEach((functionName) => {
  const sharedDir = path.join('cloudfunctions', functionName, 'shared')
  addCheck(fileExists(path.join(sharedDir, 'db.js')), `${functionName} has synced shared/db.js`)
  addCheck(fileExists(path.join(sharedDir, 'poemPancakeTime.js')), `${functionName} has synced shared/poemPancakeTime.js`)
  addCheck(fileExists(path.join(sharedDir, 'poemPancakeBoard.js')), `${functionName} has synced shared/poemPancakeBoard.js`)
  addCheck(fileExists(path.join(sharedDir, 'posterTemplateSchema.js')), `${functionName} has synced shared/posterTemplateSchema.js`)
})

sharedImportExpectations.forEach((item) => {
  if (!fileExists(item.path)) {
    addCheck(false, `${item.path} exists`)
    return
  }

  const content = readFile(item.path)
  item.includes.forEach((snippet) => {
    addCheck(content.includes(snippet), `${item.path} uses ${snippet}`)
  })
})

cloudFunctionNames.forEach((functionName) => {
  const packagePath = path.join('cloudfunctions', functionName, 'package.json')

  if (!fileExists(packagePath)) {
    addCheck(false, `${functionName} has package.json`)
    return
  }

  const packageJson = readJson(packagePath)
  const actualVersion = packageJson.dependencies && packageJson.dependencies['wx-server-sdk']

  addCheck(packageJson.name === functionName, `${functionName} package name matches folder`)
  addCheck(
    actualVersion === expectedCloudSdkVersion,
    `${functionName} uses wx-server-sdk ${expectedCloudSdkVersion}`
  )
})

const frontendFiles = ['pages', 'components', 'custom-tab-bar', 'utils']
  .flatMap((relativePath) => walkFiles(relativePath, (itemPath) => itemPath.endsWith('.js')))

frontendFiles.forEach((relativePath) => {
  const content = readFile(relativePath)
  addCheck(!content.includes('wx.cloud.database'), `${relativePath} does not call wx.cloud.database`)
  addCheck(!content.includes('cloud.database'), `${relativePath} does not call cloud.database`)
  addCheck(!content.includes('db.collection'), `${relativePath} does not access db.collection`)
})

const coreChains = [
  {
    name: 'activity registration',
    frontendPath: 'pages/activity-detail/activity-detail.js',
    frontendCalls: ['registerActivity', 'cancelActivityRegistration'],
    cloudFunctions: ['registerActivity', 'cancelActivityRegistration'],
    transactionFunctions: ['registerActivity', 'cancelActivityRegistration']
  },
  {
    name: 'reading check-in',
    frontendPath: 'pages/quick-add/quick-add.js',
    frontendCalls: ['submitReadingLog'],
    cloudFunctions: ['submitReadingLog'],
    transactionFunctions: ['submitReadingLog'],
    backendIncludes: ['READING_GIFT_CLAIM_COLLECTION']
  },
  {
    name: 'reward qualification',
    frontendPath: 'pages/quick-add/quick-add.js',
    frontendCalls: ['getMonthlyGiftProgress', 'submitRewardShare'],
    cloudFunctions: ['getMonthlyGiftProgress', 'submitRewardShare', 'updateRewardStatus', 'getRewardManageData'],
    transactionFunctions: ['getMonthlyGiftProgress']
  },
  {
    name: 'application review',
    frontendPath: 'pages/application-review/application-review.js',
    frontendCalls: ['reviewApplication'],
    cloudFunctions: ['reviewApplication'],
    transactionFunctions: ['reviewApplication']
  },
  {
    name: 'poem pancake cell',
    frontendPath: 'pages/poem-pancake-detail/service.js',
    frontendCalls: ['reservePoemPancakeCell', 'submitPoemPancakeCell'],
    cloudFunctions: ['reservePoemPancakeCell', 'submitPoemPancakeCell', 'releasePoemPancakeCellReservation'],
    transactionFunctions: ['reservePoemPancakeCell', 'submitPoemPancakeCell', 'releasePoemPancakeCellReservation']
  }
]

coreChains.forEach((chain) => {
  addCheck(fileExists(chain.frontendPath), `${chain.name} frontend entry exists`)

  chain.frontendCalls.forEach((functionName) => {
    addCheck(
      contentIncludes(chain.frontendPath, functionName),
      `${chain.name} frontend calls ${functionName}`
    )
  })

  chain.cloudFunctions.forEach((functionName) => {
    const indexPath = `cloudfunctions/${functionName}/index.js`
    addCheck(fileExists(indexPath), `${chain.name} cloudfunction ${functionName} exists`)
    addCheck(contentIncludes(indexPath, 'success'), `${functionName} returns success field`)
    addCheck(contentIncludes(indexPath, 'message'), `${functionName} returns message field`)
  })

  ;(chain.transactionFunctions || []).forEach((functionName) => {
    addCheck(
      contentIncludes(`cloudfunctions/${functionName}/index.js`, 'runTransactionWithRetry'),
      `${functionName} uses transaction retry helper`
    )
  })

  ;(chain.backendIncludes || []).forEach((snippet) => {
    const hasSnippet = chain.cloudFunctions.some((functionName) => {
      return contentIncludes(`cloudfunctions/${functionName}/index.js`, snippet)
    })
    addCheck(hasSnippet, `${chain.name} backend includes ${snippet}`)
  })
})

const failed = checks.filter((item) => !item.ok)

checks.forEach((item) => {
  console.log(`${item.ok ? 'OK ' : 'ERR'} ${item.message}`)
})

if (failed.length) {
  console.error(`\nengineering verification failed: ${failed.length} check(s) did not pass`)
  process.exit(1)
}

console.log(`\nengineering verification passed: ${checks.length} checks`)
