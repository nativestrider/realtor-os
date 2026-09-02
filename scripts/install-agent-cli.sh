#!/usr/bin/env bash
# Install a selected RealtorOS agent CLI (official vendor installer, user-local).
# Usage: bash scripts/install-agent-cli.sh claude|codex|kimi|grok
set -euo pipefail

AGENT="${1:-}"

log() { printf '[realtor-os] %s\n' "$1"; }
warn() { printf '[realtor-os] warning: %s\n' "$1" >&2; }

prepend_path() {
  case ":${PATH}:" in
    *":$1:"*) ;;
    *) export PATH="$1:${PATH}" ;;
  esac
}

resolve_bin() {
  local name="$1"
  shift
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi
  local extra
  for extra in "$@"; do
    if [[ -x "$extra" ]]; then
      printf '%s' "$extra"
      return 0
    fi
  done
  return 1
}

skip_requested() {
  local agent="$1"
  [[ "${REALTOR_SKIP_CLI_INSTALL:-}" == "1" ]] && return 0
  case "$agent" in
    claude) [[ "${REALTOR_SKIP_CLAUDE_INSTALL:-}" == "1" ]] ;;
    codex) [[ "${REALTOR_SKIP_CODEX_INSTALL:-}" == "1" ]] ;;
    kimi) [[ "${REALTOR_SKIP_KIMI_INSTALL:-}" == "1" ]] ;;
    grok) [[ "${REALTOR_SKIP_GROK_INSTALL:-}" == "1" ]] ;;
    *) return 1 ;;
  esac
}

install_claude() {
  local extras=("${HOME}/.local/bin/claude")
  prepend_path "${HOME}/.local/bin"
  if bin="$(resolve_bin claude "${extras[@]}")"; then
    log "Claude Code already installed ($("$bin" --version 2>/dev/null | head -1 || echo "$bin"))"
    return 0
  fi
  skip_requested claude && { warn "Skipping Claude Code install."; return 1; }
  log "Installing Claude Code from https://claude.ai/install.sh…"
  curl -fsSL https://claude.ai/install.sh | bash
  prepend_path "${HOME}/.local/bin"
  hash -r 2>/dev/null || true
  if bin="$(resolve_bin claude "${extras[@]}")"; then
    log "Claude Code ready ($("$bin" --version 2>/dev/null | head -1 || echo "$bin"))"
    return 0
  fi
  warn "Claude installer finished but claude was not found. Add ~/.local/bin to PATH."
  return 1
}

install_codex() {
  local extras=("${HOME}/.local/bin/codex")
  prepend_path "${HOME}/.local/bin"
  if bin="$(resolve_bin codex "${extras[@]}")"; then
    log "Codex already installed ($("$bin" --version 2>/dev/null | head -1 || echo "$bin"))"
    return 0
  fi
  skip_requested codex && { warn "Skipping Codex install."; return 1; }
  log "Installing Codex from https://chatgpt.com/codex/install.sh…"
  curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
  prepend_path "${HOME}/.local/bin"
  hash -r 2>/dev/null || true
  if bin="$(resolve_bin codex "${extras[@]}")"; then
    log "Codex ready ($("$bin" --version 2>/dev/null | head -1 || echo "$bin"))"
    return 0
  fi
  warn "Codex installer finished but codex was not found. Add ~/.local/bin to PATH."
  return 1
}

install_kimi() {
  local extras=("${HOME}/.kimi-code/bin/kimi")
  prepend_path "${HOME}/.kimi-code/bin"
  if bin="$(resolve_bin kimi "${extras[@]}")"; then
    log "Kimi already installed ($("$bin" --version 2>/dev/null | head -1 || echo "$bin"))"
    return 0
  fi
  skip_requested kimi && { warn "Skipping Kimi install."; return 1; }
  log "Installing Kimi Code from https://code.kimi.com/kimi-code/install.sh…"
  curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
  prepend_path "${HOME}/.kimi-code/bin"
  hash -r 2>/dev/null || true
  if bin="$(resolve_bin kimi "${extras[@]}")"; then
    log "Kimi ready ($("$bin" --version 2>/dev/null | head -1 || echo "$bin"))"
    return 0
  fi
  warn "Kimi installer finished but kimi was not found. Add ~/.kimi-code/bin to PATH."
  return 1
}

install_grok() {
  local extras=("${HOME}/.grok/bin/grok")
  prepend_path "${HOME}/.grok/bin"
  if bin="$(resolve_bin grok "${extras[@]}")"; then
    log "Grok Build already installed ($("$bin" --version 2>/dev/null | head -1 || echo "$bin"))"
    return 0
  fi
  skip_requested grok && { warn "Skipping Grok Build install."; return 1; }
  log "Installing Grok Build from https://x.ai/cli/install.sh…"
  curl -fsSL https://x.ai/cli/install.sh | bash
  prepend_path "${HOME}/.grok/bin"
  hash -r 2>/dev/null || true
  if bin="$(resolve_bin grok "${extras[@]}")"; then
    log "Grok Build ready ($("$bin" --version 2>/dev/null | head -1 || echo "$bin"))"
    return 0
  fi
  warn "Grok installer finished but grok was not found. Add ~/.grok/bin to PATH."
  return 1
}

case "$AGENT" in
  claude) install_claude ;;
  codex) install_codex ;;
  kimi) install_kimi ;;
  grok) install_grok ;;
  *)
    warn "Usage: bash scripts/install-agent-cli.sh claude|codex|kimi|grok"
    exit 2
    ;;
esac
