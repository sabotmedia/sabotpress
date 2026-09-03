#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: scripts/new-phase.sh phase-name"
  exit 1
fi

name="$1"
mkdir -p phases
file="phases/${name}.sh"

if [[ -e "$file" ]]; then
  echo "phase already exists: $file"
  exit 1
fi

cat > "$file" <<'PHASE'
#!/usr/bin/env bash
set -Eeuo pipefail

cd ~/sabotmedia || exit 1

# paste phase here
PHASE

chmod +x "$file"
echo "created $file"
