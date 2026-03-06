$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"

Push-Location $backendDir
try {
    $env:UV_CACHE_DIR = "..\\.uv-cache"
    $env:UV_PYTHON_INSTALL_DIR = "..\\.uv-python"
    $env:APP_ENV = "test"
    uv run pytest
}
finally {
    Pop-Location
}
