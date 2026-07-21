---
name: loop-2-trigger
description: Use when Codex needs to process one approved Loop 2 ticket from dev-loop ready/ and run the full implementation flow for mortgage work.
user_invocable: false
---

# Loop 2 Trigger

This is the repo backup of the Codex Loop 2 trigger skill.

## Precondition

- Use this only for mortgage work.
- Run it from a Codex session with access to `~/workspace/mortgage-graphify`.

## What `loop-2-trigger.sh` does

1. Acquires a lockfile (`ready/<ticket>.lock`, 2-hour stale threshold)
2. Runs `codex exec --approval-mode full-auto` with the prompt below
3. Reads `ready/<ticket>/result.json` written by Codex
4. Success -> moves ticket to `done/<ticket>/`
5. Failure -> retries once; second failure -> moves to `failed/<ticket>/` with `error.md`

## Codex prompt

```
Read ~/workspace/dev-loop/ready/<ticket>/plan.md.
Use superpowers:subagent-driven-development to implement all tasks.
When complete, run superpowers:verification-before-completion.
Then run superpowers:finishing-a-development-branch.
Work in ~/workspace/mortgage-graphify.
When done, write ~/workspace/dev-loop/ready/<ticket>/result.json:
- On success: {"status": "success", "pr_url": "<url>"}
- On failure: {"status": "failed", "reason": "<reason>"}
```
