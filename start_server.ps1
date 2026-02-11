# Game Account Manager - Local Web Server
# This script starts a simple HTTP server to serve your web app

Write-Host "🚀 Starting Game Account Manager Local Server..." -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
}
elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
}
else {
    Write-Host "❌ Python not found!" -ForegroundColor Red
    Write-Host "Please install Python from: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Get the directory where this script is located
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "📁 Serving from: $scriptDir" -ForegroundColor Green
Write-Host "🌐 Server URL: http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
Write-Host "✨ Instructions:" -ForegroundColor Yellow
Write-Host "   1. Open your browser" -ForegroundColor White
Write-Host "   2. Go to: http://localhost:8000/index.html" -ForegroundColor White
Write-Host "   3. The app will load Dã Tẩu tasks from txt files" -ForegroundColor White
Write-Host ""
Write-Host "📝 To add new quests:" -ForegroundColor Yellow
Write-Host "   - Edit assets/data/chiso.txt, tichluy.txt, or vatpham.txt" -ForegroundColor White
Write-Host "   - Refresh the browser page" -ForegroundColor White
Write-Host ""
Write-Host "🛑 Press Ctrl+C to stop the server" -ForegroundColor Red
Write-Host ""
Write-Host "Starting server..." -ForegroundColor Green

# Start Python HTTP server
& $pythonCmd -m http.server 8000
