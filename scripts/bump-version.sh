#!/usr/bin/env bash
# Bump RealtorOS version across package.json and scripts/realtor-release.env.
# Usage: bash scripts/bump-version.sh 0.1.1
set -euo pipefail

new="${1:?usage: bump-version.sh <version>  e.g. 0.1.1}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag="v${new}"

if [[ ! "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Version must be semver (x.y.z), got: %s\n' "$new" >&2
  exit 1
fi

node - "$root/package.json" "$new" <<'NODE'
const fs = require('node:fs');
const [path, version] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = version;
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
NODE

cat >"$root/scripts/realtor-release.env" <<EOF
# RealtorOS release pin — bump with scripts/bump-version.sh on each release.
REALTOR_VERSION=${new}
REALTOR_GIT_REF=${tag}
EOF

if [[ -f "$root/scripts/realtor-channels.env" ]]; then
  sed -i.bak \
    -e "s/^REALTOR_CHANNEL_STABLE_REF=.*/REALTOR_CHANNEL_STABLE_REF=${tag}/" \
    -e "s/^REALTOR_CHANNEL_STABLE_VERSION=.*/REALTOR_CHANNEL_STABLE_VERSION=${new}/" \
    "$root/scripts/realtor-channels.env"
  rm -f "$root/scripts/realtor-channels.env.bak"
fi

printf 'Updated stable channel to %s (%s)\n' "$new" "$tag"
printf 'Next: git commit, git tag %s, git push && git push origin %s\n' "$tag" "$tag"
