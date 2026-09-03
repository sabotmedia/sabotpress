#!/usr/bin/env bash
set -Eeuo pipefail

cd ~/sabotmedia || exit 1

echo "== test phase: styling tweak =="

python3 - <<'PY'
from pathlib import Path

p = Path("src/styles.css")
s = p.read_text()

if ".app-header" in s:
    s = s.replace(
        "background: rgba(9, 9, 9, 0.78);",
        "background: rgba(9, 9, 9, 0.88);"
    )

    if "border-bottom: 1px solid rgba(236, 231, 220, 0.08);" in s:
        s = s.replace(
            "border-bottom: 1px solid rgba(236, 231, 220, 0.08);",
            "border-bottom: 1px solid rgba(236, 231, 220, 0.18);"
        )

p.write_text(s)
print("header style updated")
PY

echo "== phase complete =="