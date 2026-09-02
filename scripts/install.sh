#!/usr/bin/env bash
#
# One-command RealtorOS install: fetch source + run launch wizard.
#
#   curl -fsSL https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/install.sh | bash
# If that shows an old logo, GitHub's raw CDN is stale — use jsDelivr:
#   curl -fsSL https://cdn.jsdelivr.net/gh/nativestrider/realtor-os@main/scripts/install.sh | bash
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

# Fallback until wizard-ui.sh is sourced.
warn() { printf '[realtor-os] warning: %s\n' "$1" >&2; }
log()  { printf '[realtor-os] %s\n' "$1" >&2; }

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

# raw.githubusercontent.com/main is often stale. Pin to HEAD sha, then jsDelivr.
realtor_github_main_sha() {
  curl -fsSL -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/nativestrider/realtor-os/commits/main" 2>/dev/null \
    | sed -n 's/^[[:space:]]*"sha": "\([0-9a-f]\{40\}\)".*/\1/p' | head -1
}

realtor_fetch_from_origin() {
  local dest="$1" rel="$2" sha="${3:-}"
  if [[ -n "$sha" ]] && curl -fsSL "https://raw.githubusercontent.com/nativestrider/realtor-os/${sha}/${rel}" -o "$dest" 2>/dev/null; then
    return 0
  fi
  curl -fsSL "https://cdn.jsdelivr.net/gh/nativestrider/realtor-os@main/${rel}" -o "$dest" 2>/dev/null
}

load_wizard_ui() {
  local script_dir="" tmp="" sha=""
  if script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"; then
    if [[ -f "${script_dir}/lib/wizard-ui.sh" ]]; then
      # shellcheck source=lib/wizard-ui.sh
      source "${script_dir}/lib/wizard-ui.sh"
      return 0
    fi
  fi
  tmp="$(mktemp)"
  sha="$(realtor_github_main_sha || true)"
  if realtor_fetch_from_origin "$tmp" "scripts/lib/wizard-ui.sh" "$sha"; then
    # shellcheck source=/dev/null
    source "$tmp"
    rm -f "$tmp"
    return 0
  fi
  rm -f "$tmp"
  return 1
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
    export REALTOR_REPO_ROOT="$root"
  elif [[ -n "${INSTALL_SCRIPT_DIR:-}" && -f "${INSTALL_SCRIPT_DIR}/realtor-logo.sh" ]]; then
    logo_sh="${INSTALL_SCRIPT_DIR}/realtor-logo.sh"
  else
    local cache="${REALTOR_DATA_DIR:-$HOME/.realtor-os}/install-cache"
    local sha=""
    mkdir -p "$cache"
    sha="$(realtor_github_main_sha || true)"
    realtor_fetch_from_origin "${cache}/realtor-logo.sh" "scripts/realtor-logo.sh" "$sha" || true
    realtor_fetch_from_origin "${cache}/realtor-logo.art" "scripts/realtor-logo.art" "$sha" || true
    if [[ -f "${cache}/realtor-logo.sh" ]]; then
      logo_sh="${cache}/realtor-logo.sh"
      INSTALL_SCRIPT_DIR="$cache"
    fi
  fi

  if [[ -z "$logo_sh" ]]; then
    return 1
  fi

  # shellcheck source=/dev/null
  source "$logo_sh"
  realtor_show_logo "" "" "" ""
  return 0
}

