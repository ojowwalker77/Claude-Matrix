#Requires -Version 5.1
<#
.SYNOPSIS
    Claude Matrix Installer for Windows
.DESCRIPTION
    Installs Bun (if needed) and Claude Matrix
.EXAMPLE
    iwr https://raw.githubusercontent.com/ojowwalker77/Claude-Matrix/main/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$MATRIX_REPO = "https://github.com/ojowwalker77/Claude-Matrix.git"
$MATRIX_DIR = if ($env:MATRIX_DIR) { $env:MATRIX_DIR } else { "$env:USERPROFILE\.claude\matrix" }
$BUN_INSTALL_URL = "https://bun.sh/install.ps1"

function Write-Info { param($msg) Write-Host "→ $msg" -ForegroundColor Blue }
function Write-Success { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

function Test-Command { param($cmd) return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host ""
Write-Host "╭─────────────────────────────────────╮" -ForegroundColor Cyan
Write-Host "│  Claude Matrix Installer            │" -ForegroundColor Cyan
Write-Host "╰─────────────────────────────────────╯" -ForegroundColor Cyan
Write-Host ""

# Check for existing installation
if (Test-Command "matrix") {
    Write-Warn "Matrix is already installed"
    $response = Read-Host "Do you want to reinstall/update? [y/N]"
    if ($response -notmatch "^[Yy]$") {
        Write-Info "Aborted. Run 'matrix upgrade' to update."
        exit 0
    }
}

# Install Bun if not present
if (Test-Command "bun") {
    Write-Success "Bun is already installed ($(bun --version))"
} else {
    Write-Info "Installing Bun..."
    try {
        irm $BUN_INSTALL_URL | iex
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")
        $env:BUN_INSTALL = "$env:USERPROFILE\.bun"
        $env:Path = "$env:BUN_INSTALL\bin;$env:Path"
    } catch {
        Write-Err "Failed to install Bun. Please install it manually: https://bun.sh"
    }

    if (Test-Command "bun") {
        Write-Success "Bun installed successfully ($(bun --version))"
    } else {
        Write-Err "Bun installation failed. Please install manually: https://bun.sh"
    }
}

# Check for Git
if (-not (Test-Command "git")) {
    Write-Err "Git is required but not installed. Please install Git for Windows: https://git-scm.com"
}

# Clone or update Matrix
if (Test-Path $MATRIX_DIR) {
    Write-Warn "Matrix directory already exists at $MATRIX_DIR"
    Write-Info "Updating existing installation..."
    Push-Location $MATRIX_DIR
    git pull
    bun install
    Pop-Location
} else {
    Write-Info "Cloning Matrix to $MATRIX_DIR..."
    $parentDir = Split-Path $MATRIX_DIR -Parent
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }
    git clone $MATRIX_REPO $MATRIX_DIR
    Push-Location $MATRIX_DIR
    bun install
    Pop-Location
}

Write-Success "Matrix installed at $MATRIX_DIR"

# Add to PATH if not already there
$binPath = "$MATRIX_DIR\bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binPath*") {
    Write-Info "Adding Matrix to PATH..."
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$binPath", "User")
    $env:Path = "$env:Path;$binPath"
    Write-Success "Added to PATH (restart terminal for changes to take effect)"
}

# Run init unless skipped
if (-not $env:MATRIX_SKIP_INIT) {
    Write-Host ""
    Write-Info "Running Matrix initialization..."
    Write-Host ""

    if (Test-Command "matrix") {
        matrix init
    } elseif (Test-Path "$MATRIX_DIR\bin\matrix") {
        & bun run "$MATRIX_DIR\src\cli.ts" init
    } else {
        Write-Warn "Could not find matrix command. Run 'matrix init' manually."
    }
}

Write-Host ""
Write-Host "╭─────────────────────────────────────╮" -ForegroundColor Green
Write-Host "│  Installation complete!             │" -ForegroundColor Green
Write-Host "╰─────────────────────────────────────╯" -ForegroundColor Green
Write-Host ""
Write-Host "  Restart your terminal, then run:" -ForegroundColor DarkGray
Write-Host "    matrix version" -ForegroundColor Cyan
Write-Host ""
