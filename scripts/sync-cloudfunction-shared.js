const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')

const sharedSources = [
  {
    source: path.join(repoRoot, 'shared', 'posterTemplateSchema.js'),
    filename: 'posterTemplateSchema.js'
  },
  {
    source: path.join(repoRoot, 'shared', 'poemPancakeTime.js'),
    filename: 'poemPancakeTime.js'
  },
  {
    source: path.join(repoRoot, 'cloudfunctions', '_shared-src', 'db.js'),
    filename: 'db.js'
  },
  {
    source: path.join(repoRoot, 'cloudfunctions', '_shared-src', 'poemPancakeBoard.js'),
    filename: 'poemPancakeBoard.js'
  }
]

const targetFunctions = [
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, {
    recursive: true
  })
}

function syncSharedFiles() {
  targetFunctions.forEach((functionName) => {
    const sharedDir = path.join(repoRoot, 'cloudfunctions', functionName, 'shared')
    ensureDir(sharedDir)

    sharedSources.forEach((item) => {
      const targetFile = path.join(sharedDir, item.filename)
      fs.copyFileSync(item.source, targetFile)
    })
  })
}

syncSharedFiles()
console.log(`synced shared modules to ${targetFunctions.length} cloudfunctions`)
