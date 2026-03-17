#!/usr/bin/env bash
# StreamX startup script: starts Django backend (8001) and Next.js frontend (3001).
# Run from project root: ./start.sh

set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT=8001
FRONTEND_PORT=3001
VENV_PATH="$PROJECT_ROOT/.venv"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo "StreamX startup"
echo "Project root: $PROJECT_ROOT"
echo ""

# Check Python venv
if [ ! -f "$VENV_PATH/bin/activate" ]; then
  echo "Virtual environment not found. Create it first:"
  echo "  python -m venv .venv"
  echo "  source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

# Start backend in background
(
  cd "$BACKEND_DIR"
  source "$VENV_PATH/bin/activate"
  exec python manage.py runserver "$BACKEND_PORT"
) &
BACKEND_PID=$!
echo "Backend starting at http://localhost:$BACKEND_PORT (PID $BACKEND_PID)"

sleep 2

# Ensure frontend deps and start dev server (foreground so script can be Ctrl+C'd)
cd "$FRONTEND_DIR"
[ -d node_modules ] || npm install
echo "Frontend starting at http://localhost:$FRONTEND_PORT"
echo ""
echo "App URL: http://localhost:$FRONTEND_PORT"
echo "Press Ctrl+C to stop frontend; backend PID $BACKEND_PID will keep running (kill it manually if needed)."
echo ""

exec npm run dev -- -p "$FRONTEND_PORT"
