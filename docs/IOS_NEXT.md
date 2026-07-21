# Codex Deck Mobile implementation roadmap

This document is the implementation source of truth for the next Codex Deck
Mobile work on `codex/ios-app`. It exists so the work can continue safely across
long sessions and context compactions without relying on chat history.

## Baseline

- Starting branch: `codex/ios-app`
- Starting commit: `ab6453a`
- Preserve all existing uncommitted iOS, relay, launcher, widget, and Stream
  Deck work. Do not discard or rewrite unrelated changes.
- Baseline validation on 2026-07-20:
  - `npm run check`: passed
  - `npm test`: 101 passed, 1 Windows-only test skipped, 0 failed
- Keep the existing Stream Deck behavior independent from the iPhone app.
- Keep Relay protocol 1 backward compatible; add only optional fields or
  capability-negotiated commands unless a later migration is explicitly
  approved.
- Do not restart Codex. If a real Codex restart ever becomes necessary, stop
  and ask the user first.

## Implementation status

- 2026-07-20: Phases 1–6 are implemented locally. Stable thread references,
  local snapshot freshness, press/release transactions, confirmation snapshots,
  optional receipt feedback, a bounded Attention Center, baseline-safe event
  derivation, Mac/Windows filters, tombstone details, and opt-in local
  notifications are present. Follow/Unfollow now tracks one canonical task,
  publishes a privacy-bounded Live Activity with Lock Screen and Dynamic Island
  layouts, marks stale relay data as `Last known`, deep-links to the exact live
  detail, and ends after a 60-second completed-state grace period. The generic
  iOS build, repository checks, and all 36 Swift tests pass on the physical
  iPhone. Normal agent taps, hold-for-details, and the Live Activity's real
  transition to `working` were manually verified on the physical iPhone.
  Agent placement follows Codex Micro's native agent mode instead of an
  app-only favorites list; Automatic, Coding, Review, and Mobile keep
  independent lower-key mappings,
  and the selected computer's validated keys can be imported one way without
  writing to Stream Deck or Codex. Per-host diagnostics now show route,
  receipt-local freshness, ping latency, protocol, capabilities, Codex version
  when advertised, native bridge, and certificate state. Sanitized sharing,
  explicit reconnect, changed-certificate refusal, changed-host refusal, and
  duplicate authenticated-host suppression, and the explicit computer
  replacement flow are covered by 36 physical-device Swift tests. Historical
  session completions can no longer resurrect a native idle task after it was
  opened; new completion revisions remain visible until acknowledged. The new
  diagnostics UI still requires manual device QA.
- 2026-07-21 release-stabilization gate: 116 Node tests pass, one Windows-only
  test is skipped on macOS, all 36 Swift tests pass on the physical iPhone, the
  generic unsigned iOS build passes, and Stream Deck validation plus the release
  audit pass. Public source no longer contains a personal Apple Team ID, bundle
  ID, or App Group; local values live in ignored `Local.xcconfig`. One isolated
  renderer timeout after a healthy snapshot is now treated as transient instead
  of briefly flashing every client as degraded. Empty agent keys render one
  geometrically centered plus, and cross-host task completion is reconciled
  against structural rollout state without letting a stale native color persist.
- Phase 7 is deferred for the initial source release. Nearby Wi-Fi is the
  account-free local path and Tailscale is the documented private remote path.
  APNs remains necessary only for reliable updates while the app is terminated.

## Product defaults

### Command feedback

- `Minimal` is the default: success haptic, visible errors, no success toast.
- `Detailed` shows truthful receipt stages such as
  `Sending -> confirmed by host -> task opened`.
- `Off` suppresses success feedback.
- `Always show critical errors` is a separate setting and defaults to enabled.
- Generic commands stop at `Executed by Mac/Windows`; only an observed matching
  snapshot may claim that a task was opened.

### Notifications and privacy

- Request notification permission only when the user enables notifications or
  follows an agent.
- Never place relay tokens, endpoints, composer text, or chat contents in
  widgets, notifications, Live Activities, logs, or shared preferences.
- Add a privacy preference for showing or hiding task titles on the Lock Screen.
- Direct Approve/Reject must never target a task by slot alone. The first safe
  version opens the exact task in the app and asks for confirmation.

### Layout ownership

- Lower-key work profiles are app-local; agent placement remains Codex-owned.
- Never overwrite a Stream Deck layout automatically.
- Implement one-way import before considering explicit, capability-negotiated
  two-way synchronization.

## Phase 1: identity, freshness, and command transactions

1. Create one canonical thread-identity resolver shared by agent lists,
   details, events, receipts, and follow state.
2. Resolve an agent from current store state at action time. Do not retain a
   stale `RoutedAgent` value as the command target.
3. Allow source slot, owning host, reachable route, title, and status to change
   while a detail view or follow session is open.
4. Track snapshot freshness from the phone's local receipt time, not remote
   computer clocks.
5. Add a command transaction coordinator that:
   - resolves the current task owner;
   - verifies connection and snapshot freshness;
   - sends press and release without duplicating the press;
   - correlates the relay result with its request ID;
   - waits for a matching confirmation snapshot when the action supports it;
   - coalesces repeated taps per thread while a transaction is active;
   - reports typed failure reasons.
6. Make reconnect behavior explicit across app lifecycle, sleep/wake, local IP
   changes, Wi-Fi/cellular changes, and Tailscale transitions.
7. Narrow SwiftUI observation so high-frequency snapshots update only views
   whose semantic state changed.

## Phase 2: optional command receipts

