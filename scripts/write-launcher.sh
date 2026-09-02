#!/usr/bin/env bash
# Write ~/.local/bin/realtor-os launcher (isolated user install).
set -euo pipefail

install_dir="${1:?install dir}"
launcher="${HOME}/.local/bin/realtor-os"
mkdir -p "${HOME}/.local/bin"

cat >"$launcher" <<EOF
#!/usr/bin/env bash
export REALTOR_INSTALL_DIR="${install_dir}"
export REALTOR_DATA_DIR="${REALTOR_DATA_DIR:-${HOME}/.realtor-os}"
# shellcheck disable=SC1091
source "\${REALTOR_INSTALL_DIR}/scripts/realtor-env.sh"
cd "\${REALTOR_INSTALL_DIR}"
exec node "\${REALTOR_INSTALL_DIR}/packages/cli/bin/realtor.mjs" web "\$@"
EOF

chmod +x "$launcher"
printf '%s\n' "$launcher"
