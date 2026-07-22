---
name: loop-2-trigger
description: Use when Codex automation needs to lock one approved Loop 2 ticket and generate the worker-thread payload for mortgage work.
user_invocable: false
---

# Loop 2 Trigger

This is the repo backup of the Codex Loop 2 trigger skill.

## Precondition

- Use this only for `/Users/bhuang/workspace/mortgage`.
- The worker thread created from this payload should start in the mortgage project and then create its own real mortgage worktree with `mortgage-new-worktree`.

## What `loop-2-trigger.sh` does

1. Acquires a lockfile (`ready/<ticket>.lock`, 2-hour stale threshold)
2. Returns a JSON dispatch payload for one worker thread
3. Includes the fixed worker prompt that tells the new thread to create a real mortgage worktree with `mortgage-new-worktree`
4. Requires each execution unit to use its own `ticketslug-4hex` mortgage worktree label
5. If the plan later needs parallel subtasks, those subtasks should each create their own worktree instead of sharing one checkout
6. Leaves actual implementation, verification, and result writing to that worker thread

## Codex prompt

```
Read /Users/bhuang/workspace/dev-loop/ready/<ticket>/plan.md.

You are working on /Users/bhuang/workspace/mortgage from this thread.

Required execution flow:
- Use superpowers:using-superpowers first.
- Then read the implementation plan.
- For each execution unit, use mortgage-new-worktree to create a fresh mortgage worktree from origin/master with the fixed label format `ticketslug-4hex`, for example `fpp2253-a1b2`.
- Do all implementation, verification, and branch work in that worktree, not in /Users/bhuang/workspace/mortgage.
- If the plan needs parallel subtasks, each subtask must create and use its own separate `ticketslug-4hex` mortgage worktree.
- Use superpowers:subagent-driven-development to execute the plan task by task.
- Before any completion claim, use superpowers:verification-before-completion.
- Then use superpowers:finishing-a-development-branch.

When finished, write this file:
- /Users/bhuang/workspace/dev-loop/ready/<ticket>/result.json

Write exactly one of:
- {"status":"success","pr_url":"<url>"}
- {"status":"failed","reason":"<reason>"}

Do not update any other ticket state files directly unless required by the plan.
```
