---
name: loop-2-trigger
description: Use when Codex automation needs to lock one approved Loop 2 ticket and generate the worker-thread payload for mortgage work.
user_invocable: false
---

# Loop 2 Trigger

This is the repo backup of the Codex Loop 2 trigger skill.

## Precondition

- Use this only for `/Users/bhuang/workspace/mortgage`.
- The worker thread created from this payload must run in a Codex `worktree` environment.

## What `loop-2-trigger.sh` does

1. Acquires a lockfile (`ready/<ticket>.lock`, 2-hour stale threshold)
2. Returns a JSON dispatch payload for one worker thread
3. Includes the fixed worker prompt that tells the new thread to create a real mortgage worktree with `mortgage-new-worktree`
4. Leaves actual implementation, verification, and result writing to that worker thread

## Codex prompt

```
Read /Users/bhuang/workspace/dev-loop/ready/<ticket>/plan.md.

You are working on /Users/bhuang/workspace/mortgage in this thread's own worktree only.

Required execution flow:
- Use superpowers:using-superpowers first.
- Then read the implementation plan.
- Use superpowers:subagent-driven-development to execute the plan task by task.
- Before any completion claim, use superpowers:verification-before-completion.
- Then use superpowers:finishing-a-development-branch.

When finished, write:
- /Users/bhuang/workspace/dev-loop/ready/<ticket>/result.json

Write exactly one of:
- {"status":"success","pr_url":"<url>"}
- {"status":"failed","reason":"<reason>"}
```
