#!/bin/bash
# loop-1.sh — Jira fetch + dedup + ticket selection + lock

set -euo pipefail

DEV_LOOP=~/workspace/dev-loop
CLARIFIED="$DEV_LOOP/clarified"
PROCESSED="$DEV_LOOP/processed.json"
POLL_LOCK="$DEV_LOOP/.poll.lock"

# Load .env
set -a; source "$DEV_LOOP/.env"; set +a

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >&2; }
now_s() { date +%s; }
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ── Lock helpers ────────────────────────────────────────────────────────────
check_lock_stale() {
  local lockfile="$1"
  if [[ ! -f "$lockfile" ]]; then return 0; fi  # no lock = proceed
  local acquired
  acquired=$(python3 -c "import json; print(json.load(open('$lockfile'))['acquired'])")
  local acquired_s
  acquired_s=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$acquired" +%s 2>/dev/null || echo 0)
  local age_h=$(( ($(now_s) - acquired_s) / 3600 ))
  [[ $age_h -ge 2 ]]  # returns 0 (true) if stale
}

write_lock() {
  local lockfile="$1"
  local session
  session=$(openssl rand -hex 4)
  echo "{\"session\": \"$session\", \"acquired\": \"$(now_iso)\"}" > "$lockfile"
}

# ── Poll lock ───────────────────────────────────────────────────────────────
if [[ -f "$POLL_LOCK" ]]; then
  if check_lock_stale "$POLL_LOCK"; then
    log "Stale poll lock, overwriting."
  else
    log "Poll lock active, another session is running. Exit."
    exit 0
  fi
fi
write_lock "$POLL_LOCK"
trap 'rm -f "$POLL_LOCK"' EXIT

# ── Jira fetch ──────────────────────────────────────────────────────────────
mkdir -p "$CLARIFIED"
[[ ! -f "$PROCESSED" ]] && echo '{}' > "$PROCESSED"

log "Poll start"

JQL='assignee = currentUser() AND status = "Doing" AND labels = "claude-ready"'
FIELDS='summary,description,comment,updated'
ENCODED_JQL=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$JQL")
ENCODED_FIELDS=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FIELDS")
URL="${JIRA_BASE}/rest/api/3/search/jql?jql=${ENCODED_JQL}&fields=${ENCODED_FIELDS}"
AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_TOKEN" | base64)

RESPONSE=$(curl -sf -H "Accept: application/json" -H "Authorization: Basic $AUTH" "$URL" || {
  log "Jira API error (curl failed)"
  exit 1
})

python3 - <<PYEOF
import sys, json, os
from datetime import datetime, timezone

data = json.loads('''${RESPONSE}'''.replace("'''", "\"\"\""))
issues = data.get('issues', [])
clarified_dir = '${CLARIFIED}'
processed_file = '${PROCESSED}'

now = lambda: datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
print(f"[{now()}] Tickets found: {len(issues)}", file=sys.stderr)

try:
    processed = json.loads(open(processed_file).read())
except:
    processed = {}

def extract_text(node):
    if node is None: return ''
    if isinstance(node, str): return node
    if isinstance(node, list): return ''.join(extract_text(n) for n in node)
    if not isinstance(node, dict): return str(node)
    text = node.get('text', '') if isinstance(node.get('text'), str) else ''
    content = ''.join(extract_text(n) for n in node.get('content', []))
    if node.get('type') == 'paragraph': return f"{text}{content}\n\n"
    if node.get('type') == 'hardBreak': return '\n'
    if node.get('type') == 'listItem': return f"- {content}".rstrip()
    return f"{text}{content}"

def render_field(value, fallback):
    text = extract_text(value).strip()
    if text: return text
    if value and isinstance(value, dict): return f"\`\`\`json\n{json.dumps(value, indent=2)}\n\`\`\`"
    return fallback

for issue in issues:
    key = issue['key']
    updated = issue['fields'].get('updated', 'missing-updated')
    dedupe_key = f"{key}-{updated}"
    if processed.get(dedupe_key):
        print(f"[{now()}] Skipped (dedup): {key}", file=sys.stderr)
        continue
    comments = issue['fields'].get('comment', {}).get('comments', [])
    comments_md = '\n\n---\n\n'.join(
        f"**{c.get('author', {}).get('displayName', 'Unknown')}** ({c.get('created', '')}):\n{render_field(c.get('body'), '_No comment body_')}"
        for c in comments
    ) or '_No comments_'
    content = f"""# {key}: {issue['fields'].get('summary', 'Untitled')}

**Fetched:** {now()}

## Description

{render_field(issue['fields'].get('description'), '_No description_')}

## Comments

{comments_md}
"""
    filepath = os.path.join(clarified_dir, f"{key}.md")
    open(filepath, 'w').write(content)
    print(f"[{now()}] Written: {filepath}", file=sys.stderr)
    processed[dedupe_key] = now()

open(processed_file, 'w').write(json.dumps(processed, indent=2) + '\n')
PYEOF

log "Poll end"

# ── Ticket selection ────────────────────────────────────────────────────────
TICKET=$(find "$CLARIFIED" -maxdepth 1 -name "*.md" | while read -r f; do
  key=$(basename "$f" .md)
  [[ ! -f "$CLARIFIED/$key/plan.md" ]] && echo "$key"
done | sort | head -1 || true)

[[ -z "$TICKET" ]] && exit 0

# ── Per-ticket lock ─────────────────────────────────────────────────────────
TICKET_LOCK="$CLARIFIED/$TICKET.lock"
if [[ -f "$TICKET_LOCK" ]]; then
  if check_lock_stale "$TICKET_LOCK"; then
    log "Stale ticket lock for $TICKET, overwriting."
  else
    log "Ticket $TICKET locked by another session. Exit."
    exit 0
  fi
fi
write_lock "$TICKET_LOCK"

# Output for Claude skill
echo "TICKET=$TICKET"
echo "CONTENT_FILE=$CLARIFIED/$TICKET.md"
