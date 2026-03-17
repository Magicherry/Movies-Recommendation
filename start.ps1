# StreamX startup script: starts Django backend (8001) and Next.js frontend (3001).
# Run from project root: .\start.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$BackendPort = 8001
$FrontendPort = 3001
$VenvPath = Join-Path $ProjectRoot ".venv"
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"

Write-Host "StreamX startup" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot`n" -ForegroundColor Gray

# Check Python venv
if (-not (Test-Path (Join-Path $VenvPath "Scripts\Activate.ps1"))) {
    Write-Host "Virtual environment not found. Create it first:" -ForegroundColor Yellow
    Write-Host "  python -m venv .venv" -ForegroundColor Gray
    Write-Host "  .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt`n" -ForegroundColor Gray
    exit 1
}

# Start backend in a new window
$BackendCmd = "Set-Location '$BackendDir'; & '$VenvPath\Scripts\Activate.ps1'; python manage.py runserver $BackendPort"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendCmd
Write-Host "Backend starting at http://localhost:$BackendPort" -ForegroundColor Green

Start-Sleep -Seconds 2

# Start frontend in a new window (ensure npm deps; then dev server)
$FrontendCmd = "Set-Location '$FrontendDir'; if (-not (Test-Path node_modules)) { npm install }; npm run dev -- -p $FrontendPort"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $FrontendCmd
Write-Host "Frontend starting at http://localhost:$FrontendPort" -ForegroundColor Green

Write-Host "`nApp URL: http://localhost:$FrontendPort" -ForegroundColor Cyan
Write-Host "Close the two opened windows to stop backend and frontend.`n" -ForegroundColor Gray

# Optional: open browser after a short delay
Start-Sleep -Seconds 4
Start-Process "http://localhost:$FrontendPort"
