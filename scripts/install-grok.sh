#!/usr/bin/env bash
# Back-compat wrapper — prefer: bash scripts/install-agent-cli.sh grok
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install-agent-cli.sh" grok