install_welcome() {
  _ui_clear
  show_realtor_logo "" || true
  printf '\n' >&2
  printf '  %s%sRealtor OS setup%s\n' "$BOLD" "$CYAN" "$RESET" >&2
  _ui_progress 0 "$TOTAL_STAGES"
  printf '  %s────────────────────────────────────────%s\n\n' "$DIM" "$RESET" >&2
  say "One setup — 10 steps. We explain each one before anything happens."
  say "No Mac password. System Node is left alone."
  printf '\n' >&2
  note "App:   folder you choose (often ~/RealtorOS)"
  note "Data:  ~/.realtor-os  (listings, photos, settings)"
  printf '\n' >&2
  log "Channel: $(realtor_channel_label) · ${REALTOR_VERSION} (${REALTOR_GIT_REF})"
  if [[ ! -t 0 ]] && [[ "${REALTOR_CHANNEL}" == "stable" ]]; then
    note "Dev instead: curl -fsSL .../install.sh | REALTOR_CHANNEL=dev bash"
  fi
  printf '\n' >&2
  pause "Press Enter to start"
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
  printf '  Install folder [%s]: ' "$default" >&2
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

# Keep a single absolute path even if logs leaked into a command substitution.
sanitize_install_dir() {
  local raw="$1" line last=""
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    if [[ "$line" == /* && "$line" != *'[realtor-os]'* ]]; then
      last="$line"
    fi
  done <<< "$raw"
  if [[ -n "$last" ]]; then
    printf '%s' "$last"
    return 0
  fi
  if [[ "$raw" == /* && "$raw" != *$'\n'* ]]; then
    printf '%s' "$raw"
    return 0
  fi
  return 1
}

pick_install_dir() {
  if [[ -n "${REALTOR_INSTALL_DIR:-}" ]]; then
    INSTALL_DIR="$REALTOR_INSTALL_DIR"
    log "Install folder (REALTOR_INSTALL_DIR): ${INSTALL_DIR}"
    return
  fi

  local default="${HOME}/RealtorOS"
  local picker="" picked=""

  if picker="$(resolve_picker_script 2>/dev/null || true)" && [[ -n "$picker" ]] && [[ -f "$picker" ]]; then
    :
  else
    picker=""
  fi

  ui_header "Install folder"

  if [[ -f "${PWD}/scripts/launch-wizard.sh" ]]; then
    INSTALL_DIR="$PWD"
    say "This folder already has Realtor OS."
    ok "$INSTALL_DIR"
    export REALTOR_INSTALL_DIR="$INSTALL_DIR"
    return
  fi

  if current_dir_is_offerable; then
    say "Terminal is open in:"
    ok "$PWD"
    say "Install here, or pick another folder."
    pause "Press Enter to continue"
    if confirm "Install Realtor OS in this folder"; then
      INSTALL_DIR="$PWD"
      ok "Will install to: ${INSTALL_DIR}"
      export REALTOR_INSTALL_DIR="$INSTALL_DIR"
      return
    fi
    note "OK — pick another folder."
  else
    say "Choose where the app folder should live on your Mac."
  fi

  picked="$(choose_other_folder "$default" "$picker")"
  if ! INSTALL_DIR="$(sanitize_install_dir "$picked")"; then
    warn "Could not read a valid install folder."
    exit 1
  fi

  ok "Will install to: ${INSTALL_DIR}"
  export REALTOR_INSTALL_DIR="$INSTALL_DIR"
}

write_install_env() {
  mkdir -p "$REALTOR_DATA_DIR"
  {
    printf 'REALTOR_INSTALL_DIR=%q\n' "$INSTALL_DIR"
    printf 'REALTOR_DATA_DIR=%q\n' "$REALTOR_DATA_DIR"
    printf 'REALTOR_ISOLATED=%q\n' "$REALTOR_ISOLATED"
    printf 'REALTOR_CHANNEL=%q\n' "$REALTOR_CHANNEL"
    printf 'REALTOR_VERSION=%q\n' "$REALTOR_VERSION"
    printf 'REALTOR_GIT_REF=%q\n' "$REALTOR_GIT_REF"
    printf 'REALTOR_FROZEN_LOCKFILE=%q\n' "$REALTOR_FROZEN_LOCKFILE"
  } >"${REALTOR_DATA_DIR}/install.env"
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

  export TOTAL_STAGES=10
  load_wizard_ui || true
  wizard_ui_init

  install_welcome

  if [[ -n "$INSTALL_SCRIPT_DIR" ]]; then
    repo_root="$(cd "${INSTALL_SCRIPT_DIR}/.." && pwd)"
    if [[ -f "${repo_root}/scripts/launch-wizard.sh" ]]; then
      cd "$repo_root"
      INSTALL_DIR="$repo_root"
      export REALTOR_INSTALL_DIR="$repo_root"
      export REALTOR_REPO_ROOT="$repo_root"
      write_install_env
      export REALTOR_WIZARD_FROM_INSTALL=0
      exec bash scripts/launch-wizard.sh
    fi
    REALTOR_INSTALL_SCRIPT_DIR="$INSTALL_SCRIPT_DIR"
  fi

  pick_install_dir

  ui_header "Download Realtor OS"
  say "Channel: ${REALTOR_CHANNEL} — fetching ${REALTOR_GIT_REF}"
  say "Destination:"
  ok "$INSTALL_DIR"
  note "Usually 1–2 minutes. Progress from git appears below."
  pause "Press Enter to start the download"

  clone_or_update

  if [[ ! -f "${INSTALL_DIR}/scripts/launch-wizard.sh" ]]; then
    warn "launch-wizard.sh not found in ${INSTALL_DIR}"
    exit 1
  fi

  ok "App files are in place."
  pause "Press Enter to continue setup"
  cd "$INSTALL_DIR"
  write_install_env
  export REALTOR_INSTALL_DIR="$INSTALL_DIR"
  export REALTOR_REPO_ROOT="$INSTALL_DIR"
  export REALTOR_WIZARD_FROM_INSTALL=1
  export _STAGE_INDEX
  export TOTAL_STAGES
  exec bash scripts/launch-wizard.sh
}

main "$@"
