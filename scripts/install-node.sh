#!/usr/bin/env bash
# Install Node.js 20+ for RealtorOS (used by launch-wizard.sh).
# macOS + Homebrew: brew install node
# Otherwise: fnm → Node 22 LTS in ~/.local/share/fnm (no sudo)
set -euo pipefail

FNM_DIR="${FNM_DIR:-${REALTOR_DATA_DIR:-$HOME/.realtor-os}/fnm}"
NODE_VERSION="${REALTOR_NODE_VERSION:-22}"

log() { printf '[realtor-os] %s\n' "$1"; }
warn() { printf '[realtor-os] warning: %s\n' "$1" >&2; }

activate_fnm() {
  export PATH="${FNM_DIR}:${HOME}/.local/bin:${PATH}"
  if [[ -x "${FNM_DIR}/fnm" ]]; then
    # shellcheck disable=SC2046
    eval "$("${FNM_DIR}/fnm" env)"
  fi
}

node_major() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

install_fnm() {
  if [[ ! -x "${FNM_DIR}/fnm" ]]; then
    log "Installing fnm (Node version manager)…"
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$FNM_DIR" --skip-shell
  fi
  activate_fnm
}

install_node_via_fnm() {
  install_fnm
  log "Installing Node.js ${NODE_VERSION} LTS…"
  fnm install "$NODE_VERSION" --install-if-missing
  fnm default "$NODE_VERSION"
  fnm use "$NODE_VERSION"
  activate_fnm
}

install_node_via_brew() {
  log "Installing Node.js with Homebrew…"
  if brew list node &>/dev/null; then
    brew upgrade node || true
  else
    brew install node
  fi
}

verify_node() {
  activate_fnm
  if ! command -v node >/dev/null 2>&1; then
    warn "node not found on PATH after install"
    return 1
  fi
  local major
  major="$(node_major)"
  if (( major < 20 )); then
    warn "Node $(node --version) is too old (need 20+)"
    return 1
  fi
  log "Node $(node --version) ready"
  return 0
}

main() {
  activate_fnm
  if command -v node >/dev/null 2>&1; then
    if (( $(node_major) >= 20 )); then
      log "Node $(node --version) already OK"
      exit 0
    fi
    warn "Node $(node --version) is older than 20 — upgrading…"
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && [[ "${REALTOR_ALLOW_SYSTEM_NODE:-0}" == "1" ]] && command -v brew >/dev/null 2>&1; then
    install_node_via_brew || install_node_via_fnm
  else
    if ! command -v curl >/dev/null 2>&1; then
      warn "curl is required to install Node automatically"
      exit 1
    fi
    install_node_via_fnm
  fi

  verify_node
}

main "$@"
