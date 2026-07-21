import test from 'node:test'
import assert from 'node:assert/strict'

import { buildWorktreePath } from '../skills/loop-2-trigger/worktree.js'

test('buildWorktreePath includes ticket key and run suffix', () => {
  const result = buildWorktreePath({
    ticket: 'FPP-1234',
    runId: '20260721t171500'
  })

  assert.equal(result, '/Users/bhuang/workspace/mortgage-wt-fpp-1234-20260721t171500')
})
