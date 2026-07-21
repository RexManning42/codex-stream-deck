# Codex Deck v0.7.0

This release adds Codex Deck Mobile for iPhone while preserving the established
Windows, macOS, and Windows-plus-Mac Stream Deck paths.

## Highlights

- Native SwiftUI iPhone companion for Mac and Windows Codex nodes.
- Six merged agent slots, native Micro controls, usage windows, reset credits,
  task details, command receipts, notifications, Live Activity, and widgets.
- Pinned-TLS Nearby pairing for normal private Wi-Fi without an account.
- Optional private remote access through Tailscale; Chrome DevTools always
  remains loopback-only.
- Polished adaptive iPhone icon for light, dark, and tinted Home Screen modes.
- Usage Limit, two-window Usage Overview, and hold-to-confirm Rate Limit Reset
  Stream Deck actions.
- Compatibility fixes for current Codex desktop builds, active/completed task
  state, empty agent artwork, adaptive landscape layout, and live relay version
  metadata after updates.

## Choose the correct download

- Everyone using Stream Deck installs `com.simeo.codex-deck.streamDeckPlugin`.
- Windows launcher: `codex-deck-launcher-windows-v0.7.0.zip`.
- macOS launcher: `codex-deck-launcher-macos-v0.7.0.zip`.
- iPhone app: download this release's **Source code (zip)** or clone the
  `v0.7.0` tag; there is no App Store, TestFlight, or pre-signed iPhone binary.
- Verify downloads against `SHA256SUMS.txt`.

## Installation

- [Windows](WINDOWS.md)
- [macOS](MACOS.md)
- [Windows and Mac together](MULTI_HOST.md)
- [iPhone source installation](IOS_INSTALL.md)
- [iPhone local Wi-Fi test without Tailscale](IOS_LOCAL_WIFI.md)

> [!IMPORTANT]
> The iPhone app currently requires a Mac with Xcode to build, sign, and install,
> even when it will control only Windows. After installation, that Mac does not
> need to stay online unless it is itself one of the controlled nodes.

Existing Stream Deck layouts and desktop-only installations remain supported.
For plugin updates, reload the Codex Deck Stream Deck plugin; do not restart
Codex merely to update the plugin.

Foreground task status is snapshot-driven. A newly started or completed task
normally appears on the phone within about one to three seconds; truly
event-driven instant delivery is planned separately rather than increasing CDP
polling load in this release.

## Validation boundary

The release candidate is checked with TypeScript, the complete Node test suite,
Stream Deck validation/packing, release privacy audit, shell syntax and plist
validation, macOS watcher self-test, generic iOS build, physical-iPhone Swift
tests, and the real Windows/Mac bridge setup. No official OpenAI keycap SVG,
private relay token, signing identifier, personal path, or runtime state is
included in the public artifacts.

## Acknowledgement

The idea to explore a phone-native Codex Micro companion was inspired in part
by the public mobile concept shared by [Shikhar (@xikhar)](https://x.com/xikhar).
Codex Deck Mobile is an independent implementation and includes none of that
concept's source code or artwork.

Codex Deck is an independent community project and is not made, supported, or
endorsed by OpenAI or Elgato.
