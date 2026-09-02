#!/usr/bin/env bash
#
# One-command RealtorOS install: fetch source + run launch wizard.
#
#   curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash
#
# Install to a specific folder (curl pipe cannot read your keyboard):
#   REALTOR_INSTALL_DIR="$HOME/Developer/realtor-os" curl -fsSL .../install.sh | bash
#
# Or download first — opens the folder picker and other prompts:
#   curl -fsSL .../install.sh -o /tmp/realtor-install.sh && bash /tmp/realtor-install.sh
#   bash scripts/install.sh
#
set -euo pipefail

REALTOR_DATA_DIR="${REALTOR_DATA_DIR:-${HOME}/.realtor-os}"
REPO_URL="${REALTOR_REPO_URL:-https://github.com/nativestrider/realtor-os.git}"
INSTALL_DIR="${REALTOR_INSTALL_DIR:-${HOME}/RealtorOS}"
BRANCH="${REALTOR_BRANCH:-main}"
# Isolated install: no sudo, no Homebrew Node — everything under ~/.local and ~/.realtor-os
export REALTOR_ISOLATED="${REALTOR_ISOLATED:-1}"

log() { printf '[realtor-os] %s\n' "$1"; }
warn() { printf '[realtor-os] warning: %s\n' "$1" >&2; }

install_pause() {
  printf '  %s ' "${1:-Press Enter to continue}"
  if [[ -t 0 ]]; then
    read -r _ || true
  elif [[ -r /dev/tty ]]; then
    read -r _ </dev/tty || true
  fi
}

install_confirm() {
  local reply=""
  printf '  %s [y/N] ' "$1"
  if [[ -t 0 ]]; then
    read -r reply || true
  elif [[ -r /dev/tty ]]; then
    read -r reply </dev/tty || true
  fi
  [[ "$reply" =~ ^[Yy] ]]
}

current_dir_is_offerable() {
  local cwd="$PWD"
  [[ -n "$cwd" ]] || return 1
  [[ "$cwd" == "/" ]] && return 1
  [[ "$cwd" == "$HOME" ]] && return 1
  [[ -w "$cwd" ]] || return 1
  [[ -f "$cwd/scripts/launch-wizard.sh" ]] && return 1
  return 0
}

install_dir_is_empty() {
  [[ ! -d "$1" ]] && return 0
  [[ -z "$(ls -A "$1" 2>/dev/null)" ]]
}

install_welcome() {
  printf '\n'
  log "════════════════════════════════════════════════════════"
  log "  RealtorOS — Installation"
  log "════════════════════════════════════════════════════════"
  printf '\n'
  log "Welcome! We will install RealtorOS on your Mac step by step."
  log "You do not need programming knowledge — just read each screen"
  log "and press Enter when you are ready. Nothing happens until then."
  printf '\n'
  log "Here is the full plan:"
  log "  1. Choose where to put the app (this folder or pick another)"
  log "  2. Download the app files (about 1–2 minutes)"
  log "  3. Setup wizard (~5 minutes):"
  log "       • Node.js (installed for you if missing)"
  log "       • App dependencies"
  log "       • Browser for Zillow imports (~200 MB)"
  log "       • Your AI assistants (Claude, ChatGPT, Kimi)"
  log "       • Optional Desktop icon"
  log "       • Open RealtorOS in your web browser"
  printf '\n'
  log "Two folders — this is normal:"
  log "  App:   ~/RealtorOS (or the folder you choose)"
  log "  Data:  ~/.realtor-os (listings, photos, settings)"
  printf '\n'
  log "We never ask for your Mac password and never change system Node."
  printf '\n'
  install_pause "Press Enter when you have read this and are ready to start"
}

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
  if ! install_dir_is_empty "$INSTALL_DIR"; then
    warn "Install folder is not empty: ${INSTALL_DIR}"
    exit 1
  fi
  mkdir -p "$INSTALL_DIR"
  cp -a "${archive_root}/." "$INSTALL_DIR/"
  rm -rf "$tmp"
}

