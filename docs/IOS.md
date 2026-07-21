# Codex Deck Mobile for iPhone

Codex Deck Mobile is a native SwiftUI companion for the existing Stream Deck integration. It connects directly to authenticated Codex Deck nodes, merges Mac and Windows task snapshots on the phone, and routes each agent command to the computer that owns that task. The Stream Deck plugin keeps its current behavior and does not depend on the phone.

The app is currently source-only and not published. It requires iOS 17 or newer.

## What the first native build includes

- A fast cached dashboard with connection health and last-known state.
- Six globally merged agent cards with Mac/Windows ownership badges.
- Working, unread, awaiting approval/response, error, complete, idle, and offline-aware states.
- Optional context-window rings on agent keys, driven by structural token-usage metadata.
- Tap an agent key to open its task, or hold it for a native expanded view with full title, status, owner, routing, activity, and context usage.
- A local Attention Center for approvals, requested responses, completions, errors, and unread updates, with Mac/Windows filters and optional notifications.
- A one-task Follow mode with a native Lock Screen Live Activity and Dynamic Island status.
- Account-scoped 5-hour and weekly capacity, plus reset credits.
- Host-selectable Fast, Approve, Decline, Fork, Plan, Back, New Task, Send, and reasoning controls.
- Six interchangeable hardware keys with the full authenticated Micro keycap catalog.
- Codex-owned agent ordering plus Automatic, Coding, Review, and Mobile app layouts with independent lower-key assignments.
- Multiple independently reconnecting `wss://` node connections over Nearby Wi-Fi or Tailscale.
- Relay tokens stored as device-only Keychain items rather than in app preferences.
- Five native WidgetKit experiences for capacity, current agent, agent board, one command, or a four-command deck.
- System-following Light and Dark Mode, including a dedicated dark app icon and native iOS 26 Liquid Glass surfaces.

The interface is original SwiftUI using SF Symbols. Official OpenAI keycap artwork is not bundled, copied, or downloaded.

The context ring is enabled by default. Open Settings, then use **Display >
Context rings** to hide it in the iPhone app. This is intentionally independent
from the per-computer Stream Deck setting, so the ring can remain visible on the
phone while being hidden on Windows or macOS hardware keys.

## Agent modes and app layouts

Agent placement follows Codex Micro's native Priority, Fixed Assignment, Most
Recent, or Pinned Tasks mode. The phone merges mirrored Mac and Windows copies
by canonical task identity, so it does not introduce a competing favorites
system or silently route a key to the wrong computer.

Automatic remains the default and preserves the globally merged agent order
plus the selected computer's native lower keys. Coding, Review, and Mobile have
independent lower-key assignments, and each key can still be replaced by
holding it. **Import keys from selected computer** copies only validated current
Micro key IDs into the active app profile. Import is one way: it never writes to
the Stream Deck plugin or Codex.

## Command feedback

Codex Deck resolves an agent again by its stable task identity immediately
before sending a command. A task may move to another Micro slot or change its
Mac/Windows owner without leaving the detail view pointed at an obsolete slot.
Agent presses also require a recent locally received snapshot, coalesce repeated
taps while one activation is in flight, and wait for a matching selected-task
snapshot before claiming that the task opened.

Open Settings and choose **Command feedback**:

- **Minimal** (default) keeps successful commands quiet apart from native
  haptic feedback and still surfaces failures.
- **Detailed** shows a compact receipt progressing from sending, through host
  confirmation, to task/state confirmation.
- **Off** suppresses command feedback. **Always show critical errors** remains
  independently available and is enabled by default.

Receipt text distinguishes an offline host, stale app snapshot, missing task,
relay rejection, timeout, and a host-confirmed command whose follow-up snapshot
did not arrive. Generic Micro commands truthfully report execution by the host;
only an observed task-selection snapshot is described as an opened task.

## Attention Center and notifications

Tap the bell in the dashboard header to open the local Attention Center. It
stores at most 100 events from the last seven days and can filter them by Mac,
Windows, approval, response, completion, or error. Opening an event resolves
its canonical task identity against the newest merged snapshot; if the task no
longer exists, the event remains as a truthful unavailable record instead of
opening a different slot.

The first live snapshot received from a computer establishes its baseline and
does not replay historical states as new events. Mirrored Mac/Windows copies are
deduplicated through the same canonical thread identity used for command
routing, and completion revisions allow a genuinely new completion to be
recorded even when the visible status string has not changed.

