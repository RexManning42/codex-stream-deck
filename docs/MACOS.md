# macOS launcher and watcher

The macOS support is the local Codex Micro foundation for a future secure
multi-host relay. It enables the existing Codex renderer integration and keeps
the loopback bridge available after later Codex launches, crashes, and app
updates. It does not expose a network relay or connect to a Windows hub yet.

## Safety boundary

- Codex is discovered from its bundle metadata and running process path. The
  app filename and version are not hardcoded.
- The executable named by `CFBundleExecutable` is validated, while launches go
  through macOS LaunchServices so Input Monitoring/TCC permissions remain tied
  to the signed app bundle.
- Nothing inside `Codex.app` (or the currently named app bundle) is edited,
  patched, replaced, or re-signed.
- Chrome DevTools is always requested on `127.0.0.1`; `0.0.0.0` is never used.
- A normal Codex session that is already running when the watcher is first
  installed is recorded and left untouched.
- After installation, a later normal launch or update replacement can require
  one automatic recovery restart. The watcher performs no more than one such
  restart for a single main-process generation and never force-kills Codex.
- Official OpenAI keycap SVGs are not included. User-local icons remain in the
  `icons` directory during uninstall.

## Commands

From the extracted macOS launcher directory:

```zsh
./start-codex-deck.sh dry-run
./start-codex-deck.sh self-test
./start-codex-deck.sh start
./start-codex-deck.sh install
./start-codex-deck.sh uninstall
```

`Start Codex Deck.command` provides the double-clickable equivalent of
`start`. If Codex is already running without a healthy bridge, it displays the
restart warning and requires the user to type `yes` before continuing.

`install` copies only the bundled watcher runtime into Application Support,
writes the LaunchAgent, and loads it in the current GUI session. It does not
restart an already-running normal session during first installation.

## Files

```text
~/Library/Application Support/CodexDeck/
  codex-deck-macos.mjs
  watcher-launch.sh
  codex-micro-bridge.json
  host.json
  watcher-state.json
  watcher.log
  watcher.log.1
  watcher.log.2
  watcher.log.3
  icons/                         # optional user-owned files

~/Library/LaunchAgents/com.simeo.codex-deck.watcher.plist
```

`watcher.log` rotates at approximately 1 MB with three retained generations.
The PID-directory lock guarantees one watcher instance. Stale locks are
reclaimed only when the recorded process no longer exists.

The bridge state remains compatible with the Windows reader's required `port`
and `updatedAt` fields and adds stable Mac identity:

```json
{
  "port": 12345,
  "updatedAt": "2026-07-18T12:34:56.000Z",
  "platform": "darwin",
  "hostId": "generated-stable-uuid",
  "hostName": "User-visible Mac name",
  "codexVersion": "detected-version"
}
```

The state file is written atomically. An unhealthy or mismatched port file is
removed before recovery.

## Recovery model

The watcher compares the Codex main PID, process start time, and executable
path (which includes the bundle path). This identifies a new generation even
when Codex stops and is replaced between two polls; each iteration separately
rediscovers the bundle version for state metadata.

1. A healthy loopback bridge is reused and the runtime override is verified.
2. A first-install normal session is preserved.
3. A stopped interval is confirmed before starting Codex with the bridge.
4. A later normal generation is gracefully terminated once and relaunched
   through LaunchServices with loopback-only debugging.
5. A 30-second startup window prevents repeated launches or restarts while the
   renderer and CDP endpoint are becoming ready.

The self-test simulates first-install preservation, repeat suppression, rapid
replacement, observed stops, app updates, LaunchAgent races, stale state, and
duplicate watcher instances. It does not launch or stop Codex.

## Diagnostics

```zsh
./start-codex-deck.sh dry-run
tail -n 100 "$HOME/Library/Application Support/CodexDeck/watcher.log"
launchctl print "gui/$(id -u)/com.simeo.codex-deck.watcher"
plutil -lint "$HOME/Library/LaunchAgents/com.simeo.codex-deck.watcher.plist"
```

## Uninstall

`uninstall` unloads the LaunchAgent and removes its runtime, policy state,
bridge port file, lock, and rotating logs. It deliberately preserves
`host.json` (stable future relay identity) and `icons/` (user-owned assets).
No Codex application data is removed.

## Future multi-host handoff

A future authenticated relay can treat `hostId` as the stable Mac node key,
publish the six renderer agent snapshots, and forward authenticated commands to
the existing native Micro dispatcher. The relay must use its own authenticated,
encrypted transport and must never expose or forward the Chrome DevTools port.
CDP remains loopback-only on the Mac.
