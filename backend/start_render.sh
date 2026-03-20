#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${STREAMX_DATA_DIR:-/tmp/streamx}"
SEED_DIR="$PROJECT_ROOT/models/artifacts"

mkdir -p "$DATA_DIR"

# Seed persistent disk on first boot.
if [ ! -f "$DATA_DIR/option1/model.pkl" ] && [ -d "$SEED_DIR" ]; then
  cp -R "$SEED_DIR/." "$DATA_DIR/"
fi

cd "$PROJECT_ROOT"
exec gunicorn recommender_backend.wsgi:application --chdir backend --bind "0.0.0.0:${PORT:-8001}"
