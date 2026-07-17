# Security policy

## Supported versions

Only the latest GitHub release is supported.

## Reporting

Do not publish a working exploit, authentication data, Codex databases, rollout files, or local official SVG assets in a public issue. Open a minimal issue asking for a private contact channel and include only the affected Codex Deck version and a non-sensitive summary.

## Important boundary

Codex Deck starts Codex with a Chrome DevTools endpoint bound to `127.0.0.1`. This is intentionally local but remains accessible to processes running on the same Windows account. Do not expose, forward, or rebind that port to a network interface.
