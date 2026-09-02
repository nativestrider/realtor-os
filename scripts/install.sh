#!/usr/bin/env bash
#
# One-command RealtorOS install: fetch source + run launch wizard.
#
#   curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash
#
# Channels (default: stable). With curl|bash put REALTOR_CHANNEL on the bash side:
#   curl -fsSL .../install.sh | REALTOR_CHANNEL=dev bash
# Or: export REALTOR_CHANNEL=dev  then  curl ... | bash
#   REALTOR_INSTALL_DIR="$HOME/Developer/realtor-os" curl -fsSL .../install.sh | bash
#
# Or download first — opens the folder picker and other prompts:
#   curl -fsSL .../install.sh -o /tmp/realtor-install.sh && bash /tmp/realtor-install.sh
#   bash scripts/install.sh
#
set -euo pipefail

SCRIPT_LIB=""
RESOLVE_CHANNEL_LOADED=0

load_resolve_channel() {
  [[ "$RESOLVE_CHANNEL_LOADED" == 1 ]] && return 0
  local script_dir="" tmp=""
  if script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"; then
    if [[ -f "${script_dir}/lib/resolve-channel.sh" ]]; then
      # shellcheck source=scripts/lib/resolve-channel.sh
      source "${script_dir}/lib/resolve-channel.sh"
      RESOLVE_CHANNEL_LOADED=1
      return 0
    fi
  fi
  tmp="$(mktemp)"
  if curl -fsSL "https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/lib/resolve-channel.sh" -o "$tmp" 2>/dev/null; then
    # shellcheck source=/dev/null
    source "$tmp"
    RESOLVE_CHANNEL_LOADED=1
  fi
  rm -f "$tmp"
  if [[ "$RESOLVE_CHANNEL_LOADED" != 1 ]]; then
    warn "Could not load channel resolver — using stable defaults."
    realtor_channel_label() { printf 'Stable'; }
    realtor_load_channel_config() { true; }
    realtor_resolve_channel() {
      export REALTOR_CHANNEL="${REALTOR_CHANNEL:-stable}"
      export REALTOR_GIT_REF="${REALTOR_GIT_REF:-${REALTOR_BRANCH:-v0.1.0}}"
      export REALTOR_VERSION="${REALTOR_VERSION:-0.1.0}"
      export REALTOR_FROZEN_LOCKFILE=1
    }
    realtor_source_archive_url() {
      if [[ "$1" == v* ]]; then
        printf 'https://github.com/nativestrider/realtor-os/archive/refs/tags/%s.tar.gz' "$1"
      else
        printf 'https://github.com/nativestrider/realtor-os/archive/refs/heads/%s.tar.gz' "$1"
      fi
    }
    realtor_resolve_archive_root() {
      local tmp="$1" ref="$2" stripped="${2#v}" candidate
      for candidate in "${tmp}/realtor-os-${ref}" "${tmp}/realtor-os-${stripped}" "${tmp}/realtor-os-main"; do
        if [[ -d "$candidate" ]]; then
          printf '%s' "$candidate"
          return 0
        fi
      done
      return 1
    }
    RESOLVE_CHANNEL_LOADED=1
  fi
}

load_resolve_channel

REALTOR_DATA_DIR="${REALTOR_DATA_DIR:-${HOME}/.realtor-os}"
REPO_URL="${REALTOR_REPO_URL:-https://github.com/nativestrider/realtor-os.git}"
INSTALL_DIR="${REALTOR_INSTALL_DIR:-${HOME}/RealtorOS}"
INSTALL_SCRIPT_DIR=""
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

show_realtor_logo() {
  local root="${1:-${REALTOR_REPO_ROOT:-}}"
  local logo_sh=""
  if [[ -n "$root" && -f "${root}/scripts/realtor-logo.sh" ]]; then
    logo_sh="${root}/scripts/realtor-logo.sh"
  elif [[ -n "${INSTALL_SCRIPT_DIR:-}" && -f "${INSTALL_SCRIPT_DIR}/realtor-logo.sh" ]]; then
    logo_sh="${INSTALL_SCRIPT_DIR}/realtor-logo.sh"
    root="$(cd "${INSTALL_SCRIPT_DIR}/.." && pwd)"
  else
    return 1
  fi
  export REALTOR_REPO_ROOT="$root"
  # shellcheck source=/dev/null
  source "$logo_sh"
  realtor_show_logo "" "" "" ""
  return 0
}

