#!/usr/bin/env bash
# Keep the maintained tunnel script next to the server deployment helpers.
exec /bin/bash "$(cd "$(dirname "$0")/.." && pwd)/apps/server/scripts/s1-tunnel.sh"
