#!/usr/bin/env bash
set -eu
# One pinned SSH exec session carries the loopback-only System 1 relay.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/s1-relay.mjs"
