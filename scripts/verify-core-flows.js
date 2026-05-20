const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const checks = []

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath))
}

function addCheck(condition, message) {
  checks.push({
    ok: Boolean(condition),
    message
  })
}

function includes(relativePath, snippet) {
  return fileExists(relativePath) && readFile(relativePath).includes(snippet)
}

function doesNotInclude(relativePath, snippet) {
  return fileExists(relativePath) && !readFile(relativePath).includes(snippet)
}

const serviceBoundaries = [
  {
    page: 'pages/quick-add/quick-add.js',
    service: 'pages/quick-add/service.js',
    methods: [
      'getMonthlyGiftProgress',
      'getActivityList',
      'uploadQuickAddFile',
      'submitReadingLog',
      'submitLifeShare',
      'submitRewardShare'
    ]
  },
  {
    page: 'pages/poster-manage/poster-manage.js',
    service: 'pages/poster-manage/service.js',
    methods: [
      'getPosterManageData',
      'savePosterTemplate',
      'uploadPosterAsset'
    ]
  },
  {
    page: 'pages/admin/admin.js',
    service: 'pages/admin/service.js',
    methods: [
      'uploadTemplateAsset',
      'getActivityList',
      'createOrUpdateActivity'
    ]
  },
  {
    page: 'pages/poem-pancake-detail/poem-pancake-detail.js',
    service: 'pages/poem-pancake-detail/service.js',
    methods: [
      'getPoemPancakeActivityDetail',
      'reservePoemPancakeCell',
      'releasePoemPancakeCellReservation',
      'submitPoemPancakeCell'
    ]
  }
]

serviceBoundaries.forEach((item) => {
  addCheck(fileExists(item.page), `${item.page} exists`)
  addCheck(fileExists(item.service), `${item.service} exists`)

  item.methods.forEach((methodName) => {
    addCheck(includes(item.service, `function ${methodName}`), `${item.service} exposes ${methodName}`)
  })
})

;[
  'pages/quick-add/quick-add.js',
  'pages/poster-manage/poster-manage.js',
  'pages/admin/admin.js'
].forEach((pagePath) => {
  addCheck(doesNotInclude(pagePath, 'wx.cloud.callFunction'), `${pagePath} delegates cloud functions to service`)
  addCheck(doesNotInclude(pagePath, 'wx.cloud.uploadFile'), `${pagePath} delegates uploads to service`)
})

const coreFlows = [
  {
    name: 'activity registration',
    frontend: 'pages/activity-detail/activity-detail.js',
    cloudFunctions: ['registerActivity', 'cancelActivityRegistration'],
    frontendTokens: ['registerActivity', 'cancelActivityRegistration'],
    backendTokens: ['runTransactionWithRetry', 'registrationCount', 'registrations']
  },
  {
    name: 'reading check-in and reward claim',
    frontend: 'pages/quick-add/service.js',
    cloudFunctions: ['submitReadingLog', 'getMonthlyGiftProgress'],
    frontendTokens: ['submitReadingLog', 'getMonthlyGiftProgress'],
    backendTokens: ['runTransactionWithRetry', 'READING_GIFT_CLAIM_COLLECTION', 'buildReadingGiftClaimDocId']
  },
  {
    name: 'application review',
    frontend: 'pages/application-review/application-review.js',
    cloudFunctions: ['reviewApplication'],
    frontendTokens: ['reviewApplication'],
    backendTokens: ['runTransactionWithRetry', 'applications', 'users']
  },
  {
    name: 'poem pancake cell',
    frontend: 'pages/poem-pancake-detail/service.js',
    cloudFunctions: ['reservePoemPancakeCell', 'submitPoemPancakeCell', 'releasePoemPancakeCellReservation'],
    frontendTokens: ['reservePoemPancakeCell', 'submitPoemPancakeCell', 'releasePoemPancakeCellReservation'],
    backendTokens: ['runTransactionWithRetry', 'BOARD_COLLECTION']
  },
  {
    name: 'admin activity management',
    frontend: 'pages/admin/service.js',
    cloudFunctions: ['getActivityList', 'createOrUpdateActivity'],
    frontendTokens: ['getActivityList', 'createOrUpdateActivity'],
    backendTokens: ['success', 'message']
  }
]

coreFlows.forEach((flow) => {
  addCheck(fileExists(flow.frontend), `${flow.name} frontend entry exists`)

  flow.frontendTokens.forEach((token) => {
    addCheck(includes(flow.frontend, token), `${flow.name} frontend references ${token}`)
  })

  flow.cloudFunctions.forEach((functionName) => {
    const indexPath = `cloudfunctions/${functionName}/index.js`
    addCheck(fileExists(indexPath), `${flow.name} cloudfunction ${functionName} exists`)
    addCheck(includes(indexPath, 'success'), `${functionName} returns success`)
    addCheck(includes(indexPath, 'message'), `${functionName} returns message`)
  })

  flow.backendTokens.forEach((token) => {
    const found = flow.cloudFunctions.some((functionName) => {
      return includes(`cloudfunctions/${functionName}/index.js`, token)
    })

    addCheck(found, `${flow.name} backend includes ${token}`)
  })
})

const failed = checks.filter((item) => !item.ok)

checks.forEach((item) => {
  console.log(`${item.ok ? 'OK ' : 'ERR'} ${item.message}`)
})

if (failed.length) {
  console.error(`\ncore flow verification failed: ${failed.length} check(s) did not pass`)
  process.exit(1)
}

console.log(`\ncore flow verification passed: ${checks.length} checks`)
