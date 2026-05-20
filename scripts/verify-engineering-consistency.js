const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')

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

const sharedPosterSchemaPath = 'shared/posterTemplateSchema.js'
const sharedPoemTimePath = 'shared/poemPancakeTime.js'
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

const failed = checks.filter((item) => !item.ok)

checks.forEach((item) => {
  console.log(`${item.ok ? 'OK ' : 'ERR'} ${item.message}`)
})

if (failed.length) {
  console.error(`\nengineering verification failed: ${failed.length} check(s) did not pass`)
  process.exit(1)
}

console.log(`\nengineering verification passed: ${checks.length} checks`)
