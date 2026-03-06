param(
    [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"

Write-Host "Starting local MySQL..."
docker compose up -d mysql

Write-Host "Waiting for MySQL health..."
docker compose ps mysql

if (-not (Test-Path (Join-Path $backendDir $EnvFile))) {
    throw "Missing $EnvFile in backend. Copy .env.example to .env first."
}

Push-Location $backendDir
try {
    Write-Host "Applying migrations to development database..."
    $env:UV_CACHE_DIR = "..\\.uv-cache"
    $env:UV_PYTHON_INSTALL_DIR = "..\\.uv-python"
    uv run alembic upgrade head

    Write-Host "Applying migrations to test database..."
    $env:APP_ENV = "test"
    uv run alembic upgrade head

    Write-Host "Local MySQL setup complete."
}
finally {
    Pop-Location
}