install_welcome() {
  printf '\n'
  if ! show_realtor_logo ""; then
    log "════════════════════════════════════════════════════════"
    log "  RealtorOS — Installation"
    log "════════════════════════════════════════════════════════"
    printf '\n'
  fi
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
  log "       • Built-in browser for listing sites (~200 MB)"
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
  log "Install channel: $(realtor_channel_label)"
  log "Version:         ${REALTOR_VERSION} (${REALTOR_GIT_REF})"
  if [[ ! -t 0 ]] && [[ "${REALTOR_CHANNEL}" == "stable" ]]; then
    log "Want dev instead? Cancel (Ctrl-C) and run:"
    log "  curl -fsSL .../install.sh | REALTOR_CHANNEL=dev bash"
  fi
  if [[ "${REALTOR_CHANNEL}" == "dev" ]]; then
    log "Dev channel — latest code from main; for developers and testers."
  fi
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
    curl -fsSL "https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install-git.sh" -o "${tmp}/install-git.sh"
    chmod +x "${tmp}/install-git.sh"
    bash "${tmp}/install-git.sh"
    return $?
  fi
  bash "${script_dir}/install-git.sh"
}

fetch_without_git() {
  log "Git not found — downloading source archive from GitHub…"
  local tmp archive_root url
  tmp="$(mktemp -d)"
  url="$(realtor_source_archive_url "$REALTOR_GIT_REF")"
  curl -fsSL "$url" -o "${tmp}/repo.tar.gz"
  tar xzf "${tmp}/repo.tar.gz" -C "${tmp}"
  if ! archive_root="$(realtor_resolve_archive_root "$tmp" "$REALTOR_GIT_REF")"; then
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
      (cd "$INSTALL_DIR" && git clone --depth 1 --branch "$REALTOR_GIT_REF" "$REPO_URL" .)
    else
      mkdir -p "$(dirname "$INSTALL_DIR")"
      git clone --depth 1 --branch "$REALTOR_GIT_REF" "$REPO_URL" "$INSTALL_DIR"
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
      git -C "$INSTALL_DIR" fetch origin "$REALTOR_GIT_REF" 2>/dev/null || true
      git -C "$INSTALL_DIR" checkout "$REALTOR_GIT_REF" 2>/dev/null || true
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
  if curl -fsSL "https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/pick-install-folder.sh" -o "$tmp_picker" 2>/dev/null; then
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

write_install_env() {
  mkdir -p "$REALTOR_DATA_DIR"
  printf 'REALTOR_INSTALL_DIR=%s\nREALTOR_DATA_DIR=%s\nREALTOR_ISOLATED=%s\nREALTOR_CHANNEL=%s\nREALTOR_VERSION=%s\nREALTOR_GIT_REF=%s\nREALTOR_FROZEN_LOCKFILE=%s\n' \
    "$INSTALL_DIR" "$REALTOR_DATA_DIR" "$REALTOR_ISOLATED" \
    "$REALTOR_CHANNEL" "$REALTOR_VERSION" "$REALTOR_GIT_REF" "$REALTOR_FROZEN_LOCKFILE" \
    >"${REALTOR_DATA_DIR}/install.env"
}

main() {
  if script_dir="$(resolve_script_dir 2>/dev/null || true)"; then
    INSTALL_SCRIPT_DIR="$script_dir"
    realtor_load_channel_config "$script_dir"
    if [[ -f "${script_dir}/launch-wizard.sh" ]]; then
      export REALTOR_CHANNEL=dev
    fi
  else
    realtor_load_channel_config ""
  fi
  realtor_resolve_channel

  install_welcome
  log "RealtorOS installer (isolated user environment)"
  log "Data folder:    ${REALTOR_DATA_DIR:-${HOME}/.realtor-os}"
  log "Does not use sudo or change system Node/npm by default."

  if [[ -n "$INSTALL_SCRIPT_DIR" ]]; then
    repo_root="$(cd "${INSTALL_SCRIPT_DIR}/.." && pwd)"
    if [[ -f "${repo_root}/scripts/launch-wizard.sh" ]]; then
      log "Dev checkout detected — running wizard from: ${repo_root}"
      cd "$repo_root"
      INSTALL_DIR="$repo_root"
      export REALTOR_INSTALL_DIR="$repo_root"
      export REALTOR_REPO_ROOT="$repo_root"
      write_install_env
      exec bash scripts/launch-wizard.sh
    fi
    REALTOR_INSTALL_SCRIPT_DIR="$INSTALL_SCRIPT_DIR"
  fi

  pick_install_dir
  log "App folder:     ${INSTALL_DIR}"

  printf '\n'
  log "STEP 2 of 3 — Download the app"
  log "Channel: ${REALTOR_CHANNEL} — fetching ${REALTOR_GIT_REF}"
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
  show_realtor_logo "$INSTALL_DIR" || true
  log "NEXT: A guided setup runs in this Terminal window."
  log "Each step is explained before anything happens on your Mac."
  install_pause "Press Enter to start the setup wizard"
  log "Starting setup wizard…"
  cd "$INSTALL_DIR"
  write_install_env
  export REALTOR_INSTALL_DIR="$INSTALL_DIR"
  export REALTOR_REPO_ROOT="$INSTALL_DIR"
  exec bash scripts/launch-wizard.sh
}

main "$@"
