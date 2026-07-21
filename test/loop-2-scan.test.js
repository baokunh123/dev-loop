import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { scanReadyTickets } from '../skills/loop-2-scan/loop-2-scan.js'

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-scan-'))
}

test('scanReadyTickets starts at most 3 unlocked tickets in sorted order', () => {
  const root = makeRoot()
  const readyDir = path.join(root, 'ready')
  const started = []

  for (const ticket of ['FPP-1003', 'FPP-1001', 'FPP-1004', 'FPP-1002']) {
    fs.mkdirSync(path.join(readyDir, ticket), { recursive: true })
    fs.writeFileSync(path.join(readyDir, ticket, 'plan.md'), '# test\n')
  }

  const count = scanReadyTickets({
    readyDir,
    maxParallel: 3,
    isLockActiveImpl: ({ ticket }) => ticket === 'FPP-1002',
    startWorkerImpl: (ticket) => started.push(ticket),
    logger: () => {}
  })

  assert.equal(count, 3)
  assert.deepEqual(started, ['FPP-1001', 'FPP-1003', 'FPP-1004'])
})
