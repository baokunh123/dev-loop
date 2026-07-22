#!/bin/bash
# Print a markdown table of every ticket's lifecycle from audit logs
LOGS="$HOME/workspace/dev-loop/logs"

if ! ls "$LOGS"/audit-*.jsonl 1>/dev/null 2>&1; then
  echo "(no audit logs yet)"
  exit 0
fi

echo "| ticket | triage_started | plan_written | plan_approved | dispatch_sent | worker_result | pr_url |"
echo "|---|---|---|---|---|---|---|"

jq -rs '
  group_by(.ticket)[] |
  {
    t:        (.[0].ticket),
    triage:   (map(select(.event=="triage_started"))  | first | "\(.ts) [\(.session_id)]" // "-"),
    plan:     (map(select(.event=="plan_written"))     | first | "\(.ts) [\(.session_id)]" // "-"),
    approved: (map(select(.event=="plan_approved"))    | first | .ts // "-"),
    dispatch: (map(select(.event=="dispatch_sent"))    | first | "\(.ts) [\(.session_id)]" // "-"),
    result:   (map(select(.event=="worker_result"))    | first | .status // "-"),
    pr:       (map(select(.event=="worker_result"))    | first | .pr_url // "-")
  }
  | "| \(.t) | \(.triage) | \(.plan) | \(.approved) | \(.dispatch) | \(.result) | \(.pr) |"
' "$LOGS"/audit-*.jsonl
