#!/usr/bin/env bash
# User-local RealtorOS environment (Mac, Linux, WSL).
# Does not modify system Node, global npm, or OS package managers.
#
# Source from scripts or the ~/.local/bin/realtor-os launcher:
#   source /path/to/realtor-os/scripts/realtor-env.sh
#
export REALTOR_HOME="${REALTOR_HOME:-${HOME}/.local/share/realtor-os}"
export REALTOR_DATA_DIR="${REALTOR_DATA_DIR:-${HOME}/.realtor-os}"
export REALTOR_INSTALL_DIR="${REALTOR_INSTALL_DIR:-${REALTOR_HOME}/app}"
export REALTOR_REPO_ROOT="${REALTOR_REPO_ROOT:-${REALTOR_INSTALL_DIR}}"
export FNM_DIR="${FNM_DIR:-${HOME}/.local/share/fnm}"
export PNPM_HOME="${PNPM_HOME:-${REALTOR_HOME}/pnpm}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}"

# fnm-managed Node + project pnpm shim, then user bin (realtor-os launcher)
export PATH="${FNM_DIR}:${PNPM_HOME}:${HOME}/.local/bin:${PATH}"

if [[ -x "${FNM_DIR}/fnm" ]]; then
  # shellcheck disable=SC2046
  eval "$("${FNM_DIR}/fnm" env)"
fi

# pnpm store stays under REALTOR_HOME (not global ~/.local/share/pnpm)
export npm_config_store_dir="${npm_config_store_dir:-${REALTOR_HOME}/pnpm-store}"

realtor_env_describe() {
  printf 'RealtorOS paths (user-local only):\n'
  printf '  app:        %s\n' "$REALTOR_INSTALL_DIR"
  printf '  data:       %s\n' "$REALTOR_DATA_DIR"
  printf '  node (fnm): %s\n' "$FNM_DIR"
  printf '  pnpm store: %s\n' "$npm_config_store_dir"
  printf '  browsers:   %s\n' "$PLAYWRIGHT_BROWSERS_PATH"
}
