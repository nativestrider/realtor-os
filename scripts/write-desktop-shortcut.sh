#!/usr/bin/env bash
# Desktop shortcut for RealtorOS (Mac .command, Linux .desktop).
set -euo pipefail

install_dir="${1:?install dir}"
data_dir="${REALTOR_DATA_DIR:-${HOME}/.realtor-os}"

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

DESKTOP="$(desktop_dir)"
if [[ ! -d "$DESKTOP" ]]; then
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    shortcut="${DESKTOP}/RealtorOS.command"
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
    shortcut="${DESKTOP}/RealtorOS.desktop"
    cat >"$shortcut" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=RealtorOS
Comment=Real estate AI assistant
Path=${install_dir}
Exec=bash -lc 'export REALTOR_INSTALL_DIR="${install_dir}" REALTOR_DATA_DIR="${data_dir}"; source "${install_dir}/scripts/realtor-env.sh"; cd "${install_dir}"; exec node packages/cli/bin/realtor.mjs web'
Terminal=true
Categories=Office;
EOF
    chmod +x "$shortcut"
  ;;
  *)
    exit 1
    ;;
esac

printf '%s\n' "$shortcut"