clone_into_install_dir() {
  if install_dir_is_empty "$INSTALL_DIR"; then
    if [[ -d "$INSTALL_DIR" ]]; then
      (cd "$INSTALL_DIR" && git clone --depth 1 --branch "$BRANCH" "$REPO_URL" .)
    else
      mkdir -p "$(dirname "$INSTALL_DIR")"
      git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    fi
  else
    warn "Install folder is not empty: ${INSTALL_DIR}"
    warn "Choose an empty folder or delete its contents first."
    exit 1
  fi
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

  if command -v git >/dev/null 2>&1; then
    log "Cloning ${REPO_URL} → ${INSTALL_DIR}"
    clone_into_install_dir
  elif [[ "${REALTOR_ISOLATED:-1}" == "1" ]]; then
    fetch_without_git
  else
    if ensure_git 2>/dev/null; then
      log "Cloning ${REPO_URL} → ${INSTALL_DIR}"
      clone_into_install_dir
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

resolve_picker_script() {
  local script_dir="" picker="" tmp_picker=""
  if script_dir="$(resolve_script_dir 2>/dev/null)"; then
    picker="${script_dir}/pick-install-folder.sh"
    if [[ -f "$picker" ]]; then
      printf '%s' "$picker"
      return 0
    fi
  fi
  tmp_picker="$(mktemp)"
  if curl -fsSL "https://raw.githubusercontent.com/nativestrider/realtor-os/${BRANCH}/scripts/pick-install-folder.sh" -o "$tmp_picker" 2>/dev/null; then
    chmod +x "$tmp_picker"
    printf '%s' "$tmp_picker"
    return 0
  fi
  rm -f "$tmp_picker"
  return 1
}

choose_other_folder() {
  local default="$1" picker="$2" picked="" reply=""
  log "NEXT: A Finder window will open."
  log "Pick where the RealtorOS folder should live (Home or Documents is fine)."
  log "Your listings always go in ~/.realtor-os — separate from the app."
  install_pause "Press Enter to open Finder"
  if [[ -n "$picker" ]]; then
    if [[ -t 0 ]]; then
      picked="$(bash "$picker" "$default")"
    else
      picked="$(bash "$picker" --gui-only "$default" 2>/dev/null || true)"
    fi
    if [[ -n "$picked" ]]; then
      printf '%s' "$picked"
      return 0
    fi
  fi
  printf '  Install folder [%s]: ' "$default"
  if [[ -t 0 ]]; then
    read -r reply || true
  elif [[ -r /dev/tty ]]; then
    read -r reply </dev/tty || true
  fi
  if [[ -z "$reply" ]]; then
    printf '%s' "$default"
  else
    printf '%s' "${reply/#\~/$HOME}"
  fi
}

pick_install_dir() {
  if [[ -n "${REALTOR_INSTALL_DIR:-}" ]]; then
    INSTALL_DIR="$REALTOR_INSTALL_DIR"
    log "Install folder (REALTOR_INSTALL_DIR): ${INSTALL_DIR}"
    return
  fi

  local default="${HOME}/RealtorOS"
  local picker=""

  if picker="$(resolve_picker_script 2>/dev/null || true)" && [[ -n "$picker" ]] && [[ -f "$picker" ]]; then
    :
  else
    picker=""
  fi

  printf '\n'
  log "STEP 1 of 3 — Choose install folder"

  if current_dir_is_offerable; then
    log "Your Terminal is open in:"
    log "  ${PWD}"
    log "Install RealtorOS in this folder, or choose a different one."
    install_pause "Press Enter to continue"
    if install_confirm "Install RealtorOS in this folder (${PWD})?"; then
      INSTALL_DIR="$PWD"
      log "Will install to: ${INSTALL_DIR}"
      export REALTOR_INSTALL_DIR="$INSTALL_DIR"
      return
    fi
    log "OK — let's pick another folder."
  else
    log "Choose where the RealtorOS app folder should live on your Mac."
  fi

  INSTALL_DIR="$(choose_other_folder "$default" "$picker")"

  log "Will install to: ${INSTALL_DIR}"
  export REALTOR_INSTALL_DIR="$INSTALL_DIR"
}

main() {
  install_welcome
  log "RealtorOS installer (isolated user environment)"
  log "Data folder:    ${REALTOR_DATA_DIR:-${HOME}/.realtor-os}"
  log "Does not use sudo or change system Node/npm by default."

  if script_dir="$(resolve_script_dir)"; then
    repo_root="$(cd "${script_dir}/.." && pwd)"
    if [[ -f "${repo_root}/scripts/launch-wizard.sh" ]]; then
      log "Running wizard from current checkout: ${repo_root}"
      cd "$repo_root"
      exec bash scripts/launch-wizard.sh
    fi
    REALTOR_INSTALL_SCRIPT_DIR="$script_dir"
  fi

  pick_install_dir
  log "App folder:     ${INSTALL_DIR}"

  printf '\n'
  log "STEP 2 of 3 — Download the app"
  log "NEXT: We download RealtorOS into:"
  log "  ${INSTALL_DIR}"
  log "This usually takes 1–2 minutes. You will see download progress below."
  install_pause "Press Enter to start the download"

  clone_or_update

  if [[ ! -f "${INSTALL_DIR}/scripts/launch-wizard.sh" ]]; then
    warn "launch-wizard.sh not found in ${INSTALL_DIR}"
    exit 1
  fi

  printf '\n'
  log "STEP 3 of 3 — Setup wizard"
  log "NEXT: A guided setup runs in this Terminal window."
  log "Each step is explained before anything happens on your Mac."
  install_pause "Press Enter to start the setup wizard"
  log "Starting setup wizard…"
  cd "$INSTALL_DIR"
  mkdir -p "$REALTOR_DATA_DIR"
  printf 'REALTOR_INSTALL_DIR=%s\nREALTOR_DATA_DIR=%s\nREALTOR_ISOLATED=%s\n' \
    "$INSTALL_DIR" "$REALTOR_DATA_DIR" "$REALTOR_ISOLATED" >"${REALTOR_DATA_DIR}/install.env"
  export REALTOR_INSTALL_DIR="$INSTALL_DIR"
  export REALTOR_REPO_ROOT="$INSTALL_DIR"
  exec bash scripts/launch-wizard.sh
}

main "$@"
