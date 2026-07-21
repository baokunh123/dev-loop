# Loop 1 Design — Jira → Clarification → Plan

## Overview

Loop 1 automates the path from a Jira ticket to a ready-to-implement plan. It has two components: a polling server (`dev-loop/server.js`) that pulls tickets locally, and a Claude Code skill (`loop-1-triage`) that runs brainstorming and writes the plan.

The human gate is explicit: you move the completed plan from `clarified/` to `ready/` to approve it for Loop 2.

## Architecture

```
Jira (claude-ready label, assignee = me, status = In Progress)
    ↓  poll every 60 min, weekdays 9-5 PST
server.js (~/workspace/dev-loop)
    ↓  writes ticket content
clarified/FPP-1234.md
    ↓  CronCreate every 60 min, weekdays 9-5 PST
loop-1-triage skill
    ↓  triggers superpowers:brainstorming → superpowers:writing-plans
clarified/FPP-1234/plan.md
    ↓  you manually move
ready/FPP-1234/            ← Loop 2 input (out of scope)
```

## Components

### 1. `server.js` (dev-loop repo)

**Responsibilities:** Poll Jira, write ticket content to disk. Nothing else.

**Schedule:** `node-cron` expression `0 9-17 * * 1-5` (local PST timezone), runs every hour on the hour, weekdays only.

**Jira query:**
```
assignee = currentUser() AND status = "In Progress" AND labels = "claude-ready"
```

**Deduplication:** `processed.json` keyed by `${ticket.key}-${ticket.fields.updated}`. Same ticket with same `updated` timestamp → skip. Ticket updated (e.g. new comment, label re-added) → re-process.

**Output:** `clarified/FPP-1234.md` containing:
- Ticket key, title, description
- All comments (chronological)
- Fetched timestamp

**Logging:** Every operation logged to stdout with timestamp:
- Poll start/end
- Tickets found (count)
- Each ticket: written / skipped (dedup)
- Jira API errors (log and continue, don't crash)

### 2. `loop-1-triage` skill (mortgage-graphify/.claude/skills/)

**Trigger:** CronCreate, `0 9-17 * * 1-5` PST, registered manually when Claude Code session starts.

**Responsibilities:**
1. Scan `~/workspace/dev-loop/clarified/` for `.md` files that don't have a corresponding `<ticket>/plan.md`
2. Pick one (lowest ticket number first)
3. Read ticket content
4. Invoke `superpowers:brainstorming` with ticket context
5. On completion, `superpowers:writing-plans` writes plan to `clarified/FPP-1234/plan.md`
6. If no pending tickets → exit silently

**One at a time:** Only processes one ticket per cron fire to avoid flooding the session.

**Cross-session deduplication:** Multiple Claude Code sessions may scan `clarified/` concurrently. A lockfile prevents double-processing:
1. Before picking up a ticket, check for `FPP-1234.lock`
2. If absent, write `FPP-1234.lock` with session ID + timestamp
3. On completion, delete `.lock`
4. If `.lock` exists and timestamp is < 2 hours old → skip
5. If `.lock` exists and timestamp is > 2 hours old → treat as stale, overwrite and proceed

**Interrupted sessions:** If Claude Code is closed mid-brainstorming, the `.lock` file may remain. The 2-hour stale threshold handles this automatically. You register CronCreate manually on session start.

### 3. File structure (dev-loop repo)

```
~/workspace/dev-loop/
├── server.js
├── processed.json        # dedup state
├── .env                  # JIRA_TOKEN, JIRA_EMAIL, JIRA_BASE
├── clarified/
│   ├── FPP-1234.md       # raw ticket, written by server.js
│   ├── FPP-1234/
│   │   └── plan.md       # written by brainstorming
│   ├── FPP-1235.md
│   └── ...
└── ready/                # Loop 2 input — you move files here to approve
```

## Human Gate

Moving `clarified/FPP-1234/` → `ready/FPP-1234/` is the approval action. Loop 2 watches `ready/`. This is intentionally manual and out of scope for Loop 1.

## Language

All specs and plans are written in both English and Chinese. Each document has two versions saved side by side:
- `2026-07-20-loop1-design.md` (English)
- `2026-07-20-loop1-design.zh.md` (Chinese)

This applies to brainstorming output, writing-plans output, and any design docs produced by Loop 1.

## Out of Scope

- Loop 2 (Codex implementation)
- Jira comment writing / status updates
- Auto-approval
- CronCreate auto-registration on session start (manual for now)
