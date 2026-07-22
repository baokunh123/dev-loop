# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm start            # start loop1 poller (scheduled, weekdays 9-17 PST)
npm run once         # run loop1 poll once and exit
npm run dry-run      # dry-run loop1 poll (logs but writes nothing)
npm test             # run all tests (node --test, no framework)
node --test test/server.test.js  # run a single test file
```

## Architecture

Two independent polling loops run on the same cron schedule (`0 9-17 * * 1-5` PST):

**Loop 1 — Jira → clarified/**
- `server.js` polls Jira for tickets matching `assignee = currentUser() AND status = "Doing" AND labels = "claude-ready"`
- Each ticket is written to `clarified/<TICKET>.md` (Atlassian document format → markdown)
- Dedup key: `<ticket>-<issue.fields.updated>` stored in `processed.json`
- The `loop-1-triage` skill runs via CronCreate schedule in the `~/workspace/mortgage-graphify` session (needs that project's CLAUDE.md context). It: runs `loop-1.sh`, brainstorms with the user, saves `clarified/<TICKET>/spec.md` + `spec.zh.md`, then generates `clarified/<TICKET>/plan.md` + `plan.zh.md` via `superpowers:writing-plans`
- After human approval, the ticket folder is moved to `ready/<TICKET>/`

**Loop 2 — ready/ → worker threads**
- `skills/loop-2-scan/loop-2-scan.js` scans `ready/` for subdirectories with `plan.md`, skipping active locks, returns up to 3 dispatchable tickets as JSON
- `skills/loop-2-trigger/loop-2-trigger.sh <ticket>` acquires `ready/<ticket>.lock` and returns a JSON dispatch payload for one Codex worker thread
- Dispatch payload includes a `worker_prompt` that instructs the worker to call `mortgage-new-worktree`, run the plan via `superpowers:subagent-driven-development`, and write `ready/<ticket>/result.json`
- Each execution unit gets its own mortgage worktree via `mortgage-new-worktree`
- Worktree labels use the fixed `ticketslug-4hex` format, for example `fpp2253-a1b2`, which stays within the first 20 characters
- If a ticket later needs parallel subtasks, each subtask should get its own separate mortgage worktree instead of sharing a checkout
- `result.json` is exactly `{"status":"success","pr_url":"<url>"}` or `{"status":"failed","reason":"<reason>"}`

**Human gate:** After Loop 1, a human reviews `clarified/<TICKET>/plan.md` and moves the folder to `ready/<TICKET>/` to trigger Loop 2.

## Key conventions

- ES modules throughout (`"type": "module"` in package.json)
- All exported functions accept injectable dependencies for testability: `fetchTicketsImpl`, `processedFile`, `clarifiedDir`, `logger`, `spawnImpl` etc.
- Lockfile format: `{"session":"<8-char hex>","acquired":"<ISO>"}` — stale after 2 hours
- Tests use Node's built-in `node:test` + `node:assert/strict` — no test framework
- `processed.json`, `clarified/`, `ready/`, `done/`, `failed/` are gitignored runtime state
- `skills/` is the repo copy of skill files; `.claude/skills/` is where Claude Code actually reads them. Keep both in sync when editing skills.

## Environment

`.env` requires: `JIRA_BASE`, `JIRA_EMAIL`, `JIRA_TOKEN`. See `.env.example`.
