# Loop 2 Codex Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long-running Loop 2 polling server with a Codex-automation-driven scan skill that finds ready plans, dispatches up to 3 ticket workers in parallel, and runs each ticket in its own fresh mortgage worktree.

**Architecture:** Codex automation becomes the cron entry point and invokes a new `loop-2-scan` skill. The scan skill performs one pass over `ready/`, skips active lockfiles, and starts up to 3 `loop-2-trigger.sh` workers. Each trigger run creates a fresh dedicated mortgage worktree before invoking Codex, then keeps the existing retry and `done/failed` state flow.

**Tech Stack:** bash, Codex skills, Node.js test runner, existing `loop-2-trigger.sh`

## Global Constraints

- Do not add new npm dependencies.
- Codex automation is the only scheduler for Loop 2.
- `loop-2-scan` must run as a one-shot scan, not as a daemon or sleep loop.
- Maximum parallel Loop 2 workers per scan pass: `3`.
- Parallel Loop 2 workers must never share one writable mortgage worktree.
- Loop 2 must not reuse an old mortgage worktree for a new ticket run.
- A ticket run's main worktree must be named with the ticket key plus a run-specific suffix so repeated runs do not collide.
- Existing filesystem state remains the source of truth: `ready/`, `done/`, `failed/`, `*.lock`, `result.json`.
- Existing retry semantics stay in `loop-2-trigger.sh`: one retry, then escalate to `failed/`.
- All changes must stay scoped to Loop 2 automation and skill files.

---

### Task 1: Add Loop 2 scan skill

**Files:**
- Create: `~/workspace/dev-loop/skills/loop-2-scan/SKILL.md`
- Create: `~/workspace/dev-loop/skills/loop-2-scan/loop-2-scan.sh`
- Create: `~/workspace/dev-loop/test/loop-2-scan.test.js`

**Interfaces:**
- Consumes: `~/workspace/dev-loop/ready/<ticket>/plan.md`
- Consumes: `~/workspace/dev-loop/ready/<ticket>.lock`
- Consumes: `~/.codex/skills/loop-2-trigger/loop-2-trigger.sh`
- Produces: up to 3 spawned `loop-2-trigger.sh <ticket>` worker processes per scan pass

- [ ] **Step 1: Write the failing scan-skill test**

```js
import fs from 'fs'
import os from 'os'
import path from 'path'
import test from 'node:test'
import assert from 'node:assert/strict'

import { scanReadyTickets } from '../skills/loop-2-scan/loop-2-scan.js'

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dev-loop-scan-'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`)
}

