# Backend

FastAPI backend for Football Data Collector.

## Setup
1. Copy `.env.example` to `.env` and update MySQL credentials.
2. Install dependencies:
   - `uv sync`

## Run
- `uv run start`

## Quality checks
- Lint: `uv run ruff check .`
- Tests: `uv run pytest`
