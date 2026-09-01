#!/usr/bin/env bash
#
# One-command RealtorOS install: fetch source + run launch wizard.
#
#   curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash
#
# Or from an existing checkout:
#   bash scripts/install.sh
#
set -euo pipefail

REPO_URL="${REALTOR_REPO_URL:-https://github.com/nativestrider/realtor-os.git}"
INSTALL_DIR="${REALTOR_INSTALL_DIR:-${HOME}/RealtorOS}"
BRANCH="${REALTOR_BRANCH:-main}"

log() { printf '[realtor-os] %s\n' "$1"; }
warn() { printf '[realtor-os] warning: %s\n' "$1" >&2; }

ensure_git() {
  if command -v git >/dev/null 2>&1; then
    return 0
  fi
  local script_dir=""
  if [[ -n "${REALTOR_INSTALL_SCRIPT_DIR:-}" ]] && [[ -f "${REALTOR_INSTALL_SCRIPT_DIR}/install-git.sh" ]]; then
    script_dir="$REALTOR_INSTALL_SCRIPT_DIR"
  else
    local tmp
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' RETURN
    curl -fsSL "https://raw.githubusercontent.com/nativestrider/realtor-os/${BRANCH}/scripts/install-git.sh" -o "${tmp}/install-git.sh"
    chmod +x "${tmp}/install-git.sh"
    bash "${tmp}/install-git.sh"
    return $?
  fi
  bash "${script_dir}/install-git.sh"
}

fetch_without_git() {
  log "Git not found — downloading source archive from GitHub…"
  local tmp archive_root
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/nativestrider/realtor-os/archive/refs/heads/${BRANCH}.tar.gz" -o "${tmp}/repo.tar.gz"
  tar xzf "${tmp}/repo.tar.gz" -C "${tmp}"
  archive_root="${tmp}/realtor-os-${BRANCH}"
  if [[ ! -d "$archive_root" ]]; then
    warn "Unexpected archive layout"
    exit 1
  fi
  rm -rf "$INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  mv "$archive_root" "$INSTALL_DIR"
  rm -rf "$tmp"
}

clone_or_update() {
  if [[ -f "${INSTALL_DIR}/scripts/launch-wizard.sh" ]]; then
    log "Using existing install at ${INSTALL_DIR}"
    if [[ -d "${INSTALL_DIR}/.git" ]] && command -v git >/dev/null 2>&1; then
      git -C "$INSTALL_DIR" fetch origin "$BRANCH" 2>/dev/null || true
      git -C "$INSTALL_DIR" checkout "$BRANCH" 2>/dev/null || true
      git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || true
    fi
    return 0
  fi

  mkdir -p "$(dirname "$INSTALL_DIR")"

  if command -v git >/dev/null 2>&1; then
    log "Cloning ${REPO_URL} → ${INSTALL_DIR}"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  else
    if ensure_git 2>/dev/null; then
      git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    else
      fetch_without_git
    fi
  fi
}

resolve_script_dir() {
  local src="${BASH_SOURCE[0]:-$0}"
  if [[ -f "$src" ]] && [[ "$src" != /* ]] && [[ "$src" != "-" ]] && [[ "$src" != /dev/fd/* ]]; then
    (cd "$(dirname "$src")" && pwd)
    return 0
  fi
  if [[ -f "$src" ]] && [[ "$src" == /* ]] && [[ "$src" != /dev/fd/* ]] && [[ "$src" != "-" ]]; then
    (cd "$(dirname "$src")" && pwd)
    return 0
  fi
  return 1
}

main() {
  log "RealtorOS installer"
  log "Install folder: ${INSTALL_DIR}"

  if script_dir="$(resolve_script_dir)"; then
    repo_root="$(cd "${script_dir}/.." && pwd)"
    if [[ -f "${repo_root}/scripts/launch-wizard.sh" ]]; then
      log "Running wizard from current checkout: ${repo_root}"
      cd "$repo_root"
      exec bash scripts/launch-wizard.sh
    fi
    REALTOR_INSTALL_SCRIPT_DIR="$script_dir"
  fi

  clone_or_update

  if [[ ! -f "${INSTALL_DIR}/scripts/launch-wizard.sh" ]]; then
    warn "launch-wizard.sh not found in ${INSTALL_DIR}"
    exit 1
  fi

  log "Starting setup wizard…"
  cd "$INSTALL_DIR"
  exec bash scripts/launch-wizard.sh
}

main "$@"
