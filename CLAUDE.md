# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm start            # start loop1 poller (scheduled, weekdays 9-17 PST)
npm run once         # run loop1 poll once and exit
npm run dry-run      # dry-run loop1 poll (logs but writes nothing)
node loop2-server.js # start loop2 poller (scheduled, weekdays 9-17 PST)
npm test             # run all tests (node --test, no framework)
node --test test/server.test.js  # run a single test file
```

## Architecture

Two independent polling loops run on the same cron schedule (`0 9-17 * * 1-5` PST):

**Loop 1 — Jira → clarified/**
- `server.js` polls Jira for tickets matching `assignee = currentUser() AND status = "Doing" AND labels = "claude-ready"`
- Each ticket is written to `clarified/<TICKET>.md` (Atlassian document format → markdown)
- Dedup key: `<ticket>-<issue.fields.updated>` stored in `processed.json`
- The `loop-1-triage` skill (`.claude/skills/loop-1-triage/SKILL.md`) runs on a CronCreate schedule, picks the next unplanned ticket, acquires a lockfile at `clarified/<TICKET>.lock`, runs brainstorming + writing-plans, and saves `clarified/<TICKET>/plan.md` + `plan.zh.md`

**Loop 2 — ready/ → worker threads**
- `skills/loop-2-scan/loop-2-scan.sh` scans `ready/` for subdirectories with `plan.md` (human-approved, moved from `clarified/`)
- It returns up to 3 dispatchable tickets as JSON, skipping active `ready/<ticket>.lock`
- `skills/loop-2-trigger/loop-2-trigger.sh <ticket>` acquires `ready/<ticket>.lock` and returns a JSON payload for one worker thread
- A Codex automation thread reads those JSON payloads, calls `create_thread` in the mortgage project with `worktree` environment, and the worker thread writes `ready/<ticket>/result.json`

**Human gate:** After Loop 1, a human reviews `clarified/<TICKET>/plan.md` and moves the folder to `ready/<TICKET>/` to trigger Loop 2.

## Key conventions

- ES modules throughout (`"type": "module"` in package.json)
- All exported functions accept injectable dependencies for testability: `fetchTicketsImpl`, `processedFile`, `clarifiedDir`, `logger`, `spawnImpl` etc.
- Lockfile format: `{"session":"<8-char hex>","acquired":"<ISO>"}` — stale after 2 hours
- Tests use Node's built-in `node:test` + `node:assert/strict` — no test framework
- `processed.json`, `clarified/`, `ready/`, `done/`, `failed/` are gitignored runtime state

## Environment

`.env` requires: `JIRA_BASE`, `JIRA_EMAIL`, `JIRA_TOKEN`. See `.env.example`.
