#!/usr/bin/env bash
# Realtor OS retro terminal logo — source this file, then call realtor_show_logo

realtor_logo_path() {
  printf '%s\n' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/realtor-logo.art"
}

realtor_show_logo() {
  local logo_file
  logo_file="$(realtor_logo_path)"
  [[ -f "$logo_file" ]] || return 0

  local bold="${1-}" dim="${2-}" blue="${3-}" reset="${4-}"

  printf '\n'
  while IFS= read -r line || [[ -n "$line" ]]; do
    printf '%s%s%s\n' "$bold$blue" "$line" "$reset"
  done < "$logo_file"
  printf '\n'
}
