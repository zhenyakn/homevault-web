# HomeVault local dev startup script
# Run this from the project directory: .\start-dev.ps1

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$projectDir = $PSScriptRoot
$mysqlBin = "C:\Program Files\MySQL\MySQL Server 8.4\bin"
$mysqld = "$mysqlBin\mysqld.exe"
$mysqladmin = "$mysqlBin\mysqladmin.exe"

Set-Location $projectDir

# 1. Start MySQL if not already running
$mysqlRunning = & $mysqladmin -u root ping 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Starting MySQL..." -ForegroundColor Cyan
    Start-Process -FilePath $mysqld -ArgumentList '--datadir="C:\ProgramData\MySQL\MySQL Server 8.4\Data"', '--port=3306' -WindowStyle Hidden
    Start-Sleep -Seconds 5
    Write-Host "MySQL started." -ForegroundColor Green
} else {
    Write-Host "MySQL already running." -ForegroundColor Green
}

# 2. Start the dev server
Write-Host "Starting HomeVault dev server..." -ForegroundColor Cyan
Write-Host "Open http://localhost:3005 in your browser" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor DarkGray

cmd /c "node node_modules\tsx\dist\cli.mjs server/_core/index.ts"
