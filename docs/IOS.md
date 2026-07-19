# Codex Deck Mobile for iPhone

Codex Deck Mobile is a native SwiftUI companion for the existing Stream Deck integration. It connects directly to authenticated Codex Deck nodes, merges Mac and Windows task snapshots on the phone, and routes each agent command to the computer that owns that task. The Stream Deck plugin keeps its current behavior and does not depend on the phone.

The app is currently source-only and not published. It requires iOS 17 or newer.

## What the first native build includes

- A fast cached dashboard with connection health and last-known state.
- Six globally merged agent cards with Mac/Windows ownership badges.
- Working, unread, awaiting approval/response, error, complete, idle, and offline-aware states.
- Account-scoped 5-hour and weekly capacity, plus reset credits.
- Host-selectable Fast, Approve, Decline, Fork, Plan, Back, New Task, Send, and reasoning controls.
- Multiple independently reconnecting `wss://` node connections.
- Relay tokens stored as device-only Keychain items rather than in app preferences.

The interface is original SwiftUI using SF Symbols. Official OpenAI keycap artwork is not bundled, copied, or downloaded.

## Security model

```text
iPhone app
  -> wss://computer.tailnet.ts.net (Tailscale Serve + tailnet ACLs)
  -> 127.0.0.1:47652 (authenticated typed relay)
  -> local Codex Deck bridge
  -> 127.0.0.1:<random CDP port>
  -> installed Codex renderer
```

Chrome DevTools never leaves loopback. The mobile listener also stays on `127.0.0.1`; Tailscale Serve terminates HTTPS and forwards WebSocket traffic privately. Never use Funnel, public port forwarding, `0.0.0.0`, or a public IP for this feature.

Every relay client must authenticate within three seconds with a random 256-bit token. Payloads are capped at 64 KiB, and the protocol accepts only the existing typed Micro commands. The app accepts production endpoints only with `wss://`.

## Configure the Mac node

The macOS watcher already contains the required node server. If the existing Windows+Mac relay uses an SSH tunnel, keep its loopback listener and token:

```zsh
./start-codex-deck.sh relay-config 127.0.0.1 47651
tailscale serve --bg --https=47651 http://127.0.0.1:47651
```

`relay-config` rotates the token. If Windows already uses the prior token, update its `Configure-CodexDeckRelay.ps1` pairing after rotation. Multiple authenticated clients can use the node simultaneously.

Use `tailscale serve status` to find the private HTTPS hostname. In the iPhone app, pair it as `wss://<mac-name>.<tailnet>.ts.net:47651` with the printed token.

## Configure the Windows node

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
.\Configure-CodexDeckMobile.ps1 -Disable
tailscale serve --https=47652 off
```

Mac:

```zsh
./start-codex-deck.sh relay-disable
tailscale serve --https=47651 off
```

Reload the Windows plugin after disabling its node. Removing a computer inside the iPhone app deletes its token from Keychain and its cached snapshot; it does not alter either desktop or user icons.

## Build locally

This Mac uses Xcode Beta:

```zsh
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  xcodebuild -project ios/CodexDeckMobile.xcodeproj \
  -scheme CodexDeckMobile \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO build
```

Open `ios/CodexDeckMobile.xcodeproj` to select a signing team and install on a physical iPhone. A Simulator runtime is intentionally not downloaded by the repository.

## Protocol boundary and future work

The app consumes relay protocol 1 without changing it. A future secure hub can use each snapshot's stable `host.hostId`, content-free agent slots and host-session catalog, account usage, and typed native command dispatcher. Push notifications and background status delivery will require a separate opt-in service design; iOS does not keep an arbitrary WebSocket alive indefinitely after the app is suspended.