Notifications are off by default. Enable **Attention notifications** in
Settings to request iOS permission. Task titles remain hidden in notification
content unless **Show task titles** is enabled. Notification taps open the exact task
detail inside the authenticated app; they never execute Approve, Reject, or
another Codex command directly. Local notifications are best effort while the
app is active or briefly refreshing. Reliable delivery while the app is
terminated still requires the future opt-in APNs phase described below.

## Follow a task on the Lock Screen

Hold an agent key to open its detail view, then tap **Follow on Lock Screen**.
Codex Deck follows the task's canonical identity rather than its current Micro
slot, so a slot move, owner change, or mirrored Mac/Windows copy does not switch
the Live Activity to a different task. The first release follows one task at a
time.

The Live Activity shows the current status, computer, relative activity time,
context-window percentage, and freshness on the Lock Screen and Dynamic Island.
Tapping it opens the exact current task detail. If the authenticated relay stops
providing fresh snapshots, the activity changes to **Last known** instead of
presenting cached state as live. A completed task remains visible for a
60-second grace period; **Stop following** ends it immediately.

Only bounded display metadata and the canonical task identity enter the
ActivityKit state. Relay tokens, endpoints, composer text, and chat content are
never included. Updates are local and best effort while the app is suspended;
reliable updates after suspension or termination require the optional future
APNs phase.

## Home Screen and Lock Screen widgets

After installing and opening the app once, long-press the Home Screen, tap `+`, and search for **Codex Deck**. The widget extension offers:

- **Codex Capacity** — small weekly ring, medium five-hour/weekly overview, and Lock Screen circular or rectangular variants.
- **Current Codex Agent** — the currently working/selected agent, falling back to the most recently active agent, with optional context progress.
- **Codex Agent Board** — three agents in medium size or six in large size, with Mac/Windows, native state colors, and context progress where available.
- **Codex Command** — one configurable Micro key for the Home Screen or Lock Screen.
- **Codex Control Deck** — four configurable Micro keys in a medium widget.

Edit a command widget to choose any supported native keycap and target the currently selected computer, the Mac, or Windows. A command widget opens Codex Deck Mobile and dispatches through the existing authenticated relay; the relay token never enters the widget snapshot or shared preferences.

The app and widget extension share only a bounded, content-minimal snapshot through the App Group configured locally during installation. It contains agent titles/status, host labels, account usage, and timestamps, but no endpoint or authentication token. The repository does not commit a developer's personal team, bundle identifier, or App Group.

WidgetKit controls refresh frequency to protect battery life. The app requests a reload when a real snapshot changes, each timeline asks for a periodic refresh, and an iOS `BGAppRefreshTask` opportunistically reconnects the authenticated nodes for up to 20 seconds to refresh the shared snapshot. iOS chooses when that task runs; a suspended app cannot keep the relay WebSocket continuously alive. Widgets therefore show the latest safely cached state and its relative timestamp rather than claiming real-time background delivery. Truly immediate background updates require a future opt-in APNs/WidgetKit push path.

On iOS 26, WidgetKit supplies the system Liquid Glass container itself. Codex Deck therefore uses `containerBackground(for: .widget)` instead of baking a blur into the widget, marks semantic rings and controls as accentable, and keeps the remaining surfaces adaptive for Light, Dark, tinted, and accented widget rendering modes.

The foreground app suppresses redundant WidgetKit timeline reloads when only a snapshot timestamp changed. Material agent, status, context, connection, or usage changes still reload the widgets immediately; timestamp-only cache writes are bounded to avoid unnecessary main-process and widget-extension work.

## Pair on the same Wi-Fi (recommended first setup)

Nearby pairing needs no Tailscale account. The computer creates a private
P-256 TLS identity and a random 256-bit relay token, opens a QR code, and
advertises `_codexdeck._tcp` through Bonjour. The Bonjour record contains only
the stable host ID, display name, private address, port, and certificate
fingerprint. The token is delivered only inside the QR code and stored in the
iPhone Keychain.

Mac, from the installed launcher directory:

```zsh
./start-codex-deck.sh mobile-local-config
```

The installed watcher detects the new configuration automatically; neither
Codex nor the watcher has to restart. Scan the QR code with the iPhone Camera.

Windows, from the installed launcher directory:

```powershell
.\Configure-CodexDeckMobile.ps1 -Local
```

Reload only the Codex Deck Stream Deck plugin so the new listener starts, then
scan the QR code. If Windows Firewall asks, allow Node.js on **Private
networks** only. Do not enable Public networks.

