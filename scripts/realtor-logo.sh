#!/usr/bin/env bash
# Realtor OS retro terminal logo — source this file, then call realtor_show_logo

realtor_logo_path() {
  if [[ -n "${REALTOR_REPO_ROOT:-}" && -f "${REALTOR_REPO_ROOT}/scripts/realtor-logo.art" ]]; then
    printf '%s\n' "${REALTOR_REPO_ROOT}/scripts/realtor-logo.art"
    return
  fi
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${script_dir}/realtor-logo.art" ]]; then
    printf '%s\n' "${script_dir}/realtor-logo.art"
    return
  fi
  printf '%s\n' "${script_dir}/realtor-logo.art"
}

realtor_logo_print_lines() {
  local bold="${1-}" blue="${3-}" reset="${4-}"
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s%s%s\n' "$bold$blue" "$line" "$reset"
  done
}

realtor_show_logo_builtin() {
  realtor_logo_print_lines "$@" <<'EOF'
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                                              ┃
┃                           /\                                 ┃
┃                          /  \                                ┃
┃                         /____\                               ┃
┃                         |    |                               ┃
┃                         | [] |                               ┃
┃                         |____|                               ┃
┃                                                              ┃
┃         ____            _       ____   ___  ____             ┃
┃        |  _ \ ___  ___| |_ ___|  _ \ / _ \|  _ \            ┃
┃        | |_) / _ \/ __| __/ _ \ | | | | | | |_) |           ┃
┃        |  _ <  __/\__ \ ||  __/ |_| | |_| |  _ <            ┃
┃        |_| \_\___||___/\__\___|____/ \___/|_| \_\            ┃
┃                                                              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
EOF
}

realtor_show_logo() {
  local logo_file
  logo_file="$(realtor_logo_path)"
  local bold="${1-}" dim="${2-}" blue="${3-}" reset="${4-}"

  printf '\n'
  if [[ -f "$logo_file" ]]; then
    realtor_logo_print_lines "$bold" "$dim" "$blue" "$reset" <"$logo_file"
  else
    realtor_show_logo_builtin "$bold" "$dim" "$blue" "$reset"
  fi
  printf '\n'
}
