# StreamX startup script: starts Django backend (8001) and Next.js frontend (3001).
# Run from project root: .\start.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$BackendPort = 8001
$FrontendPort = 3001
$VenvPath = Join-Path $ProjectRoot ".venv"
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"
$CondaEnvName = "movies-recommendation"

Write-Host "StreamX startup" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot`n" -ForegroundColor Gray

$VenvActivate = Join-Path $VenvPath "Scripts\Activate.ps1"
if (Test-Path $VenvActivate) {
    $BackendCmd = "Set-Location '$BackendDir'; & '$VenvActivate'; python manage.py runserver $BackendPort"
} else {
    $condaCheck = & conda env list 2>$null | Select-String -Pattern "^\s*$([regex]::Escape($CondaEnvName))\s"
    if (-not $condaCheck) {
        Write-Host "No .venv and conda env '$CondaEnvName' not found. Either:" -ForegroundColor Yellow
        Write-Host "  python -m venv .venv" -ForegroundColor Gray
        Write-Host "  .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt" -ForegroundColor Gray
        Write-Host "  or: conda create -n $CondaEnvName python=3.10 -y" -ForegroundColor Gray
        Write-Host "       conda run -n $CondaEnvName python -m pip install -r requirements-train.txt`n" -ForegroundColor Gray
        exit 1
    }
    $BackendCmd = "Set-Location '$BackendDir'; conda run -n $CondaEnvName python manage.py runserver $BackendPort"
}

# Start backend in a new window
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
