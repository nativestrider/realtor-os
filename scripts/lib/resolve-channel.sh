#!/usr/bin/env bash
# Resolve REALTOR_CHANNEL → REALTOR_GIT_REF, REALTOR_VERSION, frozen lockfile policy.
# Source after optional realtor-release.env / realtor-channels.env are loaded.
set -euo pipefail

realtor_channel_normalize() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

realtor_load_channel_config() {
  local script_dir="${1:-}"
  if [[ -n "$script_dir" ]] && [[ -f "${script_dir}/realtor-release.env" ]]; then
    # shellcheck source=/dev/null
    source "${script_dir}/realtor-release.env"
  fi
  if [[ -n "$script_dir" ]] && [[ -f "${script_dir}/realtor-channels.env" ]]; then
    # shellcheck source=/dev/null
    source "${script_dir}/realtor-channels.env"
  fi
  if [[ -z "${script_dir:-}" ]] || [[ ! -f "${script_dir}/realtor-channels.env" ]]; then
    local tmp
    tmp="$(mktemp)"
    if curl -fsSL "https://raw.githubusercontent.com/nativestrider/realtor-os/main/scripts/realtor-channels.env" -o "$tmp" 2>/dev/null; then
      # shellcheck source=/dev/null
      source "$tmp"
    fi
    rm -f "$tmp"
  fi
}

realtor_resolve_channel() {
  local channel
  channel="$(realtor_channel_normalize "${REALTOR_CHANNEL:-${REALTOR_CHANNEL_DEFAULT:-stable}}")"

  export REALTOR_CHANNEL="$channel"
  export REALTOR_FROZEN_LOCKFILE=1

  if [[ -n "${REALTOR_GIT_REF:-}" ]]; then
    :
  elif [[ -n "${REALTOR_BRANCH:-}" ]]; then
    REALTOR_GIT_REF="$REALTOR_BRANCH"
  else
    case "$channel" in
      stable)
        REALTOR_GIT_REF="${REALTOR_CHANNEL_STABLE_REF:-v${REALTOR_VERSION:-0.1.0}}"
        REALTOR_VERSION="${REALTOR_VERSION:-${REALTOR_CHANNEL_STABLE_VERSION:-0.1.0}}"
        ;;
      beta)
        REALTOR_GIT_REF="${REALTOR_CHANNEL_BETA_REF:-beta}"
        REALTOR_VERSION="${REALTOR_VERSION:-${REALTOR_CHANNEL_BETA_VERSION:-beta}}"
        ;;
      dev|main|edge)
        REALTOR_CHANNEL=dev
        REALTOR_GIT_REF="${REALTOR_CHANNEL_DEV_REF:-main}"
        REALTOR_VERSION="${REALTOR_VERSION:-${REALTOR_CHANNEL_DEV_VERSION:-dev}}"
        REALTOR_FROZEN_LOCKFILE=0
        ;;
      *)
        REALTOR_CHANNEL=stable
        realtor_resolve_channel
        return
        ;;
    esac
  fi

  export REALTOR_GIT_REF
  export REALTOR_VERSION="${REALTOR_VERSION:-dev}"
  export REALTOR_FROZEN_LOCKFILE
}

realtor_source_archive_url() {
  local ref="$1"
  if [[ "$ref" == v* ]]; then
    printf 'https://github.com/nativestrider/realtor-os/archive/refs/tags/%s.tar.gz' "$ref"
  else
    printf 'https://github.com/nativestrider/realtor-os/archive/refs/heads/%s.tar.gz' "$ref"
  fi
}

realtor_resolve_archive_root() {
  local tmp="$1" ref="$2" stripped="${2#v}" candidate
  for candidate in \
    "${tmp}/realtor-os-${ref}" \
    "${tmp}/realtor-os-${stripped}" \
    "${tmp}/realtor-os-main"; do
    if [[ -d "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

realtor_channel_label() {
  case "${REALTOR_CHANNEL:-stable}" in
    stable) printf 'Stable (recommended)' ;;
    beta) printf 'Beta (pre-release)' ;;
    dev) printf 'Dev (latest from main — developers)' ;;
    *) printf '%s' "${REALTOR_CHANNEL:-stable}" ;;
  esac
}
