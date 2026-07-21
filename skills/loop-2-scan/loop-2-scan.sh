#!/bin/bash
set -euo pipefail

NODE_BIN="${NODE_BIN:-/Users/bhuang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

cd "$HOME/workspace/dev-loop"
"$NODE_BIN" "$SCRIPT_DIR/loop-2-scan.js"
