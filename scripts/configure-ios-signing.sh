#!/bin/bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 3 ]]; then
  echo "Usage: ./scripts/configure-ios-signing.sh <unique-bundle-id> [Apple-Team-ID] [app-group]" >&2
  echo "Example: ./scripts/configure-ios-signing.sh com.yourname.CodexDeckMobile" >&2
  exit 2
fi

bundle_id="$1"
team_id="${2:-}"
app_group="${3:-group.${bundle_id}.shared}"
if [[ ! "$bundle_id" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$ || "$bundle_id" != *.* ]]; then
  echo "Bundle ID must use reverse-DNS form, for example com.yourname.CodexDeckMobile." >&2
  exit 2
fi
if [[ -n "$team_id" && ! "$team_id" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "Apple Team ID must contain exactly 10 uppercase letters or digits." >&2
  exit 2
fi
if [[ ! "$app_group" =~ ^group\.[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$ ]]; then
  echo "App Group must start with group. and use reverse-DNS form." >&2
  exit 2
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
config_path="$script_dir/../ios/Configuration/Local.xcconfig"
umask 077
{
  echo "// Generated locally; intentionally ignored by Git."
  echo "CODEX_DECK_BUNDLE_ID = $bundle_id"
  echo "CODEX_DECK_WIDGET_BUNDLE_ID = $bundle_id.Widgets"
  echo "CODEX_DECK_TEST_BUNDLE_ID = $bundle_id.Tests"
  echo "CODEX_DECK_APP_GROUP = $app_group"
  if [[ -n "$team_id" ]]; then echo "DEVELOPMENT_TEAM = $team_id"; fi
} > "$config_path"

echo "Created $config_path"
echo "Bundle ID: $bundle_id"
echo "App Group: $app_group"
if [[ -z "$team_id" ]]; then
  echo "Next: open the Xcode project and select your Team for the app, widget, and test targets."
fi
