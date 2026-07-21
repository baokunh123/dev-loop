# Loop 2 Design - Plan -> Codex Automation -> PR

## Overview

Loop 2 picks up approved plans from `ready/` and runs Codex in full-auto mode to implement them, verify them, and open PRs. The cron entry point lives in Codex automation, not in a long-running Node server. No human involvement is needed until a PR is created on success or the ticket is escalated to `failed/` after two attempts.

## Architecture

```
ready/<ticket>/plan.md
    ↓  Codex automation, weekdays 9-17 PST
    ↓  invoke loop-2-scan skill
    ↓  loop-2-scan.sh scans ready/ and skips active ready/<ticket>.lock
    ↓  loop-2-scan.sh starts up to 3 loop-2-trigger.sh workers in parallel
ready/<ticket>.lock
    ↓  loop-2-trigger.sh <ticket>
    ↓  find or create a dedicated mortgage worktree for that ticket
    ↓  codex exec --approval-mode full-auto "..."
    ↓  superpowers:subagent-driven-development
    ↓  superpowers:verification-before-completion
    ↓  superpowers:finishing-a-development-branch -> PR opened
    ↓  writes result.json: {status, pr_url} or {status, reason}
    ↓  success -> mv ready/<ticket>/ done/<ticket>/
    ↓  failure -> retry once
    ↓  retry failure -> write failed/<ticket>/error.md, mv ready/<ticket>/ failed/<ticket>/
```

## Components

### 1. Codex automation

**Responsibilities:** Schedule Loop 2 on weekdays during business hours and invoke the scan skill. It does not embed the scan logic inline.

**Schedule:** Weekdays `9-17` PST, same as the current Loop 2 schedule.

**Prompt shape:** Minimal. It should only tell Codex to run the Loop 2 scan skill for `~/workspace/dev-loop`.

Exact prompt text:
`Run the loop-2-scan skill for /Users/bhuang/workspace/dev-loop.`

**Why:** The automation stays small and stable while the actual behavior lives in a versioned skill.

### 2. `loop-2-scan` skill

**Location:**
- Repo backup: `~/workspace/dev-loop/skills/loop-2-scan/`
- Codex runtime copy: `~/.codex/skills/loop-2-scan/`

**Files:**
- `SKILL.md`
- `loop-2-scan.sh`

**Responsibilities:** One-shot scan and dispatch. This replaces the polling behavior from `loop2-server.js`.

**Behavior:**
- Scan `~/workspace/dev-loop/ready/` for subdirectories containing `plan.md`
- Ignore tickets with an active `ready/<ticket>.lock`
- Start up to `3` workers in parallel
- Each worker calls `~/.codex/skills/loop-2-trigger/loop-2-trigger.sh <ticket>`
- Exit after this scan pass finishes dispatching

**Non-responsibilities:**
- No retry logic
- No success/failure moves
- No PR handling
- No extra state tracking beyond existing filesystem state

### 3. `loop-2-trigger.sh <ticket>`

**Location:** `~/.codex/skills/loop-2-trigger/loop-2-trigger.sh`

**Responsibilities:** Acquire the ticket lock, create a fresh dedicated mortgage worktree for this ticket run, run Codex, read the result, move the ticket to `done/` or `failed/`, and release the lock.

**Lockfile:** `ready/<ticket>.lock`, same format and 2-hour stale threshold as Loop 1.

**Worktree rule:** Every ticket run creates its own fresh mortgage worktree. Parallel workers must never share one writable worktree, and the trigger must not reuse an older ticket worktree.

**Worktree behavior:**
- Always create a new mortgage worktree for the current ticket run
- Name the worktree with the ticket key plus a run-specific suffix so repeated runs do not collide
- Base the worktree on `origin/master`
- Pass the new worktree path into the Codex run
- Leave the worktree in place after the run so the ticket run can be inspected later and so Codex can create additional subtask worktrees beneath that ticket run when needed

**Why the worktree rule is mandatory:** Without per-ticket worktree isolation, parallel Codex runs can overwrite each other's file changes, branch state, test artifacts, and git metadata. Reusing an older ticket worktree also risks carrying forward stale or dirty state from a previous attempt.

**Codex prompt:**
```
Read ~/workspace/dev-loop/ready/<ticket>/plan.md.
Use superpowers:subagent-driven-development to implement all tasks.
When complete, run superpowers:verification-before-completion.
Then run superpowers:finishing-a-development-branch.
Work in <resolved mortgage worktree path>.
When done, write ~/workspace/dev-loop/ready/<ticket>/result.json:
- On success: {"status": "success", "pr_url": "<url>"}
- On failure: {"status": "failed", "reason": "<reason>"}
```

**Result handling:**
- Read `ready/<ticket>/result.json` after Codex exits
- `status: success` -> `mv ready/<ticket>/ done/<ticket>/`, delete lockfile
- `status: failed` or file missing -> retry once
- Retry `status: success` -> `mv ready/<ticket>/ done/<ticket>/`, delete lockfile
- Retry `status: failed` or file missing -> write `failed/<ticket>/error.md`, `mv ready/<ticket>/ failed/<ticket>/`, delete lockfile

### 4. State model

Loop 2 does not introduce a database or additional job-state file.

Filesystem state is the source of truth:
- `ready/<ticket>/` = approved and waiting or currently running
- `ready/<ticket>.lock` = active ticket processing
- `ready/<ticket>/result.json` = per-attempt result written by Codex
- `done/<ticket>/` = completed successfully
- `failed/<ticket>/` = failed after two attempts

### 5. Concurrency model

**Dispatch concurrency:** Up to `3` tickets at a time from one scan pass.

**Isolation model:** One ticket run = one lockfile + one fresh dedicated mortgage worktree + one Codex run. If the implementation later needs subtask worktrees, those branch from this ticket run's isolated workspace rather than from a shared root.

**Deduplication model:**
- Repeated automation runs dedupe by active lockfile
- Parallel tickets do not block each other unless the concurrency cap of `3` has been reached

## Human gate

- **Success:** PR opened on GitHub; review and merge normally.
- **Failure:** Ticket appears in `failed/`; inspect `error.md`, fix the plan or ticket, then move it back to `ready/` to retry later.

## Out of scope

- Jira status updates
- Slack or email notifications
- CI monitoring after PR creation
- Loop 1 design changes
- New persistent state beyond the existing directory model
