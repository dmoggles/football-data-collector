The high level goal of this project is to create a web app with a UI that allows fast football event collection through an intuitive interface.

Core goals:
- Set up teams and players ahead of time
- Set up matches ahead of time
- On match day, pre-load squads and quickly enter events (shots, goals, etc.)
- Automate repetitive actions (including time tracking)
- User accounts with login/logout support
- Session management for secure persistent auth
- Team, player, and match setup scoped to user access roles

Technical notes:
- Python dependency/environment manager: `uv`
- Primary database: MySQL

## Local MySQL Dev/Test Setup

This repo includes a local MySQL workflow for both development and testing databases.

### 1. Start MySQL (Docker)
From repo root:

```powershell
docker compose up -d mysql
```

This starts MySQL with:
- Dev DB: `football_data_collector_dev`
- Test DB: `football_data_collector_test`
- User: `football_app`
- Password: `football_app_password`

### 2. Configure backend env

Copy env template:

```powershell
Copy-Item backend\.env.example backend\.env
```

(`backend\.env` is gitignored.)

### 3. Apply migrations

```powershell
cd backend
$env:UV_CACHE_DIR='..\.uv-cache'
$env:UV_PYTHON_INSTALL_DIR='..\.uv-python'
uv run alembic upgrade head
```

### 4. Apply migrations to test DB

```powershell
cd backend
$env:UV_CACHE_DIR='..\.uv-cache'
$env:UV_PYTHON_INSTALL_DIR='..\.uv-python'
$env:APP_ENV='test'
uv run alembic upgrade head
```

### 5. Run tests against local test DB

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\run_tests_local.ps1
```

### Optional one-shot setup

```powershell
powershell -ExecutionPolicy Bypass -File backend\scripts\setup_local_db.ps1
```
