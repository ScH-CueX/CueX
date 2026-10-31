#!/usr/bin/env bash
# Download the demo ASR model (sherpa-onnx streaming zipformer zh, int8, 167 MB) into ~/.cache/cuex-models and verify its SHA256.
# The same archive and hash as infra/windows/asr/install.ps1.
#   apps/server/scripts/voice-fetch-asr-model.sh            default folder: ${CUEX_MODEL_DIR:-$HOME/.cache/cuex-models}
# Safe to run again: it stops when the model is already there.
set -euo pipefail

NAME="sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30"
SHA256="5a2832047ea1f97dd0dc595b816c230c4bafad65cfc0341fa57517cadc50afd0"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${NAME}.tar.bz2"
ROOT="${CUEX_MODEL_DIR:-$HOME/.cache/cuex-models}"

if [ -f "$ROOT/$NAME/tokens.txt" ]; then
  echo "ASR model already in $ROOT/$NAME"
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$ROOT"
echo "Downloading $NAME (about 127 MB) ..."
curl -fL --retry 3 --connect-timeout 20 -o "$work/model.tar.bz2" "$URL"

got="$(shasum -a 256 "$work/model.tar.bz2" | cut -d' ' -f1)"
if [ "$got" != "$SHA256" ]; then
  echo "SHA256 mismatch: got $got, want $SHA256" >&2
  exit 3
fi

tar xjf "$work/model.tar.bz2" -C "$ROOT"
echo "Installed $ROOT/$NAME"
