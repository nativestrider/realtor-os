#!/usr/bin/env bash
# Write the user-local Realtor OS launcher and/or Desktop shortcut.
#
#   bash scripts/write-shortcuts.sh launcher <install_dir>
#   bash scripts/write-shortcuts.sh desktop  <install_dir>
#   bash scripts/write-shortcuts.sh both     <install_dir>
set -euo pipefail

kind="${1:?launcher|desktop|both}"
install_dir="${2:?install dir}"
data_dir="${REALTOR_DATA_DIR:-${HOME}/.realtor-os}"

write_launcher() {
  local launcher="${HOME}/.local/bin/realtor-os"
  mkdir -p "${HOME}/.local/bin"
  cat >"$launcher" <<EOF
#!/usr/bin/env bash
export REALTOR_INSTALL_DIR="${install_dir}"
export REALTOR_DATA_DIR="${data_dir}"
# shellcheck disable=SC1091
source "\${REALTOR_INSTALL_DIR}/scripts/realtor-env.sh"
cd "\${REALTOR_INSTALL_DIR}"
exec node "\${REALTOR_INSTALL_DIR}/packages/cli/bin/realtor.mjs" web "\$@"
EOF
  chmod +x "$launcher"
  printf '%s\n' "$launcher"
}

desktop_dir() {
  local candidate
  for candidate in \
    "${HOME}/Desktop" \
    "${HOME}/Ambiente de Trabalho" \
    "${HOME}/Escritorio" \
    "${HOME}/Bureau" \
    "${HOME}/Schreibtisch"; do
    if [[ -d "$candidate" ]]; then
      printf '%s' "$candidate"
      return
    fi
  done
  if [[ "$(uname -s)" == "Darwin" ]]; then
    printf '%s/Desktop' "$HOME"
    return
  fi
  if command -v xdg-user-dir >/dev/null 2>&1; then
    xdg-user-dir DESKTOP 2>/dev/null && return
  fi
  printf '%s/Desktop' "$HOME"
}

write_desktop() {
  local desktop shortcut
  desktop="$(desktop_dir)"
  [[ -d "$desktop" ]] || return 1

  case "$(uname -s)" in
    Darwin)
      shortcut="${desktop}/RealtorOS.command"
      cat >"$shortcut" <<EOF
#!/bin/bash
export REALTOR_INSTALL_DIR="${install_dir}"
export REALTOR_DATA_DIR="${data_dir}"
source "\${REALTOR_INSTALL_DIR}/scripts/realtor-env.sh"
cd "\${REALTOR_INSTALL_DIR}"
exec node "\${REALTOR_INSTALL_DIR}/packages/cli/bin/realtor.mjs" web
EOF
      chmod +x "$shortcut"
      ;;
    Linux)
      shortcut="${desktop}/RealtorOS.desktop"
      cat >"$shortcut" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Realtor OS
Comment=Real estate AI assistant
Path=${install_dir}
Exec=bash -lc 'export REALTOR_INSTALL_DIR="${install_dir}" REALTOR_DATA_DIR="${data_dir}"; source "${install_dir}/scripts/realtor-env.sh"; cd "${install_dir}"; exec node packages/cli/bin/realtor.mjs web'
Terminal=true
Categories=Office;
EOF
      chmod +x "$shortcut"
      ;;
    *)
      return 1
      ;;
  esac
  printf '%s\n' "$shortcut"
}

case "$kind" in
  launcher) write_launcher ;;
  desktop)  write_desktop ;;
  both)
    write_launcher
    write_desktop || true
    ;;
  *)
    printf 'usage: write-shortcuts.sh launcher|desktop|both <install_dir>\n' >&2
    exit 1
    ;;
esac
