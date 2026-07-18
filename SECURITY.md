# Security policy

## Supported versions

Only the latest GitHub release is supported.

## Reporting

Do not publish a working exploit, authentication data, Codex databases, rollout files, or local official SVG assets in a public issue. Open a minimal issue asking for a private contact channel and include only the affected Codex Deck version and a non-sensitive summary.

## Important boundary

Codex Deck starts Codex with a Chrome DevTools endpoint bound to `127.0.0.1`. This is intentionally local but remains accessible to processes running as the same Windows or macOS user. Do not expose, forward, or rebind that port to a network interface.

The optional multi-host relay is a separate authenticated, typed protocol. Use only its loopback SSH tunnel or an explicit Tailscale address. Never forward CDP, use wildcard/public listeners, commit relay state, or share pairing tokens in commands, issues, logs, or screenshots.

Release artifacts are audited for private runtime state, known personal setup markers, and protected Codex keycap SVG files. This reduces accidental packaging risk but does not replace review.
