import fs from 'fs'
import path from 'path'
import process from 'node:process'
import { writeAuditEvent } from '../../lib/audit.js'

const defaultBaseDir = path.resolve(process.cwd())
const defaultReadyDir = path.join(defaultBaseDir, 'ready')
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

export function auditWorkerResults({ readyDir = defaultReadyDir, auditImpl = writeAuditEvent } = {}) {
  const tickets = findReadyTickets({ readyDir })
  for (const ticket of tickets) {
    const resultFile = path.join(readyDir, ticket, 'result.json')
    const auditMarker = path.join(readyDir, ticket, '.result_audited')
    if (!fs.existsSync(resultFile) || fs.existsSync(auditMarker)) continue

    try {
      const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
      const lockFile = path.join(readyDir, `${ticket}.lock`)
      const sessionId = fs.existsSync(lockFile)
        ? JSON.parse(fs.readFileSync(lockFile, 'utf8')).session ?? ''
        : ''
      auditImpl({ event: 'worker_result', ticket, sessionType: 'codex', sessionId, status: result.status, pr_url: result.pr_url ?? null })
      fs.writeFileSync(auditMarker, '')
    } catch {
      // malformed result.json — skip, will retry next scan
    }
  }
}

export function scanReadyTickets({
  readyDir = defaultReadyDir,
  maxParallel = 3,
  isLockActiveImpl = isLockActive,
  auditImpl = writeAuditEvent
} = {}) {
  auditWorkerResults({ readyDir, auditImpl })
  const tickets = findReadyTickets({ readyDir })
  return {
    tickets: tickets
      .filter((ticket) => !isLockActiveImpl({ readyDir, ticket }))
      .slice(0, maxParallel)
      .map((ticket) => ({
        ticket,
        plan_path: path.join(readyDir, ticket, 'plan.md'),
        ready_path: path.join(readyDir, ticket)
      }))
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  console.log(JSON.stringify(scanReadyTickets()))
}
