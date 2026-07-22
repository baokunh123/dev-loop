import fs from 'fs'
import path from 'path'
import process from 'node:process'

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

export function scanReadyTickets({
  readyDir = defaultReadyDir,
  maxParallel = 3,
  isLockActiveImpl = isLockActive
} = {}) {
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
