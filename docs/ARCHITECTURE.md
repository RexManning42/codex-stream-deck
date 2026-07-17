# Architecture and security

## Components

### Launcher

`Start-CodexDeck.ps1` finds the installed Microsoft Store Codex package. If a healthy debug-enabled Codex process already exists, it reuses its loopback port. Otherwise it closes the normal Codex processes, chooses an unused loopback port, writes the port number to `%LOCALAPPDATA%\CodexDeck\codex-micro-bridge.json`, and starts `ChatGPT.exe` with:

```text
--remote-debugging-address=127.0.0.1
--remote-debugging-port=<random-port>
```

The bundled runtime helper connects to that renderer and enables the Micro feature state for the current session. It discovers the versioned `persisted-signal-*` asset dynamically; no asset hash is hardcoded.

The launcher does not edit the Codex installation, Codex LevelDB, task database, rollout files, or logs.

### Stream Deck plugin

The plugin discovers the loopback port from the state file or from the command line of a running Codex process. It then uses Chrome DevTools Protocol `Runtime.evaluate` calls to:

1. discover the current version-hashed Codex renderer modules;
2. announce a connected Micro device state;
3. read the native six-slot state, layout, agent source, and lighting preference;
4. dispatch Micro HID and joystick events;
5. invoke the internal reasoning-effort commands;
6. resolve standalone keycap actions from Codex's live Micro keycap registry.

The bridge does not emulate a USB HID device and installs no driver.

### Rendering

Agent keys are original deterministic SVGs generated in memory from task title and state. The status palette is:

| Native state | Display |
|---|---|
| `off` | dark / unassigned |
| `idle` | white |
| `working` | saturated blue animation |
| `unread` | green completion |
| `approval` | orange pause/input |
| `error` | red error |

The renderer derives the active Codex appearance from explicit theme tokens when available and falls back to the computed renderer surface luminance. Dark mode uses layered charcoal surfaces rather than pure black, with off-white text and slightly lifted status colors for the Stream Deck display.

Official Codex Micro keycap SVG contents are not part of the source or release. Optional user-local files are loaded from `%LOCALAPPDATA%\CodexDeck\icons` and wrapped in the project's neutral key surface at runtime.

The controller uses non-overlapping self-scheduled refreshes and caches the last
image sent to each action instance. Unchanged keys therefore produce no repeated
USB image writes. Animated frames are limited to working and approval states.

## Trust boundary

CDP provides privileged access to the Codex renderer. Binding to `127.0.0.1` prevents direct access from another machine, but not from another process running under the local user account. Treat the launcher-started session like any other local debugging session:

- do not run untrusted software at the same time;
- do not change the debug address to `0.0.0.0`;
- do not forward the port;
- close Codex when the bridge is no longer needed.

## Data flow

Codex Deck has no server, API key, analytics endpoint, or update service. Runtime data stays between Stream Deck, the local plugin process, and the local Codex renderer.

## Compatibility boundary

This is not a public Codex extension API. Export names, internal commands, or event shapes can change. The code avoids fixed bundle hashes where possible, but semantic changes still require a release update.
