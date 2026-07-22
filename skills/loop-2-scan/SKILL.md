---
name: loop-2-scan
description: Use when Codex automation needs to scan dev-loop ready/ once and return up to 3 dispatchable Loop 2 tickets.
user_invocable: false
---

# Loop 2 Scan

Run this only from `/Users/bhuang/workspace/dev-loop`.

## What it does

1. Scans `ready/` for ticket directories containing `plan.md`
2. Skips tickets with active `ready/<ticket>.lock`
3. Returns up to 3 dispatchable tickets as JSON
4. Exits after this scan pass

## Automation prompt

Use `automation-prompt.md` in this folder as the fixed heartbeat prompt template. It must create mortgage worker threads in `local` project environment so the worker can run `mortgage-new-worktree` itself.
