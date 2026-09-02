#Requires -Version 5.1
<#
.SYNOPSIS
  One-command RealtorOS install for Windows (native PowerShell).

.DESCRIPTION
  User-local install under %LOCALAPPDATA%\realtor-os — no admin required.
  Data (listings) still lives in %USERPROFILE%\.realtor-os

.EXAMPLE
  powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.ps1 | iex"
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$DataDir = if ($env:REALTOR_DATA_DIR) { $env:REALTOR_DATA_DIR } else { Join-Path $env:USERPROFILE '.realtor-os' }
$InstallDir = if ($env:REALTOR_INSTALL_DIR) { $env:REALTOR_INSTALL_DIR } else { Join-Path $env:USERPROFILE 'RealtorOS' }
$RepoZip = 'https://github.com/nativestrider/realtor-os/archive/refs/heads/main.zip'
$Branch = if ($env:REALTOR_BRANCH) { $env:REALTOR_BRANCH } else { 'main' }

function Write-Log([string]$Message) { Write-Host "[realtor-os] $Message" }
function Write-Warn([string]$Message) { Write-Warning "[realtor-os] $Message" }

function Ensure-Node {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $version = & node -p "process.versions.node.split('.')[0]"
        if ([int]$version -ge 20) {
            Write-Log "Node.js OK ($(node --version))"
            return
        }
        Write-Warn "Node $(node --version) is older than 20 — trying to install Node 22…"
    }

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Log 'Installing Node.js 22 LTS via winget (user scope)…'
        & winget install --id OpenJS.NodeJS.LTS --version 22 --scope user --accept-package-agreements --accept-source-agreements 2>$null
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
        if (Get-Command node -ErrorAction SilentlyContinue) {
            Write-Log "Node.js ready ($(node --version))"
            return
        }
    }

    throw @"
Node.js 20+ is required. Install LTS from https://nodejs.org/ then re-run this script.
Or use winget: winget install OpenJS.NodeJS.LTS
"@
}

function Ensure-Source {
    $wizard = Join-Path $InstallDir 'scripts\launch-wizard.sh'
    if (Test-Path $wizard) {
        Write-Log "Using existing install at $InstallDir"
        return
    }

    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    $git = Get-Command git -ErrorAction SilentlyContinue
    $repoUrl = if ($env:REALTOR_REPO_URL) { $env:REALTOR_REPO_URL } else { 'https://github.com/nativestrider/realtor-os.git' }

    if ($git) {
        Write-Log "Cloning $repoUrl → $InstallDir"
        if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
        & git clone --depth 1 --branch $Branch $repoUrl $InstallDir
        return
    }

    Write-Log 'Downloading source from GitHub (no Git required)…'
    $tmpZip = Join-Path $env:TEMP 'realtor-os-main.zip'
    $tmpExtract = Join-Path $env:TEMP 'realtor-os-extract'
    Invoke-WebRequest -Uri $RepoZip -OutFile $tmpZip -UseBasicParsing
    if (Test-Path $tmpExtract) { Remove-Item -Recurse -Force $tmpExtract }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
    $extracted = Join-Path $tmpExtract 'realtor-os-main'
    if (-not (Test-Path $extracted)) { throw 'Unexpected archive layout' }
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    Move-Item $extracted $InstallDir
    Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue
}

function Install-Dependencies {
    Set-Location $InstallDir
    $env:REALTOR_DATA_DIR = $DataDir
    $env:REALTOR_REPO_ROOT = $InstallDir
    $env:npm_config_store_dir = Join-Path $DataDir 'pnpm-store'

    Write-Log 'Enabling pnpm…'
    & corepack enable 2>$null
    & corepack prepare pnpm@10.28.0 --activate

    Write-Log 'Installing packages (pnpm install)…'
    & pnpm install
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }

    Write-Log 'Installing Playwright Chromium for Zillow…'
    & pnpm run setup:browsers
    if ($LASTEXITCODE -ne 0) { Write-Warn 'Browser install failed — retry later: pnpm run setup:browsers' }
}

function Write-Launcher {
    $launcherDir = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'
    if (-not (Test-Path $launcherDir)) {
        $launcherDir = Join-Path $env:USERPROFILE '.local\bin'
    }
    New-Item -ItemType Directory -Force -Path $launcherDir | Out-Null
    $cmdPath = Join-Path $launcherDir 'realtor-os.cmd'
    @"
@echo off
set REALTOR_DATA_DIR=$DataDir
set REALTOR_REPO_ROOT=$InstallDir
cd /d "$InstallDir"
node packages\cli\bin\realtor.mjs web %*
"@ | Set-Content -Path $cmdPath -Encoding ASCII
    Write-Log "Shortcut: $cmdPath"
    $script:LauncherCmdPath = $cmdPath
}

function Write-DesktopShortcut {
    if (-not $script:LauncherCmdPath) { return }
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not (Test-Path $desktop)) { return }
    $dest = Join-Path $desktop 'RealtorOS.cmd'
    Copy-Item -Path $script:LauncherCmdPath -Destination $dest -Force
    Write-Log "Desktop shortcut: $dest"
}

function Try-GitBashWizard {
    $bash = @(
        "${env:ProgramFiles}\Git\bin\bash.exe",
        "${env:ProgramFiles(x86)}\Git\bin\bash.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $bash) { return $false }

    Write-Log 'Git Bash found — opening full setup wizard (AI sign-in, models)…'
    $env:REALTOR_INSTALL_DIR = $InstallDir
    $env:REALTOR_DATA_DIR = $DataDir
    $env:REALTOR_ISOLATED = '1'
    & $bash -lc "cd '$($InstallDir -replace '\\','/')' && bash scripts/launch-wizard.sh"
    return $true
}

function Print-NextSteps {
    Write-Host ''
    Write-Log 'Install complete (Windows, user-local).'
    Write-Host "  App:  $InstallDir"
    Write-Host "  Data: $DataDir"
    Write-Host ''
    Write-Host 'Start the app:'
    Write-Host '  realtor-os'
    Write-Host '  — or —'
    Write-Host "  cd `"$InstallDir`""
    Write-Host '  pnpm dev'
    Write-Host ''
    Write-Host 'Install & sign in to at least one AI CLI:'
    Write-Host '  Claude  https://docs.anthropic.com/en/docs/claude-code/overview'
    Write-Host '  Codex   https://developers.openai.com/codex/cli/'
    Write-Host '  Kimi    https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html'
    Write-Host ''
    Write-Host 'Codex (ChatGPT): use model GPT-5.4 in the app.'
}

# ── Main ────────────────────────────────────────────────────────────────────
Write-Log 'RealtorOS Windows installer (isolated, no admin)'
Write-Log "App folder:  $InstallDir"
Write-Log "Data folder: $DataDir"

Ensure-Node
Ensure-Source

@(
    "REALTOR_INSTALL_DIR=$InstallDir",
    "REALTOR_DATA_DIR=$DataDir",
    'REALTOR_ISOLATED=1'
) | Set-Content -Path (Join-Path $DataDir 'install.env') -Encoding UTF8

Install-Dependencies
Write-Launcher
Write-DesktopShortcut

if (-not (Try-GitBashWizard)) {
    Print-NextSteps
    $start = Read-Host 'Start RealtorOS now? [Y/n]'
    if ($start -ne 'n' -and $start -ne 'N') {
        Set-Location $InstallDir
        & node packages\cli\bin\realtor.mjs web
    }
}
