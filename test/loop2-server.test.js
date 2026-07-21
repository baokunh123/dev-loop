import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { findPendingTickets, isLockActive, poll } from '../loop2-server.js'

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-loop2-'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`)
}

test('findPendingTickets returns only ticket directories with plan.md', () => {
  const root = makeRoot()
  const readyDir = path.join(root, 'ready')

  fs.mkdirSync(path.join(readyDir, 'TEST-001'), { recursive: true })
  fs.mkdirSync(path.join(readyDir, 'TEST-002'), { recursive: true })
  fs.mkdirSync(path.join(readyDir, 'not-a-ticket'), { recursive: true })
  fs.writeFileSync(path.join(readyDir, 'TEST-001', 'plan.md'), '# test\n')
  fs.writeFileSync(path.join(readyDir, 'TEST-002', 'note.txt'), 'ignore\n')

  assert.deepEqual(findPendingTickets({ readyDir }), ['TEST-001'])
})

test('isLockActive returns true only for recent lockfiles', () => {
  const root = makeRoot()
  const readyDir = path.join(root, 'ready')
  const freshTicket = 'TEST-001'
  const staleTicket = 'TEST-002'

  fs.mkdirSync(readyDir, { recursive: true })
  writeJson(path.join(readyDir, `${freshTicket}.lock`), {
    acquired: new Date(Date.now() - 30 * 60 * 1000).toISOString()
  })
  writeJson(path.join(readyDir, `${staleTicket}.lock`), {
    acquired: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  })

  assert.equal(isLockActive({ readyDir, ticket: freshTicket }), true)
  assert.equal(isLockActive({ readyDir, ticket: staleTicket }), false)
  assert.equal(isLockActive({ readyDir, ticket: 'TEST-003' }), false)
})

test('poll spawns triggers only for unlocked tickets', () => {
  const root = makeRoot()
  const readyDir = path.join(root, 'ready')
  const spawned = []
  const logs = []

  fs.mkdirSync(path.join(readyDir, 'TEST-001'), { recursive: true })
  fs.mkdirSync(path.join(readyDir, 'TEST-002'), { recursive: true })
  fs.writeFileSync(path.join(readyDir, 'TEST-001', 'plan.md'), '# test 1\n')
  fs.writeFileSync(path.join(readyDir, 'TEST-002', 'plan.md'), '# test 2\n')
  writeJson(path.join(readyDir, 'TEST-002.lock'), {
    acquired: new Date(Date.now() - 15 * 60 * 1000).toISOString()
  })

  poll({
    readyDir,
    triggerPath: '/tmp/loop-2-trigger.sh',
    spawnImpl: (...args) => {
      spawned.push(args)
      return { on() {}, unref() {} }
    },
    logger: (message) => logs.push(message)
  })

  assert.equal(spawned.length, 1)
  assert.deepEqual(spawned[0], [
    'bash',
    ['/tmp/loop-2-trigger.sh', 'TEST-001'],
    { detached: true, stdio: 'ignore' }
  ])
  assert.ok(logs.some((message) => message.includes('Skipped (lockfile active): TEST-002')))
})