1. Add the command-feedback picker and critical-error toggle to Settings.
2. Replace generic success toasts with a bounded receipt model.
3. Support stages:
   - sending;
   - host confirmed;
   - state confirmed/task opened where observable;
   - failed with a typed reason.
4. Distinguish offline host, disconnected relay, stale snapshot, missing task,
   rejected command, timeout, and missing confirmation snapshot.
5. Show a compact Liquid Glass receipt HUD only in Detailed mode.
6. Retain only a small local diagnostic history and never include task content.

## Phase 3: Attention Center

1. Add a header attention button with an unread badge.
2. Derive bounded local events for approval, response required, completion,
   error, and unread state.
3. Support All, Mac, Windows, and event-type filters.
4. Tap an event to resolve the current task and open its detail view.
5. Use status-cycle identity and completion revision to deduplicate events.
6. Treat the first live snapshot as a baseline; do not notify for historical
   state on connection or app launch.
7. Deduplicate mirrored Mac/Windows copies of the same thread.
8. Preserve a tombstone when an event's task no longer exists.
9. Add local notifications for enabled event types. Notification actions first
   open an exact, authenticated in-app confirmation flow.

## Phase 4: Follow this agent and Live Activity

1. Add Follow/Unfollow to the live agent detail view.
2. Support one followed thread in the first release.
3. Resolve it continuously by canonical thread identity, including owner and
   slot changes.
4. Add shared ActivityKit attributes and a Live Activity to the existing
   widget extension.
5. Show status, host, elapsed time, context usage, and freshness.
6. Deep-link from the Live Activity to the exact current agent detail.
7. Show `Last known` when the relay is stale or offline.
8. Notify for approval, response required, error, and completion according to
   the user's notification settings.
9. End manually or automatically after a completed-state grace period.
10. Document local follow as best effort while the app is suspended. Reliable
    closed-app updates require the later optional APNs phase.

## Phase 5: native agent modes and app key layouts

1. Preserve Codex Micro's Priority, Fixed Assignment, Most Recent, and Pinned
   Tasks ordering as the sole source for the six agent slots.
2. Do not add an app-only favorites layer that competes with those modes.
3. Add local profiles such as Automatic, Coding, Review, and Mobile.
4. Allow a six-agent Mac/Windows mixture and per-profile lower-key assignments.
5. Keep the current automatic globally merged layout as the default.
6. Add a safe `Import from Stream Deck` path before any write-back support.
7. Defer two-way synchronization until there is an explicit typed capability,
   conflict handling, tests, and user confirmation.

## Phase 6: host diagnostics and repair

For each paired computer, show:

- Ready, Connecting, Degraded, or Offline;
- Nearby or Tailscale route;
- last locally received snapshot;
- relay round-trip latency;
- relay protocol and advertised capabilities;
- Codex version when provided;
- native Micro bridge health;
- certificate-pinning state;
- a non-mutating connection test;
- sanitized diagnostics suitable for sharing.

Repair rules:

- Never trust a changed TLS fingerprint silently.
- Surface token or certificate rotation as `Re-pair required`.
- Do not merge a new host ID based only on computer name.
- Offer an explicit `Replace existing computer` flow after re-pairing.
- Deduplicate multiple profiles that resolve to the same authenticated host.
- Warn about different accounts only if hosts expose a privacy-safe stable
  account-scope identifier. Do not infer account mismatch from usage values.

## Phase 7: optional reliable remote push

This phase requires a separate product and deployment decision.

- Nodes send outbound, signed, minimal status transitions to an optional push
  relay.
- APNs updates notifications and Live Activities while the app is suspended or
  terminated.
- Push payloads contain only opaque host/thread identity, status, revision, and
  encrypted or omitted display metadata.
- Commands continue to use the authenticated Codex Deck relay; APNs is not a
  general command channel.
- Never expose Chrome DevTools or the local relay publicly.
- Ship Local Follow as best effort without requiring an account; offer Remote
  Follow only when the push design is implemented and verified.

## Required edge-case coverage

- One task mirrored by Mac and Windows.
- Slot moves during a press transaction.
- Task owner changes after sleep/wake or a remote session.
- Host disconnects between press and release.
- Repeated rapid taps.
- Already-open task is pressed again.
- Snapshot references a task no longer present in Codex.
- Computer reinstall creates a new host ID.
- Wi-Fi, cellular, local discovery, and Tailscale route transitions.
- Hosts run different compatible app/relay versions.
- Two paired profiles identify the same host.
- Usage windows are missing, unavailable, or stale on one host.
- App and widgets distinguish cached `Last known` data from live data.
- Token or pinned certificate rotates.
- Initial and duplicate snapshots do not create duplicate events.
- App relaunch does not replay historical notifications.
- Notification or Live Activity permission is denied.
- Followed task is renamed, archived, removed, mirrored, or changes owner.
- Background refresh expires or is cancelled.
- Remote clock skew does not affect freshness or ordering.

## Validation gates

Run after each implementation phase where applicable:

```zsh
npm run check
npm test
npm run build
xcodebuild -project ios/CodexDeckMobile.xcodeproj \
  -scheme CodexDeckMobile \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO build
```

Also add focused Swift unit tests for reducers, identity resolution, command
transactions, preferences, follow state, and event deduplication. Final manual
verification must cover Mac-only, Windows-only, dual-host, Nearby, Tailscale,
foreground/background, widgets, notifications, normal agent taps, detail-view
activation, and Live Activity behavior on the real iPhone.

Do not claim reliable remote Live Activity delivery until the APNs path exists
and has been tested with the app terminated.
