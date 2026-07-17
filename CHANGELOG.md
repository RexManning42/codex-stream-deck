# Changelog

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
