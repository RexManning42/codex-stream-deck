# Changelog

## 0.6.1 - Unreleased

- Fixed macOS Codex updates exposing avatar-overlay renderer targets before the real main window, which could stop relay snapshots and leave an agent key stuck in `working`.
- Fixed remote agent commands for `client-new-thread:` task identities being rejected by the relay validator.

## 0.6.0 - 2026-07-18

- Added the local macOS Codex Micro launcher and persistent LaunchAgent watcher.
- Added an opt-in authenticated SSH/Tailscale relay for mixed Windows/macOS agent slots and native command routing.
- Added a Windows/Mac target action while keeping agent keys bound to each task's originating host.
- Added host badges and stable `(hostId, threadKey)` routing for the six global agent keys.
- Replaced the one-shot Windows-login launcher with a persistent, single-instance bridge watcher.
- Automatically recovers the bridge after Codex updates, crashes, and normal restarts.
- Detects rapid Codex restarts by main-process generation even when no stopped interval is observed.
- Avoids touching a normal Codex session that was already open when the watcher is first installed.
- Removes stale bridge-port files and records bounded diagnostics in `%LOCALAPPDATA%\CodexDeck\watcher.log`.
- Added independent Windows-only and macOS-only operation from the same Stream Deck plugin package.
- Added host-generic task ownership and global recent-activity ordering for mixed Mac/Windows agent keys.
- Restricted relay listeners and clients to loopback or explicit Tailscale addresses and added hidden token entry on Windows.
- Installed the Windows watcher into a durable per-user location instead of depending on the extracted ZIP folder.
- Added separated release archives, checksums, and an automated audit for private state, personal setup markers, and protected keycap SVGs.

## 0.5.0 - 2026-07-17

- The launcher reuses a healthy existing loopback debug session instead of restarting Codex on every run.
- Added `-ForceRestart` for an explicit clean restart path.
- The source launcher can use the built release helper during local development.
- Added standalone native actions for every official single-size Codex Micro keycap; the microphone remains a true press/release action.
- Added live keycap-registry resolution so command mappings follow the installed Codex build instead of being duplicated in the plugin.
- Added readable themed fallbacks when a user-local SVG is unavailable.
- Prevented overlapping bridge polls, redundant Stream Deck image writes, and idle selected-agent animation traffic.
- Multiple copies of the same action now render correctly across pages and profiles.
- Added compatibility with the Codex `26.715.2305.0` renderer event bus and settings exports.
- Kept approval requests and user questions orange for the current `awaiting-approval` and `awaiting-response` Micro states.

## 0.4.1 - 2026-07-17

Initial public release.

- Native six-slot Codex Micro agent synchronization.
- Animated status tiles for idle, working, unread, approval, error, and empty states.
- Native Micro action, joystick, and encoder event dispatch.
- Direct reasoning-effort increase/decrease actions.
- Loopback-only Codex launcher with runtime module discovery.
- Optional local keycap SVG loading; third-party SVG contents are not distributed.
- Removed development database/log fallbacks and legacy hotkey behavior from the public runtime.
