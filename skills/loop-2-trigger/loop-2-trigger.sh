#!/bin/bash
set -euo pipefail

TICKET="${1:?Usage: loop-2-trigger.sh <ticket>}"
BASE="$HOME/workspace/dev-loop"
READY="$BASE/ready/$TICKET"
PLAN="$READY/plan.md"
LOCKFILE="$BASE/ready/$TICKET.lock"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SESSION="${NOW//[^0-9]/}"
SESSION="${SESSION: -8}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop2] [$TICKET] $*"; }

if [[ ! -d "$READY" ]]; then
  log "Missing ready directory: $READY"
  exit 1
fi

if [[ ! -f "$PLAN" ]]; then
  log "Missing plan: $PLAN"
  exit 1
fi

lock_age_hours() {
  python3 - "$LOCKFILE" <<'PY'
import json
import sys
from datetime import datetime, timezone

lockfile = sys.argv[1]
with open(lockfile, "r", encoding="utf-8") as handle:
    acquired = json.load(handle)["acquired"]

acquired_at = datetime.strptime(acquired, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
age_hours = int((datetime.now(timezone.utc) - acquired_at).total_seconds() // 3600)
print(age_hours)
PY
}

if [[ -f "$LOCKFILE" ]]; then
  AGE_H=$(lock_age_hours)
  if [[ $AGE_H -lt 2 ]]; then
    log "Skipped - lockfile active (age: ${AGE_H}h)"
    exit 0
  fi
  log "Stale lockfile detected (age: ${AGE_H}h), overwriting"
fi

printf '{"session":"%s","acquired":"%s"}\n' "$SESSION" "$NOW" > "$LOCKFILE"
log "Lockfile acquired"

CODEX_PROMPT="Read ~/workspace/dev-loop/ready/$TICKET/plan.md.
Use superpowers:subagent-driven-development to implement all tasks.
When complete, run superpowers:verification-before-completion.
Then run superpowers:finishing-a-development-branch.
Work in ~/workspace/mortgage-graphify.
When done, write ~/workspace/dev-loop/ready/$TICKET/result.json:
- On success: {\"status\": \"success\", \"pr_url\": \"<url>\"}
- On failure: {\"status\": \"failed\", \"reason\": \"<reason>\"}"

run_codex() {
  local attempt=$1
  log "Starting Codex attempt $attempt"
  rm -f "$READY/result.json"
  codex exec --approval-mode full-auto "$CODEX_PROMPT" || true
}

read_result() {
  if [[ ! -f "$READY/result.json" ]]; then
    echo "result.json missing"
    return 1
  fi

  python3 - "$READY/result.json" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

sys.exit(0 if payload.get("status") == "success" else 1)
PY
}

read_reason() {
  if [[ ! -f "$READY/result.json" ]]; then
    echo "result.json missing"
    return
  fi

  python3 - "$READY/result.json" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

print(payload.get("reason", payload.get("pr_url", "unknown")))
PY
}

run_codex 1
REASON1=$(read_reason)
if read_result; then
  log "Attempt 1 succeeded - PR: $REASON1"
  mv "$READY" "$BASE/done/$TICKET"
  rm -f "$LOCKFILE"
  log "Moved to done/"
  exit 0
fi
log "Attempt 1 failed: $REASON1"

run_codex 2
REASON2=$(read_reason)
if read_result; then
  log "Attempt 2 succeeded - PR: $REASON2"
  mv "$READY" "$BASE/done/$TICKET"
  rm -f "$LOCKFILE"
  log "Moved to done/"
  exit 0
fi
log "Attempt 2 failed: $REASON2"

mkdir -p "$BASE/failed/$TICKET"
cat > "$BASE/failed/$TICKET/error.md" <<EOF
# $TICKET - Failed after 2 attempts

Attempt 1: $REASON1
Attempt 2: $REASON2
Timestamp: $NOW
EOF
mv "$READY"/* "$BASE/failed/$TICKET/" 2>/dev/null || true
rmdir "$READY" 2>/dev/null || true
rm -f "$LOCKFILE"
log "Escalated to failed/"
exit 1