The app continuously rediscovers a paired computer's current RFC 1918 address,
but accepts an endpoint update only when both its stable `hostId` and pinned
certificate fingerprint match. Run the same command again to reopen the same
QR. Add `--rotate` on Mac or `-Rotate` on Windows to deliberately replace the
certificate and token; scan the new QR afterward.

Nearby mode is intentionally local-only. It accepts `10/8`, `172.16/12`, or
`192.168/16`, never a public address, wildcard listener, Tailscale address, or
the Chrome DevTools port.

## Security model

```text
iPhone app
  -> Nearby: wss://private-LAN-IP:47653 (pinned self-signed TLS + token)
     or Remote: wss://computer.tailnet.ts.net (Tailscale Serve + tailnet ACLs)
  -> authenticated typed Codex Deck relay
  -> local Codex Deck bridge
  -> 127.0.0.1:<random CDP port>
  -> installed Codex renderer
```

Chrome DevTools always stays on loopback. Nearby mode exposes only the narrow,
authenticated relay on one explicit private address and pins its certificate
on the phone. Remote mode keeps that relay on `127.0.0.1`; Tailscale Serve
terminates HTTPS and forwards WebSocket traffic privately. Never use Funnel,
public port forwarding, `0.0.0.0`, or a public IP for either mode.

Every relay client must authenticate within three seconds with a random 256-bit token. Payloads are capped at 64 KiB, and the protocol accepts only the existing typed Micro commands. The app accepts production endpoints only with `wss://`.

## Configure remote access with Tailscale

Nearby and Tailscale profiles are independent. Keep Nearby for instant use on
the same Wi-Fi and add the Tailscale profile when the phone must work away from
home. The project does not ship a hosted relay: reliable internet traversal
would require an operated authentication, TURN/push, and abuse-control service.

For a short setup that explicitly proves Tailscale is not carrying the
connection, use the [Nearby local-Wi-Fi test](IOS_LOCAL_WIFI.md).

### Mac node

The macOS watcher already contains the required node server. If the existing Windows+Mac relay uses an SSH tunnel, keep its loopback listener and token:

```zsh
./start-codex-deck.sh relay-config 127.0.0.1 47651
tailscale serve --bg --https=47651 http://127.0.0.1:47651
```

`relay-config` rotates the token. If Windows already uses the prior token, update its `Configure-CodexDeckRelay.ps1` pairing after rotation. Multiple authenticated clients can use the node simultaneously.

Use `tailscale serve status` to find the private HTTPS hostname. In the iPhone app, pair it as `wss://<mac-name>.<tailnet>.ts.net:47651` with the printed token.

### Windows node

From the installed Windows launcher directory:

```powershell
.\Configure-CodexDeckMobile.ps1
tailscale serve --bg --https=47652 http://127.0.0.1:47652
```

Reload only the Codex Deck Stream Deck plugin so it reads the new optional server config. Do not restart Codex. Pair the `wss://` Windows hostname and printed token in the iPhone app.

This server is separate from `relay-client.json`: the existing Windows plugin can continue consuming Mac snapshots while it serves its local Windows snapshot to the phone. Usage is account-scoped, so the phone displays the freshest of the two authenticated snapshots.

## Disable

Windows:

```powershell
.\Configure-CodexDeckMobile.ps1 -Local -Disable
.\Configure-CodexDeckMobile.ps1 -Disable
tailscale serve --https=47652 off
```

Mac:

```zsh
./start-codex-deck.sh mobile-local-disable
./start-codex-deck.sh relay-disable
tailscale serve --https=47651 off
```

Reload the Windows plugin after disabling its node. Removing a computer inside the iPhone app deletes its token from Keychain and its cached snapshot; it does not alter either desktop or user icons.

## Build locally

For a first physical-iPhone installation, follow the step-by-step
[iPhone installation guide](IOS_INSTALL.md). The project has no CocoaPods or
third-party Swift package dependencies.

An unsigned compile check can be run with the active Xcode installation:

```zsh
xcodebuild -project ios/CodexDeckMobile.xcodeproj \
  -scheme CodexDeckMobile \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO build
```

A Simulator runtime is intentionally not downloaded by the repository.

## Protocol boundary and future work

The app consumes relay protocol 1 without changing it. A future secure hub can use each snapshot's stable `host.hostId`, content-free agent slots and host-session catalog, account usage, and typed native command dispatcher. The current bounded background refresh improves widget freshness without changing the relay. Immediate push-driven status delivery still requires a separate opt-in APNs/WidgetKit push service design.
