#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
OUTPUT="${1:-$ROOT/outputs/codex-deck-launcher-macos-v$VERSION.zip}"
mkdir -p "${OUTPUT:h}"
rm -f "$OUTPUT"
chmod 755 "$ROOT/release/codex-deck-launcher-macos/start-codex-deck.sh" "$ROOT/release/codex-deck-launcher-macos/Start Codex Deck.command"
ditto -c -k --sequesterRsrc --keepParent "$ROOT/release/codex-deck-launcher-macos" "$OUTPUT"
echo "macOS launcher archive created: $OUTPUT"
