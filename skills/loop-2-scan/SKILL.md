---
name: loop-2-scan
description: Use when Codex automation needs to scan dev-loop ready/ once and dispatch up to 3 Loop 2 ticket workers in parallel.
user_invocable: false
---

# Loop 2 Scan

Run this only from `/Users/bhuang/workspace/dev-loop`.

## What it does

1. Scans `ready/` for ticket directories containing `plan.md`
2. Skips tickets with active `ready/<ticket>.lock`
3. Starts up to 3 `loop-2-trigger.sh` workers
4. Exits after this scan pass
