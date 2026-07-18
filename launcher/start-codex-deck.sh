#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
runtime="$script_dir/codex-deck-macos.mjs"

if [[ ! -f "$runtime" ]]; then
  print -u2 "Codex Deck: bundled macOS runtime is missing. Run npm run build first."
  exit 1
fi

exec /usr/bin/env node "$runtime" "${@:-start}"