test('scanReadyTickets starts at most 3 unlocked tickets in sorted order', () => {
  const root = makeRoot()
  const readyDir = path.join(root, 'ready')
  const started = []

  for (const ticket of ['FPP-1003', 'FPP-1001', 'FPP-1004', 'FPP-1002']) {
    fs.mkdirSync(path.join(readyDir, ticket), { recursive: true })
    fs.writeFileSync(path.join(readyDir, ticket, 'plan.md'), '# test\n')
  }

  writeJson(path.join(readyDir, 'FPP-1002.lock'), {
    acquired: new Date().toISOString()
  })

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/loop-2-scan.test.js`
Expected: FAIL with `Cannot find module '../skills/loop-2-scan/loop-2-scan.js'`

- [ ] **Step 3: Write minimal scan implementation**

```js
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

const defaultBaseDir = path.resolve(process.cwd())
const defaultReadyDir = path.join(defaultBaseDir, 'ready')
const defaultTriggerPath = path.join(process.env.HOME, '.codex/skills/loop-2-trigger/loop-2-trigger.sh')

export function findReadyTickets({ readyDir = defaultReadyDir } = {}) {
  if (!fs.existsSync(readyDir)) return []

  return fs.readdirSync(readyDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(readyDir, entry.name, 'plan.md')))
    .map((entry) => entry.name)
    .sort()
}

export function startWorker(ticket, { triggerPath = defaultTriggerPath } = {}) {
  const child = spawn('bash', [triggerPath, ticket], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}

export function scanReadyTickets({
  readyDir = defaultReadyDir,
  maxParallel = 3,
  isLockActiveImpl,
  startWorkerImpl = startWorker,
  logger = console.log
} = {}) {
  const tickets = findReadyTickets({ readyDir })
  let started = 0

  for (const ticket of tickets) {
    if (started >= maxParallel) break
    if (isLockActiveImpl({ readyDir, ticket })) {
      logger(`Skipped (lockfile active): ${ticket}`)
      continue
    }
    startWorkerImpl(ticket)
    started += 1
  }

  return started
}
```

- [ ] **Step 4: Add the shell wrapper and skill doc**

```bash
#!/bin/bash
set -euo pipefail

cd "$HOME/workspace/dev-loop"
node skills/loop-2-scan/loop-2-scan.js
```

```markdown
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/loop-2-scan.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add skills/loop-2-scan/SKILL.md skills/loop-2-scan/loop-2-scan.sh skills/loop-2-scan/loop-2-scan.js test/loop-2-scan.test.js
git commit -m "feat: add loop2 scan skill"
```

### Task 2: Add fresh-worktree isolation to Loop 2 trigger

**Files:**
- Modify: `~/workspace/dev-loop/skills/loop-2-trigger/loop-2-trigger.sh`
- Modify: `~/workspace/dev-loop/skills/loop-2-trigger/SKILL.md`
- Test: `~/workspace/dev-loop/test/loop-2-trigger-worktree.test.js`

**Interfaces:**
- Consumes: ticket key argument `<ticket>`
- Produces: fresh mortgage worktree path for the current ticket run
- Produces: Codex prompt that targets the resolved mortgage worktree path

- [ ] **Step 1: Write the failing worktree-path test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/loop-2-trigger-worktree.test.js`
Expected: FAIL with `Cannot find module '../skills/loop-2-trigger/worktree.js'`

- [ ] **Step 3: Write minimal worktree helper**

```js
export function buildWorktreePath({ ticket, runId }) {
  return `/Users/bhuang/workspace/mortgage-wt-${ticket.toLowerCase()}-${runId}`
}
```

- [ ] **Step 4: Update the trigger shell script to use the helper**

```bash
RUN_ID=$(date -u +%Y%m%dt%H%M%S)
WORKTREE=$(node -e "import('./skills/loop-2-trigger/worktree.js').then(({ buildWorktreePath }) => {
  console.log(buildWorktreePath({ ticket: process.argv[1], runId: process.argv[2] }))
})" "$TICKET" "$RUN_ID")

git -C "$HOME/workspace/mortgage" fetch origin master
git -C "$HOME/workspace/mortgage" worktree add -b "${TICKET,,}-${RUN_ID}" "$WORKTREE" origin/master
```

Replace the hard-coded prompt line:

```bash
Work in $WORKTREE.
```

Update `SKILL.md` to say the trigger resolves a dedicated mortgage worktree per ticket before running Codex.
Update `SKILL.md` to say the trigger always creates a fresh main worktree per ticket run and that any later subtask worktrees should branch from that isolated ticket-run workspace, not from a shared root.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/loop-2-trigger-worktree.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add skills/loop-2-trigger/SKILL.md skills/loop-2-trigger/loop-2-trigger.sh skills/loop-2-trigger/worktree.js test/loop-2-trigger-worktree.test.js
git commit -m "feat: isolate loop2 runs with fresh mortgage worktrees"
```

### Task 3: Remove Node Loop 2 scheduler and keep scan logic only in the skill path

**Files:**
- Delete: `~/workspace/dev-loop/loop2-server.js`
- Delete: `~/workspace/dev-loop/test/loop2-server.test.js`
- Modify: `~/workspace/dev-loop/docs/superpowers/specs/2026-07-20-loop2-design.md`

**Interfaces:**
- Consumes: existing approved spec
- Produces: one Loop 2 entry point: Codex automation -> `loop-2-scan` skill

- [ ] **Step 1: Verify replacement path already exists**

Run: `node --test test/loop-2-scan.test.js test/loop-2-trigger-worktree.test.js`
Expected: PASS

- [ ] **Step 2: Delete the obsolete server files**

```bash
rm loop2-server.js
rm test/loop2-server.test.js
```

- [ ] **Step 3: Re-run the full test suite**

Run: `node --test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: replace loop2 server with codex automation skills"
```

### Task 4: Sync Codex runtime copies and document the automation handoff

**Files:**
- Modify: `~/.codex/skills/loop-2-trigger/SKILL.md`
- Modify: `~/.codex/skills/loop-2-trigger/loop-2-trigger.sh`
- Create: `~/.codex/skills/loop-2-scan/SKILL.md`
- Create: `~/.codex/skills/loop-2-scan/loop-2-scan.sh`

**Interfaces:**
- Consumes: repo backup skill files from Tasks 1 and 2
- Produces: Codex runtime skill copies used by automation

- [ ] **Step 1: Sync the repo backup files into `~/.codex/skills/`**

```bash
mkdir -p ~/.codex/skills/loop-2-scan ~/.codex/skills/loop-2-trigger
cp ~/workspace/dev-loop/skills/loop-2-scan/SKILL.md ~/.codex/skills/loop-2-scan/SKILL.md
cp ~/workspace/dev-loop/skills/loop-2-scan/loop-2-scan.sh ~/.codex/skills/loop-2-scan/loop-2-scan.sh
cp ~/workspace/dev-loop/skills/loop-2-trigger/SKILL.md ~/.codex/skills/loop-2-trigger/SKILL.md
cp ~/workspace/dev-loop/skills/loop-2-trigger/loop-2-trigger.sh ~/.codex/skills/loop-2-trigger/loop-2-trigger.sh
chmod +x ~/.codex/skills/loop-2-scan/loop-2-scan.sh ~/.codex/skills/loop-2-trigger/loop-2-trigger.sh
```

- [ ] **Step 2: Smoke-test the runtime scan skill**

Run: `~/.codex/skills/loop-2-scan/loop-2-scan.sh`
Expected: exits cleanly after one scan pass

- [ ] **Step 3: Smoke-test the runtime trigger usage contract**

Run: `~/.codex/skills/loop-2-trigger/loop-2-trigger.sh 2>&1 || true`
Expected: `Usage: loop-2-trigger.sh <ticket>`

- [ ] **Step 4: Record the Codex automation prompt in the spec**

Add this exact guidance to the spec:

```text
Run the loop-2-scan skill for /Users/bhuang/workspace/dev-loop.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-20-loop2-design.md
git commit -m "docs: document codex automation handoff for loop2"
```
