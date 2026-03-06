# Backend

FastAPI backend for Football Data Collector.

## Setup
1. Copy `.env.example` to `.env` and update MySQL credentials.
2. Install dependencies:
   - `uv sync`

## Run
- `uv run start`

## Super Admin Setup
- Create (or promote) a super admin user:
  - `uv run python scripts/create_super_admin.py --email you@example.com --password 'StrongPassword123!'`

## Quality checks
- Lint: `uv run ruff check .`
- Tests: `uv run pytest`
