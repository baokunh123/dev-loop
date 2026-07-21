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

**Loop 2 — ready/ → PR**
- `loop2-server.js` scans `ready/` for subdirectories with `plan.md` (human-approved, moved from `clarified/`)
- For each ticket, it spawns `~/.claude/skills/loop-2-trigger/loop-2-trigger.sh <ticket>` (detached, parallel)
- The shell script acquires `ready/<ticket>.lock`, runs Codex to implement the plan, reads `ready/<ticket>/result.json`, then moves the ticket to `done/` (success) or `failed/` (two attempts exhausted with `failed/<ticket>/error.md`)

**Human gate:** After Loop 1, a human reviews `clarified/<TICKET>/plan.md` and moves the folder to `ready/<TICKET>/` to trigger Loop 2.

## Key conventions

- ES modules throughout (`"type": "module"` in package.json)
- All exported functions accept injectable dependencies for testability: `fetchTicketsImpl`, `processedFile`, `clarifiedDir`, `logger`, `spawnImpl` etc.
- Lockfile format: `{"session":"<8-char hex>","acquired":"<ISO>"}` — stale after 2 hours
- Tests use Node's built-in `node:test` + `node:assert/strict` — no test framework
- `processed.json`, `clarified/`, `ready/`, `done/`, `failed/` are gitignored runtime state

## Environment

`.env` requires: `JIRA_BASE`, `JIRA_EMAIL`, `JIRA_TOKEN`. See `.env.example`.
