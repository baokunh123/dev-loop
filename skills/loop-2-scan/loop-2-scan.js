import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import process from 'node:process'

const defaultBaseDir = path.resolve(process.cwd())
const defaultReadyDir = path.join(defaultBaseDir, 'ready')
const defaultTriggerPath = path.join(process.env.HOME, '.codex/skills/loop-2-trigger/loop-2-trigger.sh')

function log(message) {
  console.log(`[${new Date().toISOString()}] [loop2-scan] ${message}`)
}

export function isLockActive({ readyDir = defaultReadyDir, ticket, now = Date.now() }) {
  const lockfile = path.join(readyDir, `${ticket}.lock`)
  if (!fs.existsSync(lockfile)) return false

  try {
    const { acquired } = JSON.parse(fs.readFileSync(lockfile, 'utf8'))
    const acquiredAt = new Date(acquired).getTime()
    return Number.isFinite(acquiredAt) && now - acquiredAt < 2 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export function findReadyTickets({ readyDir = defaultReadyDir } = {}) {
  if (!fs.existsSync(readyDir)) return []

  return fs.readdirSync(readyDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(readyDir, entry.name, 'plan.md')))
    .map((entry) => entry.name)
    .sort()
}

export function startWorker(ticket, { triggerPath = defaultTriggerPath } = {}) {
  const child = spawn('bash', [triggerPath, ticket], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}

export function scanReadyTickets({
  readyDir = defaultReadyDir,
  maxParallel = 3,
  isLockActiveImpl = isLockActive,
  startWorkerImpl = startWorker,
  logger = log
} = {}) {
  const tickets = findReadyTickets({ readyDir })
  let started = 0

  logger(`Tickets found: ${tickets.length}`)

  for (const ticket of tickets) {
    if (started >= maxParallel) break
    if (isLockActiveImpl({ readyDir, ticket })) {
      logger(`Skipped (lockfile active): ${ticket}`)
      continue
    }
    logger(`Starting worker: ${ticket}`)
    startWorkerImpl(ticket)
    started += 1
  }

  return started
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  scanReadyTickets()
}
