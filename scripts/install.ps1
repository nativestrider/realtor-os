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
$DefaultInstallDir = Join-Path $env:USERPROFILE 'RealtorOS'

function Resolve-InstallChannel {
    if ($env:REALTOR_GIT_REF) {
        return @{
            Channel = if ($env:REALTOR_CHANNEL) { $env:REALTOR_CHANNEL.ToLower() } else { 'custom' }
            GitRef  = $env:REALTOR_GIT_REF
            Version = if ($env:REALTOR_VERSION) { $env:REALTOR_VERSION } else { $env:REALTOR_GIT_REF }
            Frozen  = $true
        }
    }
    $channel = if ($env:REALTOR_CHANNEL) { $env:REALTOR_CHANNEL.ToLower() } elseif ($env:REALTOR_BRANCH) { 'dev' } else { 'stable' }
    switch ($channel) {
        'beta' {
            return @{ Channel = 'beta'; GitRef = 'beta'; Version = 'beta'; Frozen = $true }
        }
        { $_ -in 'dev', 'main', 'edge' } {
            return @{ Channel = 'dev'; GitRef = if ($env:REALTOR_BRANCH) { $env:REALTOR_BRANCH } else { 'main' }; Version = 'dev'; Frozen = $false }
        }
        default {
            return @{ Channel = 'stable'; GitRef = 'v0.1.0'; Version = '0.1.0'; Frozen = $true }
        }
    }
}

$ChannelInfo = Resolve-InstallChannel
$GitRef = $ChannelInfo.GitRef
$RealtorVersion = $ChannelInfo.Version
$FrozenLockfile = $ChannelInfo.Frozen

function Write-Log([string]$Message) { Write-Host "[realtor-os] $Message" }
function Write-Warn([string]$Message) { Write-Warning "[realtor-os] $Message" }

function Resolve-InstallDirFromPick {
    param([string]$Picked, [string]$DefaultName = 'RealtorOS')
    $leaf = Split-Path -Leaf $Picked
    if ($leaf -eq 'RealtorOS' -or $leaf -eq 'realtor-os') { return $Picked }
    return Join-Path $Picked $DefaultName
}

function Pick-InstallDir {
    if ($env:REALTOR_INSTALL_DIR) { return $env:REALTOR_INSTALL_DIR }

    $default = $DefaultInstallDir
    if ([Environment]::UserInteractive) {
        try {
            Add-Type -AssemblyName System.Windows.Forms | Out-Null
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = 'Choose where to install RealtorOS. A RealtorOS folder will be created here unless you select that folder directly.'
            $dialog.SelectedPath = Split-Path -Parent $default
            $dialog.ShowNewFolderButton = $true
            if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                return Resolve-InstallDirFromPick -Picked $dialog.SelectedPath
            }
        } catch {
            Write-Warn "Folder picker unavailable — using default install path."
        }
    }

    Write-Host ''
    Write-Host "Install folder [$default]"
    Write-Host 'Press Enter to browse folders, or type a path:'
    $reply = Read-Host
    if ([string]::IsNullOrWhiteSpace($reply)) {
        try {
            Add-Type -AssemblyName System.Windows.Forms | Out-Null
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = 'Choose where to install RealtorOS.'
            $dialog.SelectedPath = Split-Path -Parent $default
            $dialog.ShowNewFolderButton = $true
            if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                return Resolve-InstallDirFromPick -Picked $dialog.SelectedPath
            }
        } catch { }
        return $default
    }
    if ($reply -match '^[bB]$') {
        try {
            Add-Type -AssemblyName System.Windows.Forms | Out-Null
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = 'Choose where to install RealtorOS.'
            $dialog.SelectedPath = Split-Path -Parent $default
            $dialog.ShowNewFolderButton = $true
            if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                return Resolve-InstallDirFromPick -Picked $dialog.SelectedPath
            }
        } catch { }
        return $default
    }
    return $reply
}

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

function Get-SourceArchiveUrl([string]$Ref) {
    if ($Ref.StartsWith('v')) {
        return "https://github.com/nativestrider/realtor-os/archive/refs/tags/$Ref.zip"
    }
    return "https://github.com/nativestrider/realtor-os/archive/refs/heads/$Ref.zip"
}

function Get-ExtractedFolderName([string]$Ref) {
    if ($Ref.StartsWith('v')) { return "realtor-os-$($Ref.Substring(1))" }
    return "realtor-os-$Ref"
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
        Write-Log "Cloning $repoUrl ($GitRef) → $InstallDir"
        if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
        & git clone --depth 1 --branch $GitRef $repoUrl $InstallDir
        return
    }

    Write-Log "Downloading source from GitHub ($($ChannelInfo.Channel) / $GitRef)…"
    $repoZip = Get-SourceArchiveUrl $GitRef
    $tmpZip = Join-Path $env:TEMP "realtor-os-$GitRef.zip"
    $tmpExtract = Join-Path $env:TEMP 'realtor-os-extract'
    Invoke-WebRequest -Uri $repoZip -OutFile $tmpZip -UseBasicParsing
    if (Test-Path $tmpExtract) { Remove-Item -Recurse -Force $tmpExtract }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force
    $extracted = Join-Path $tmpExtract (Get-ExtractedFolderName $GitRef)
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

    if ($FrozenLockfile) {
        Write-Log 'Installing packages (pnpm install --frozen-lockfile)…'
        & pnpm install --frozen-lockfile
    } else {
        Write-Log 'Installing packages (dev channel — pnpm install)…'
        & pnpm install
    }
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }

    Write-Log 'Installing Playwright Chromium (built-in browser for agents)…'
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
    $env:REALTOR_CHANNEL = $ChannelInfo.Channel
    $env:REALTOR_FROZEN_LOCKFILE = [string][int]$FrozenLockfile
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
    Write-Host 'The bash wizard installs the CLIs you pick. Without Git Bash, run:'
    Write-Host '  Claude  irm https://claude.ai/install.ps1 | iex'
    Write-Host '  Codex   irm https://chatgpt.com/codex/install.ps1 | iex'
    Write-Host '  Kimi    irm https://code.kimi.com/kimi-code/install.ps1 | iex'
    Write-Host '  Grok    irm https://x.ai/cli/install.ps1 | iex'
    Write-Host ''
    Write-Host 'Codex (ChatGPT): use model GPT-5.4 in the app.'
    Write-Host 'Grok Build: use model Grok 4.6 in the app.'
}

# ── Main ────────────────────────────────────────────────────────────────────
Write-Log 'RealtorOS Windows installer (isolated, no admin)'
Write-Log "Data folder: $DataDir"
Write-Host ''
Write-Host 'Choose where to install the RealtorOS app folder.'
Write-Host 'Your listings and settings always go in .realtor-os (separate).'
Write-Log "Channel: $($ChannelInfo.Channel) ($GitRef)"
$InstallDir = Pick-InstallDir
Write-Log "Will install to: $InstallDir"

Ensure-Node
Ensure-Source

@(
    "REALTOR_INSTALL_DIR=$InstallDir",
    "REALTOR_DATA_DIR=$DataDir",
    'REALTOR_ISOLATED=1',
    "REALTOR_CHANNEL=$($ChannelInfo.Channel)",
    "REALTOR_VERSION=$RealtorVersion",
    "REALTOR_GIT_REF=$GitRef",
    "REALTOR_FROZEN_LOCKFILE=$([int]$FrozenLockfile)"
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
