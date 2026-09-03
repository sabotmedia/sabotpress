#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: scripts/run-phase.sh phases/<phase-file>.sh"
  exit 1
fi

PHASE_FILE="$1"

if [[ ! -f "$PHASE_FILE" ]]; then
  echo "phase file not found: $PHASE_FILE"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

echo
echo "== sabot phase runner =="
echo "repo:   $REPO_ROOT"
echo "phase:  $PHASE_FILE"
echo

echo "== running phase =="
bash "$PHASE_FILE"
echo

echo "== build verification =="
npm run build
echo

echo "== done =="
