#!/usr/bin/env bash
# Kopieer alle SVG-vlaggen uit de country-flags repo naar assets/flags/
# Gebruik: vanaf de projectmap (Landjes app): ./scripts/fetch-flags.sh

set -e
REPO_URL="https://github.com/hampusborgos/country-flags.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FLAGS_DIR="$PROJECT_ROOT/assets/flags"
CACHE_DIR="$PROJECT_ROOT/.cache/country-flags"

cd "$PROJECT_ROOT"
mkdir -p "$FLAGS_DIR"
mkdir -p "$(dirname "$CACHE_DIR")"

if [[ ! -d "$CACHE_DIR/.git" ]]; then
  echo "Kloonen van country-flags repository..."
  git clone --depth 1 "$REPO_URL" "$CACHE_DIR"
else
  echo "Repository bestaat al; pull voor eventuele updates..."
  (cd "$CACHE_DIR" && git pull --depth 1 || true)
fi

echo "Kopiëren van SVG-bestanden naar assets/flags/..."
cp -f "$CACHE_DIR"/svg/*.svg "$FLAGS_DIR/" 2>/dev/null || true

COUNT=$(find "$FLAGS_DIR" -maxdepth 1 -name "*.svg" | wc -l | tr -d ' ')
echo "Klaar. Er staan nu $COUNT SVG-vlaggen in assets/flags/."
