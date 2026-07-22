#!/bin/bash
set -euo pipefail

TICKET="${1:?Usage: loop-2-trigger.sh <ticket>}"
BASE="$HOME/workspace/dev-loop"
READY="$BASE/ready/$TICKET"
PLAN="$READY/plan.md"
LOCKFILE="$BASE/ready/$TICKET.lock"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SESSION="${NOW//[^0-9]/}"
SESSION="${SESSION: -8}"
NODE_BIN="${NODE_BIN:-/Users/bhuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [loop2] [$TICKET] $*" >&2; }

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
    printf '{"status":"skipped","ticket":"%s","reason":"lock_active"}\n' "$TICKET"
    exit 0
  fi
  log "Stale lockfile detected (age: ${AGE_H}h), overwriting"
fi

printf '{"session":"%s","acquired":"%s"}\n' "$SESSION" "$NOW" > "$LOCKFILE"
log "Lockfile acquired"
"$NODE_BIN" --input-type=module -e "
import { writeAuditEvent } from 'file://$BASE/lib/audit.js'
writeAuditEvent({ event: 'dispatch_sent', ticket: '$TICKET', sessionType: 'codex', sessionId: '$SESSION' })
" || true
"$NODE_BIN" --input-type=module -e "import { buildDispatchPayload } from 'file://$SCRIPT_DIR/dispatch.js'; console.log(JSON.stringify({ status: 'dispatch_ready', ...buildDispatchPayload({ ticket: process.argv[1], baseDir: process.argv[2] }) }))" "$TICKET" "$BASE"
