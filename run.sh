#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

start_db() {
  cd "$SCRIPT_DIR"
  echo "Starting Postgres..."
  docker compose up -d db
}

start_backend() {
  cd "$SCRIPT_DIR/backend"

  if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "Created .env from .env.example."
    echo "⚠️  Set your ANTHROPIC_API_KEY in backend/.env before using AI features."
  fi

  # Use localhost DB URL for local dev (not the docker-internal 'db' hostname)
  if grep -q "postgresql://user:password@db:" .env; then
    sed -i '' 's|postgresql://user:password@db:|postgresql://user:password@localhost:|' .env
  fi

  # Find and activate a Python virtual environment
  if [ -n "$VIRTUAL_ENV" ]; then
    : # already active
  elif [ -f "$SCRIPT_DIR/../../.venv/bin/activate" ]; then
    source "$SCRIPT_DIR/../../.venv/bin/activate"
  elif [ -f "$SCRIPT_DIR/.venv/bin/activate" ]; then
    source "$SCRIPT_DIR/.venv/bin/activate"
  fi

  if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo "ANTHROPIC_API_KEY is not set."
    printf "Enter your Anthropic API key: "
    read -r key
    if [ -z "$key" ]; then
      echo "No key entered. Exiting."
      exit 1
    fi
    export ANTHROPIC_API_KEY="$key"
    # Write to .env so uvicorn's reloader subprocess also picks it up
    if grep -q "^ANTHROPIC_API_KEY=" .env 2>/dev/null; then
      sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$key|" .env
    else
      echo "ANTHROPIC_API_KEY=$key" >> .env
    fi
  fi

  echo "Starting FastAPI backend at http://localhost:8000 ..."
  uvicorn main:app --reload
}

start_frontend() {
  cd "$SCRIPT_DIR/frontend"

  if [ ! -f ".env.local" ]; then
    cp .env.local.example .env.local
    echo "Created .env.local from .env.local.example."
  fi

  if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
  fi

  echo "Starting Next.js frontend at http://localhost:3000 ..."
  npm run dev
}

stop_all() {
  cd "$SCRIPT_DIR"

  echo "Stopping Postgres (Docker)..."
  # 'down' stops and removes containers but keeps the named volume, so your data survives.
  docker compose down

  # The backend (uvicorn :8000) and frontend (next :3000) normally run in the
  # foreground and stop with Ctrl+C. Clean up any that are still holding a port.
  for port in 8000 3000; do
    pid="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
    if [ -n "$pid" ]; then
      echo "Stopping process on port $port (PID $pid)..."
      kill "$pid" 2>/dev/null || true
    fi
  done

  echo "All services stopped."
}

case "$1" in
  db)       start_db ;;
  backend)  start_backend ;;
  frontend) start_frontend ;;
  stop)     stop_all ;;
  *)
    echo "Usage: ./run.sh [db|backend|frontend|stop]"
    echo ""
    echo "  db        Start Postgres via Docker (run this first)"
    echo "  backend   Start the FastAPI + Claude API server (port 8000)"
    echo "  frontend  Start the Next.js dev server (port 3000)"
    echo "  stop      Stop Postgres and any running backend/frontend dev servers"
    echo ""
    echo "⚠️  Set ANTHROPIC_API_KEY in backend/.env before starting the backend."
    exit 1
    ;;
esac
