#!/usr/bin/env bash
# Shared terminal UI for install.sh and launch-wizard.sh.
# Source this file, then call wizard_ui_init.
# Chatter goes to stderr so $(...) never captures it as a path.

wizard_ui_init() {
  if [[ -t 2 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
    BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
    BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
    RED=$(tput setaf 1); CYAN=$(tput setaf 6)
  else
    BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""; CYAN=""
  fi
  TOTAL_STAGES="${TOTAL_STAGES:-10}"
  : "${_STAGE_INDEX:=0}"
}

_ui_clear() {
  [[ -t 2 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear >&2; else printf '\033[2J\033[3J\033[H' >&2; fi
}

_ui_progress() {
  local current="$1" total="$2" width=28
  (( total > 0 )) || total=1
  (( current < 0 )) && current=0
  (( current > total )) && current=$total
  local filled=$(( current * width / total ))
  local empty=$(( width - filled ))
  local bar="" i
  for (( i=0; i<filled; i++ )); do bar+="█"; done
  for (( i=0; i<empty; i++ )); do bar+="░"; done
  printf '  %s%s%s  %s%s/%s%s\n' \
    "$BLUE" "$bar" "$RESET" "$BOLD" "$current" "$total" "$RESET" >&2
}

# Incrementing step header with progress bar.
ui_header() {
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  export _STAGE_INDEX
  ui_header_refresh "$1"
}

# Redraw the current step without advancing.
ui_header_refresh() {
  local title="$1"
  _WIZARD_HEADER_TITLE="$title"
  _ui_clear
  printf '\n' >&2
  printf '  %s%sRealtor OS%s\n' "$BOLD" "$CYAN" "$RESET" >&2
  _ui_progress "$_STAGE_INDEX" "$TOTAL_STAGES"
  printf '  %s%s▸ %s%s\n' "$BOLD" "$BLUE" "$title" "$RESET" >&2
  printf '  %s────────────────────────────────────────%s\n\n' "$DIM" "$RESET" >&2
}

log()  { printf '  %s%s%s\n' "$CYAN" "$1" "$RESET" >&2; }
say()  { printf '  %s\n' "$1" >&2; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1" >&2; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET" >&2; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET" >&2; }
ok()   { printf '  %s✓ %s%s\n' "$GREEN" "$1" "$RESET" >&2; }
ok_msg() { ok "$1"; }

pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET" >&2
  if [[ -t 0 ]]; then
    read -r _ || true
  elif [[ -r /dev/tty ]]; then
    read -r _ </dev/tty || true
  fi
}

confirm() {
  local reply=""
  printf '  %s? %s [y/N] %s' "$YELLOW" "$1" "$RESET" >&2
  if [[ -t 0 ]]; then
    read -r reply || true
  elif [[ -r /dev/tty ]]; then
    read -r reply </dev/tty || true
  fi
  [[ "$reply" =~ ^[Yy] ]]
}

# Back-compat names used by install.sh / launch-wizard.sh
_clear() { _ui_clear; }
stage() { ui_header "$1"; }
stage_refresh() { ui_header_refresh "$1"; }
install_pause() { pause "$1"; }
install_confirm() { confirm "$1"; }
