import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import process from 'node:process'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultReadyDir = path.join(__dirname, 'ready')
const defaultDoneDir = path.join(__dirname, 'done')
const defaultFailedDir = path.join(__dirname, 'failed')
const defaultLogsDir = path.join(__dirname, 'logs')
const defaultTriggerPath = path.join(process.env.HOME, '.codex/skills/loop-2-trigger/loop-2-trigger.sh')
const staleThresholdMs = 2 * 60 * 60 * 1000

function log(message) {
  console.log(`[${new Date().toISOString()}] [loop2] ${message}`)
}

function ensureRuntimeDirs({ doneDir = defaultDoneDir, failedDir = defaultFailedDir, logsDir = defaultLogsDir } = {}) {
  fs.mkdirSync(doneDir, { recursive: true })
  fs.mkdirSync(failedDir, { recursive: true })
  fs.mkdirSync(logsDir, { recursive: true })
}

function triggerLogFile(logsDir = defaultLogsDir) {
  const date = new Date().toISOString().slice(0, 10)
  return path.join(logsDir, `${date}-loop2.log`)
}

export function isLockActive({ readyDir = defaultReadyDir, ticket, now = Date.now() }) {
  const lockfile = path.join(readyDir, `${ticket}.lock`)
  if (!fs.existsSync(lockfile)) return false

  try {
    const { acquired } = JSON.parse(fs.readFileSync(lockfile, 'utf8'))
    const acquiredAt = new Date(acquired).getTime()
    if (!Number.isFinite(acquiredAt)) return false
    return now - acquiredAt < staleThresholdMs
  } catch {
    return false
  }
}

export function findPendingTickets({ readyDir = defaultReadyDir } = {}) {
  if (!fs.existsSync(readyDir)) return []

  return fs.readdirSync(readyDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(readyDir, entry.name, 'plan.md')))
    .map((entry) => entry.name)
    .sort()
}

export function spawnTrigger({
  ticket,
  triggerPath = defaultTriggerPath,
  logsDir = defaultLogsDir,
  spawnImpl = spawn,
  logger = log
}) {
  logger(`Spawning trigger for ${ticket}`)
  const logFile = triggerLogFile(logsDir)
  const logFd = fs.openSync(logFile, 'a')
  const child = spawnImpl('bash', [triggerPath, ticket], {
    detached: true,
    stdio: ['ignore', logFd, logFd]
  })

  if (typeof child.on === 'function') {
    child.on('error', (error) => logger(`Spawn error for ${ticket}: ${error.message}`))
  }

  if (typeof child.unref === 'function') {
    child.unref()
  }

  fs.closeSync(logFd)
}

export function poll({
  readyDir = defaultReadyDir,
  triggerPath = defaultTriggerPath,
  spawnImpl = spawn,
  logger = log
} = {}) {
  logger('Poll start')

  let tickets
  try {
    tickets = findPendingTickets({ readyDir })
  } catch (error) {
    logger(`Poll error: ${error.message}`)
    logger('Poll end (error)')
    return
  }

  logger(`Tickets found: ${tickets.length}`)

  for (const ticket of tickets) {
    try {
      if (isLockActive({ readyDir, ticket })) {
        logger(`Skipped (lockfile active): ${ticket}`)
        continue
      }

      spawnTrigger({ ticket, triggerPath, spawnImpl, logger })
    } catch (error) {
      logger(`Trigger error for ${ticket}: ${error.message}`)
    }
  }

  logger('Poll end')
}

function startScheduler() {
  ensureRuntimeDirs()
  cron.schedule('0 9-17 * * 1-5', poll, { timezone: 'America/Los_Angeles' })
  log('loop2-server.js started - polling weekdays 9-17 PST')
  poll()
}

export async function main() {
  startScheduler()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
