---
name: loop-1-triage
description: Scan clarified/ for unprocessed Jira tickets and run brainstorming to produce plans
user_invocable: false
---

# Loop 1 Triage Skill

You are the Loop 1 triage agent. Run this skill on a CronCreate schedule (`0 9-17 * * 1-5` PST).

## Step 1: Scan for pending tickets

Look in `~/workspace/dev-loop/clarified/` for files matching `*.md` at the top level that do not have a corresponding `~/workspace/dev-loop/clarified/<ticket>/plan.md`.

Example: `FPP-1234.md` exists but `clarified/FPP-1234/plan.md` does not, so it is pending.

If no pending tickets are found, exit silently. Do not log anything.

## Step 2: Pick one ticket

Select the ticket with the lowest number, for example `FPP-1234` before `FPP-1235`.

## Step 3: Acquire lockfile

Check for `~/workspace/dev-loop/clarified/<ticket>.lock`.

- If it is not present, write:
  `{"session":"<random 8-char hex>","acquired":"<ISO timestamp>"}`
- If it is present and newer than 2 hours, another session owns it. Exit silently.
- If it is present and 2 hours old or older, treat it as stale, overwrite it, and continue.

## Step 4: Read ticket content

Read `~/workspace/dev-loop/clarified/<ticket>.md` in full.

## Step 5: Run brainstorming

Invoke `superpowers:brainstorming` with the ticket content as context.

Pass this context:

> This is a Jira ticket for the dev-loop repo. Please run brainstorming to clarify requirements and produce an implementation plan. Ticket content: [paste full ticket content]

## Step 6: Run writing-plans

After brainstorming completes, invoke `superpowers:writing-plans` to write the plan.

Save output to:

- `~/workspace/dev-loop/clarified/<ticket>/plan.md`
- `~/workspace/dev-loop/clarified/<ticket>/plan.zh.md`

## Step 7: Release lockfile

Delete `~/workspace/dev-loop/clarified/<ticket>.lock`.

## Step 8: Present plan and wait for approval

Show the contents of `clarified/<ticket>/plan.zh.md` to the user and ask:

> "以上是 <ticket> 的实施计划。是否批准？(yes/no)"

- User answers **no** → tell the user they can edit `clarified/<ticket>/plan.md` manually and re-trigger. Stop here.
- User answers **yes** → run Step 9.

## Step 9: Approve and move to ready/

Run:

```bash
bash ~/workspace/dev-loop/scripts/approve.sh <ticket>
```

This script writes the audit events (`triage_started`, `plan_written`, `plan_approved`) with correct timestamps and session ID from the lockfile, then copies the folder to `ready/<ticket>/`.
