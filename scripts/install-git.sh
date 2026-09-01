#!/usr/bin/env bash
# Install Git for RealtorOS (used by launch-wizard.sh).
# In isolated mode (default) we do not run apt/brew/sudo — use tarball install instead.
set -euo pipefail

log() { printf '[realtor-os] %s\n' "$1"; }
warn() { printf '[realtor-os] warning: %s\n' "$1" >&2; }

main() {
  if [[ "${REALTOR_ISOLATED:-1}" == "1" ]]; then
    warn "Isolated install skips system Git (no sudo)."
    warn "Updates: re-run curl …/scripts/install.sh | bash"
    exit 1
  fi

  if command -v git >/dev/null 2>&1; then
    log "Git already installed ($(git --version))"
    exit 0
  fi

  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        log "Installing Git with Homebrew…"
        brew install git
      else
        if ! xcode-select -p >/dev/null 2>&1; then
          log "Opening Xcode Command Line Tools (includes Git)…"
          xcode-select --install || true
          warn "Finish the installer dialog, then run the wizard again."
          exit 2
        fi
        warn "Xcode tools are present but git is missing — install Git from https://git-scm.com/download/mac"
        exit 1
      fi
      ;;
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        if ! command -v sudo >/dev/null 2>&1; then
          warn "sudo is required to install Git with apt"
          exit 1
        fi
        log "Installing Git with apt (may ask for your password)…"
        sudo apt-get update -qq
        sudo apt-get install -y git
      elif command -v dnf >/dev/null 2>&1; then
        log "Installing Git with dnf (may ask for your password)…"
        sudo dnf install -y git
      elif command -v pacman >/dev/null 2>&1; then
        log "Installing Git with pacman (may ask for your password)…"
        sudo pacman -Sy --noconfirm git
      else
        warn "Unknown Linux package manager — install Git from https://git-scm.com/downloads"
        exit 1
      fi
      ;;
    *)
      warn "Automatic Git install not supported on this OS — see https://git-scm.com/downloads"
      exit 1
      ;;
  esac

  if command -v git >/dev/null 2>&1; then
    log "Git ready ($(git --version))"
    exit 0
  fi

  warn "Git install did not complete"
  exit 1
}

main "$@"
