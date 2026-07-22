#!/bin/bash
# Approve a Loop 1 ticket: write audit events then move to ready/
set -euo pipefail

TICKET="${1:?Usage: approve.sh <ticket>}"
DEV_LOOP="$HOME/workspace/dev-loop"
CLARIFIED="$DEV_LOOP/clarified"
READY="$DEV_LOOP/ready"
LOCKFILE="$CLARIFIED/$TICKET.lock"
PLAN_FILE="$CLARIFIED/$TICKET/plan.md"
NODE_BIN="${NODE_BIN:-node}"

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "ERROR: $PLAN_FILE not found" >&2
  exit 1
fi

SESSION_ID=""
TRIAGE_TS=""
if [[ -f "$LOCKFILE" ]]; then
  SESSION_ID=$(python3 -c "import json; d=json.load(open('$LOCKFILE')); print(d.get('session',''))")
  TRIAGE_TS=$(python3 -c "import json; d=json.load(open('$LOCKFILE')); print(d.get('acquired',''))")
fi

# macOS stat for mtime
PLAN_TS=$(stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%SZ" "$PLAN_FILE" 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)
APPROVE_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

"$NODE_BIN" --input-type=module <<EOF
import { writeAuditEvent } from 'file://$DEV_LOOP/lib/audit.js'
const ticket = '$TICKET'
const sessionType = 'claude'
const sessionId = '$SESSION_ID'
if ('$TRIAGE_TS') {
  writeAuditEvent({ event: 'triage_started', ticket, sessionType, sessionId, ts: '$TRIAGE_TS' })
}
writeAuditEvent({ event: 'plan_written',  ticket, sessionType, sessionId, ts: '$PLAN_TS' })
writeAuditEvent({ event: 'plan_approved', ticket, sessionType, sessionId, ts: '$APPROVE_TS' })
EOF

mkdir -p "$READY"
cp -r "$CLARIFIED/$TICKET" "$READY/$TICKET"
echo "[$APPROVE_TS] Approved $TICKET → ready/"
