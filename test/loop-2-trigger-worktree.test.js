import test from 'node:test'
import assert from 'node:assert/strict'

import { buildBranchName, buildWorktreePath } from '../skills/loop-2-trigger/worktree.js'
import { buildDispatchPayload } from '../skills/loop-2-trigger/dispatch.js'

test('buildWorktreePath includes ticket key and run suffix', () => {
  const result = buildWorktreePath({
    ticket: 'FPP-1234',
    runId: '20260721t171500'
  })

  assert.equal(result, '/Users/bhuang/workspace/mortgage-wt-fpp-1234-20260721t171500')
})

test('buildBranchName lowercases ticket key and appends run suffix', () => {
  const result = buildBranchName({
    ticket: 'FPP-1234',
    runId: '20260721t171500'
  })

  assert.equal(result, 'fpp-1234-20260721t171500')
})

test('buildDispatchPayload produces the fixed worker prompt and result path', () => {
  const payload = buildDispatchPayload({
    ticket: 'FPP-2245',
    baseDir: '/Users/bhuang/workspace/dev-loop'
  })

  assert.equal(payload.ticket, 'FPP-2245')
  assert.equal(payload.plan_path, '/Users/bhuang/workspace/dev-loop/ready/FPP-2245/plan.md')
  assert.equal(payload.ready_path, '/Users/bhuang/workspace/dev-loop/ready/FPP-2245')
  assert.equal(payload.result_path, '/Users/bhuang/workspace/dev-loop/ready/FPP-2245/result.json')
  assert.match(payload.worker_prompt, /Read \/Users\/bhuang\/workspace\/dev-loop\/ready\/FPP-2245\/plan\.md\./)
  assert.match(payload.worker_prompt, /superpowers:using-superpowers first/)
  assert.match(payload.worker_prompt, /Use mortgage-new-worktree to create a fresh mortgage worktree from origin\/master for this ticket\./)
  assert.match(payload.worker_prompt, /Do all implementation, verification, and branch work in that new mortgage worktree/)
  assert.match(payload.worker_prompt, /superpowers:subagent-driven-development/)
  assert.match(payload.worker_prompt, /superpowers:verification-before-completion/)
  assert.match(payload.worker_prompt, /superpowers:finishing-a-development-branch/)
})
