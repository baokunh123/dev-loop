# dev-loop

`dev-loop` pulls Jira tickets labeled `claude-ready` into local markdown files, then lets a scheduled Codex skill turn those clarified tickets into implementation plans.

## What It Does

There are two loops in this repo:

- `server.js` polls Jira on weekdays from 9:00 to 17:00 Pacific time.
- Each matching Jira issue is written to `clarified/<TICKET>.md`.
- Deduping is based on `<ticket key>-<issue.fields.updated>` and stored in `processed.json`.
- The `loop-1-triage` skill picks the next pending clarified ticket and produces:
  - `clarified/<TICKET>/plan.md`
  - `clarified/<TICKET>/plan.zh.md`

## Repo Layout

```text
.
├── .claude/skills/loop-1-triage/SKILL.md
├── clarified/
├── docs/superpowers/
├── ready/
├── processed.json
└── server.js
```

- `clarified/`: raw Jira tickets pulled from Jira
- `clarified/<TICKET>/`: generated plans for a ticket
- `ready/`: handoff area after a human approves a generated plan
- `processed.json`: dedup state for the Jira poller

## Environment

Create `/Users/bhuang/workspace/dev-loop/.env` with:

```bash
JIRA_BASE=https://bettermortgage.atlassian.net
JIRA_EMAIL=bhuang@better.com
JIRA_TOKEN=...
```

`server.js` exits the poll cycle cleanly and logs an error if any of the three values is missing.

## Run It

Install dependencies:

```bash
npm install
```

Run the poller once locally:

```bash
node server.js
```

Expected behavior:

- startup log shows the weekday schedule
- one poll runs immediately on process start
- matching issues are written to `clarified/*.md`
- rerunning without a Jira `updated` change logs `Skipped (dedup): <TICKET>`

## Jira Query

The poller currently fetches issues matching:

```text
assignee = currentUser() AND status = "In Progress" AND labels = "claude-ready"
```

It requests:

- `summary`
- `description`
- `comment`
- `updated`

## Triage Skill

The triage skill lives at [/Users/bhuang/workspace/dev-loop/.claude/skills/loop-1-triage/SKILL.md](/Users/bhuang/workspace/dev-loop/.claude/skills/loop-1-triage/SKILL.md).

Its contract is:

- scan top-level `clarified/*.md`
- ignore tickets that already have `clarified/<TICKET>/plan.md`
- lock with `clarified/<TICKET>.lock`
- treat locks older than 2 hours as stale
- run brainstorming, then writing-plans
- write both English and Chinese plans

## Automation

A Codex cron automation named `loop-1-triage` has been created for this repo.

- schedule: weekdays, hourly, 9:00 through 17:00 Pacific
- working directory: `/Users/bhuang/workspace/dev-loop`
- purpose: run the `loop-1-triage` skill when pending clarified tickets exist

## Notes

- `clarified/` and `ready/` are gitignored except for `.gitkeep`.
- `processed.json` is runtime state and is also gitignored.
- Jira API failures are logged and do not crash the server process.
