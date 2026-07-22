import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const defaultLogsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'logs')

export function writeAuditEvent(
  { event, ticket, sessionType, sessionId, ts = new Date().toISOString(), ...rest },
  logsDir = defaultLogsDir
) {
  const entry = JSON.stringify({ ts, event, ticket, session_type: sessionType, session_id: sessionId, ...rest })
  const file = path.join(logsDir, `audit-${ts.slice(0, 10)}.jsonl`)
  fs.mkdirSync(logsDir, { recursive: true })
  fs.appendFileSync(file, entry + '\n')
}
