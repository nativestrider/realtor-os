#!/usr/bin/env bash
# Graphical folder picker for install location (Mac Finder, Linux zenity/kdialog).
# Prints the chosen install directory path to stdout.
#
#   bash pick-install-folder.sh [default_install_dir]
#   bash pick-install-folder.sh --gui-only [default_install_dir]   # GUI only; exit 1 if cancelled
set -euo pipefail

gui_only=false
if [[ "${1:-}" == "--gui-only" ]]; then
  gui_only=true
  shift
fi

default="${1:-${HOME}/RealtorOS}"
default="${default/#\~/$HOME}"
default_parent="$(dirname "$default")"
default_name="$(basename "$default")"

resolve_install_dir() {
  local picked="${1%/}"
  local base
  base="$(basename "$picked")"
  if [[ "$base" == "RealtorOS" || "$base" == "realtor-os" ]]; then
    printf '%s' "$picked"
  else
    printf '%s/%s' "$picked" "$default_name"
  fi
}

gui_pick() {
  local picked=""

  if [[ "$(uname -s)" == "Darwin" ]] && command -v osascript >/dev/null 2>&1; then
    printf '[realtor-os] Opening Finder — choose where to install RealtorOS…\n' >&2
    picked="$(osascript 2>/dev/null <<EOF || true
set defaultPath to POSIX file "${default_parent}"
try
  set chosen to choose folder with prompt "Choose where to install RealtorOS. A \"${default_name}\" folder will be created here unless you select that folder directly." default location defaultPath
  return POSIX path of chosen
on error number -128
  return ""
end try
EOF
)"
  elif [[ -n "${DISPLAY:-}" ]] && command -v zenity >/dev/null 2>&1; then
    printf '[realtor-os] Opening folder picker…\n' >&2
    picked="$(zenity --file-selection --directory \
      --title="Install RealtorOS" \
      --text="Choose where to install RealtorOS. A \"${default_name}\" folder will be created here unless you select it directly." \
      --filename="${default_parent}/" 2>/dev/null || true)"
  elif [[ -n "${DISPLAY:-}" ]] && command -v kdialog >/dev/null 2>&1; then
    picked="$(kdialog --getexistingdirectory "$default_parent" \
      --title "Install RealtorOS" \
      --text "Choose where to install RealtorOS." 2>/dev/null || true)"
  fi

  picked="${picked//$'\r'/}"
  picked="${picked//$'\n'/}"
  picked="${picked%/}"
  if [[ -z "$picked" ]]; then
    return 1
  fi
  resolve_install_dir "$picked"
  return 0
}

if $gui_only; then
  if picked="$(gui_pick)"; then
    printf '%s\n' "$picked"
    exit 0
  fi
  exit 1
fi

if [[ ! -t 0 ]]; then
  if picked="$(gui_pick)"; then
    printf '%s\n' "$picked"
    exit 0
  fi
  printf '%s\n' "$default"
  exit 0
fi

if picked="$(gui_pick)"; then
  printf '%s\n' "$picked"
  exit 0
fi

printf '\n'
printf '  Install folder [%s]\n' "$default"
printf '  Press Enter to browse folders, or type a path: '
local_reply=""
read -r local_reply || true

if [[ -z "$local_reply" ]]; then
  if picked="$(gui_pick)"; then
    printf '%s\n' "$picked"
    exit 0
  fi
  printf '%s\n' "$default"
  exit 0
fi

if [[ "$local_reply" == [bB] ]]; then
  if picked="$(gui_pick)"; then
    printf '%s\n' "$picked"
    exit 0
  fi
  printf '%s\n' "$default"
  exit 0
fi

printf '%s\n' "${local_reply/#\~/$HOME}"
