#!/usr/bin/env bash
set -u
# Only forwards a port. The Windows model process has its own lifecycle.
# Ctrl+C exits the reconnect loop and its active SSH child.
child=""
stop() {
  trap - INT TERM EXIT
  if [ -n "$child" ]; then kill "$child" 2>/dev/null || true; fi
  exit 0
}
trap stop INT TERM EXIT
while true; do
  ssh -N -L "${CUEX_S1_LOCAL_PORT:-18080}:127.0.0.1:${CUEX_S1_REMOTE_PORT:-18080}" \
    -o ExitOnForwardFailure=yes -o BatchMode=yes -o ConnectTimeout=20 \
    -o ServerAliveInterval=15 -o ServerAliveCountMax=2 \
    -p 20415 -i "$HOME/.ssh/nkanf_c" -o IdentitiesOnly=yes \
    -o UserKnownHostsFile=/tmp/cuex_known_hosts -o StrictHostKeyChecking=accept-new \
    nkanf@192.0.2.1 &
  child=$!
  wait "$child" || true
  child=""
  printf '%s\n' 'System 1 tunnel closed. Reconnecting in 2 seconds.' >&2
  sleep 2
done
