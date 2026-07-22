import test from 'node:test'
import assert from 'node:assert/strict'

import { buildBranchName, buildWorktreeLabel, buildWorktreePath } from '../skills/loop-2-trigger/worktree.js'
import { buildDispatchPayload } from '../skills/loop-2-trigger/dispatch.js'

test('buildWorktreeLabel uses ticketslug-4hex format', () => {
  const result = buildWorktreeLabel({
    ticket: 'FPP-1234',
    suffix: 'a1b2'
  })

  assert.equal(result, 'fpp1234-a1b2')
  assert.ok(result.length <= 20)
})

test('buildBranchName uses fixed ticketslug-4hex label', () => {
  const result = buildBranchName({
    ticket: 'FPP-1234',
    suffix: 'a1b2'
  })

  assert.equal(result, 'codex/fpp1234-a1b2')
})

test('buildWorktreePath uses fixed ticketslug-4hex label', () => {
  const result = buildWorktreePath({
    ticket: 'FPP-1234',
    suffix: 'a1b2'
  })

  assert.equal(result, '/Users/bhuang/workspace/mortgage-wt-fpp1234-a1b2')
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
  assert.match(payload.worker_prompt, /For each execution unit, use mortgage-new-worktree to create a fresh mortgage worktree from origin\/master with the fixed label format ticketslug-4hex, for example fpp2253-a1b2\./)
  assert.match(payload.worker_prompt, /Do all implementation, verification, and branch work in that worktree/)
  assert.match(payload.worker_prompt, /If the plan needs parallel subtasks, each subtask must create and use its own separate ticketslug-4hex mortgage worktree\./)
  assert.match(payload.worker_prompt, /superpowers:subagent-driven-development/)
  assert.match(payload.worker_prompt, /superpowers:verification-before-completion/)
  assert.match(payload.worker_prompt, /superpowers:finishing-a-development-branch/)
})
