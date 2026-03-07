#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

WITH_MYSQL=0
for arg in "$@"; do
  case "$arg" in
    --with-mysql)
      WITH_MYSQL=1
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $(basename "$0") [--with-mysql]"
      exit 1
      ;;
  esac
done

if ! command -v uv >/dev/null 2>&1; then
  echo "Missing dependency: uv"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Missing dependency: npm"
  exit 1
fi

if [[ "$WITH_MYSQL" -eq 1 ]]; then
  if command -v docker >/dev/null 2>&1; then
    echo "Starting MySQL via docker compose..."
    (cd "$ROOT_DIR" && docker compose up -d mysql) || {
      echo "Warning: failed to start MySQL with docker compose."
    }
  else
    echo "Warning: docker is not installed; skipping MySQL startup."
  fi
fi

cleanup() {
  local exit_code=$?
  trap - INT TERM EXIT
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  exit "$exit_code"
}
trap cleanup INT TERM EXIT

echo "Starting backend on 0.0.0.0:8000..."
(
  cd "$BACKEND_DIR"
  UV_CACHE_DIR=../.uv-cache UV_PYTHON_INSTALL_DIR=../.uv-python uv run python main.py
) &
BACKEND_PID=$!

echo "Starting frontend on 0.0.0.0:5173..."
(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 0.0.0.0 --port 5173
) &
FRONTEND_PID=$!

echo
echo "Dev servers are starting..."
echo "Frontend: http://<this-machine-ip>:5173"
echo "Backend:  http://<this-machine-ip>:8000"
echo "Press Ctrl+C to stop both."
echo

wait "$BACKEND_PID" "$FRONTEND_PID"
