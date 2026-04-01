$ErrorActionPreference = "Stop"

if (-not $env:GH_TOKEN) {
  Write-Host "[ERROR] GH_TOKEN environment variable is not set. Please set a GitHub Personal Access Token with 'repo' permission." -ForegroundColor Red
  exit 1
}

Write-Host "Using electron-builder to publish to GitHub Releases..." -ForegroundColor Cyan

# Ensure dependencies are installed
if (Test-Path "package-lock.json") {
  npm ci
} else {
  npm install
}

# Build and publish. --publish always will create a GitHub Release and upload artifacts
npm run build
npx electron-builder --win --publish always
