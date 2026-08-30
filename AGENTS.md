# Repository Guidelines

## Project Structure & Module Organization

The FastAPI backend lives in `backend/app/`: API routes are under `api/routes/`, database models under `models/`, request/response types under `schemas/`, and reusable logic under `services/`. Database migrations are in `backend/alembic/versions/`, with backend tests in `backend/tests/`. The React/TypeScript frontend is in `frontend/src/`, organized into `views/`, `components/`, `domain/`, `types/`, and `utils/`. Shared formation and goal-dimension data belongs in `shared/`; deployment and database configuration is in the root Compose files and `infra/`.

## Build, Test, and Development Commands

- `./scripts/start_lan_dev.sh`: start the backend and Vite frontend together; add `--with-mysql` to start local MySQL.
- `cd backend && uv sync`: install Python 3.13 dependencies.
- `cd backend && uv run start`: run the FastAPI service locally.
- `cd backend && uv run alembic upgrade head`: apply database migrations.
- `cd backend && uv run pytest`: run the backend test suite.
- `cd backend && uv run ruff check .`: lint Python and check import ordering.
- `cd frontend && npm ci && npm run dev`: install locked dependencies and start Vite.
- `cd frontend && npm run build`: type-check and create a production build.
- `cd frontend && npm run lint`: run ESLint across TypeScript and TSX files.

## Coding Style & Naming Conventions

Use four spaces in Python, type hints for public interfaces, `snake_case` for modules/functions, and `PascalCase` for classes. Ruff enforces a 100-character line limit and the configured `E`, `F`, `I`, `B`, and `UP` rules. In TypeScript, follow existing two-space indentation: React components and view files use `PascalCase` (for example, `PitchDiagram.tsx`), while utilities use `camelCase`. Keep API schemas, ORM models, and migrations synchronized when changing persisted data.

## Testing Guidelines

Backend tests use pytest and follow `backend/tests/test_*.py`. Add focused tests near the affected feature and cover authorization boundaries for API changes. Tests require the configured `tapline_test` MySQL database; see the root `README.md` or use `backend/scripts/run_tests_local.ps1` on Windows. The frontend has no automated test runner yet, so run both `npm run lint` and `npm run build` after UI changes.

## Commit & Pull Request Guidelines

Recent commits use short, imperative subjects such as `Add GET /clubs endpoint...` and `Fix frontend Docker build...`. Keep each commit scoped to one concern. Pull requests should explain the behavior change, list validation commands, link relevant issues, and call out migrations or configuration changes. Include screenshots for visible UI changes and never commit `.env` files, credentials, or uploaded media.
