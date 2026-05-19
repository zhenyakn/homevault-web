# HomeVault local dev startup script
# Run this from the project directory: .\start-dev.ps1

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$projectDir = $PSScriptRoot
$mysqlBin = "C:\Program Files\MySQL\MySQL Server 8.4\bin"
$mysqld = "$mysqlBin\mysqld.exe"
$mysqladmin = "$mysqlBin\mysqladmin.exe"

Set-Location $projectDir

# Abort on any error
$ErrorActionPreference = "Stop"

# ── 1. MySQL ──────────────────────────────────────────────────────────────────
$mysqlRunning = & $mysqladmin -u root ping 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Starting MySQL..." -ForegroundColor Cyan
    Start-Process -FilePath $mysqld -ArgumentList '--datadir="C:\ProgramData\MySQL\MySQL Server 8.4\Data"', '--port=3306' -WindowStyle Hidden
    Start-Sleep -Seconds 5
    Write-Host "MySQL started." -ForegroundColor Green
} else {
    Write-Host "MySQL already running." -ForegroundColor Green
}

# ── 2. Install / sync dependencies ───────────────────────────────────────────
Write-Host "`nInstalling dependencies..." -ForegroundColor Cyan
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { Write-Host "pnpm install failed." -ForegroundColor Red; exit 1 }
Write-Host "Dependencies up to date." -ForegroundColor Green

# ── 3. Database migrations ────────────────────────────────────────────────────
Write-Host "`nRunning database migrations..." -ForegroundColor Cyan
pnpm run db:migrate
if ($LASTEXITCODE -ne 0) { Write-Host "Migration failed." -ForegroundColor Red; exit 1 }
Write-Host "Migrations done." -ForegroundColor Green

# ── 4. Build frontend ─────────────────────────────────────────────────────────
Write-Host "`nBuilding frontend..." -ForegroundColor Cyan
node_modules\.bin\vite build
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build failed." -ForegroundColor Red; exit 1 }
Write-Host "Frontend built." -ForegroundColor Green

# ── 5. Start dev server ───────────────────────────────────────────────────────
Write-Host "`nStarting HomeVault dev server..." -ForegroundColor Cyan
Write-Host "Open http://localhost:3005 in your browser" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor DarkGray

cmd /c "node node_modules\tsx\dist\cli.mjs server/_core/index.ts"
