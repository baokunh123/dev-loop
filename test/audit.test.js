import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { writeAuditEvent } from '../lib/audit.js'

function makeLogsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-audit-'))
}

test('writeAuditEvent appends a JSONL line with all fields', () => {
  const logsDir = makeLogsDir()
  writeAuditEvent(
    { event: 'ticket_written', ticket: 'FPP-1', sessionType: 'claude', sessionId: 'aabb1122', ts: '2026-07-21T09:00:00.000Z' },
    logsDir
  )
  const file = path.join(logsDir, 'audit-2026-07-21.jsonl')
  const line = JSON.parse(fs.readFileSync(file, 'utf8').trim())
  assert.equal(line.event, 'ticket_written')
  assert.equal(line.ticket, 'FPP-1')
  assert.equal(line.session_type, 'claude')
  assert.equal(line.session_id, 'aabb1122')
  assert.equal(line.ts, '2026-07-21T09:00:00.000Z')
})

test('writeAuditEvent shards by date in filename', () => {
  const logsDir = makeLogsDir()
  writeAuditEvent({ event: 'e', ticket: 'T-1', sessionType: 'claude', sessionId: 'x', ts: '2026-07-21T00:00:00.000Z' }, logsDir)
  writeAuditEvent({ event: 'e', ticket: 'T-2', sessionType: 'claude', sessionId: 'x', ts: '2026-07-22T00:00:00.000Z' }, logsDir)
  const files = fs.readdirSync(logsDir).sort()
  assert.deepEqual(files, ['audit-2026-07-21.jsonl', 'audit-2026-07-22.jsonl'])
})

test('writeAuditEvent appends multiple lines to same file', () => {
  const logsDir = makeLogsDir()
  const ts = '2026-07-21T10:00:00.000Z'
  writeAuditEvent({ event: 'a', ticket: 'T-1', sessionType: 'claude', sessionId: 'x', ts }, logsDir)
  writeAuditEvent({ event: 'b', ticket: 'T-1', sessionType: 'claude', sessionId: 'x', ts }, logsDir)
  const lines = fs.readFileSync(path.join(logsDir, 'audit-2026-07-21.jsonl'), 'utf8').trim().split('\n')
  assert.equal(lines.length, 2)
  assert.equal(JSON.parse(lines[0]).event, 'a')
  assert.equal(JSON.parse(lines[1]).event, 'b')
})
