# Contributing

Thanks for helping improve Codex Deck.

## Before opening a pull request

1. Preserve independent Windows-only, macOS-only, and optional multi-host operation. State clearly which paths received automated, live-app, and physical-device testing.
2. Do not commit OpenAI/Elgato proprietary assets, Codex installation files, databases, logs, rollout files, personal paths, or generated release bundles.
3. Do not add hotkey or task-database fallbacks to the native bridge without a separate design discussion.
4. Update compatibility notes when changing renderer integration behavior.
5. Run:

```powershell
npm ci
npm run check
npm test
npm run validate
npm run audit:release
```

Pull requests should explain the tested Codex version, Stream Deck version, operating system, hardware model, and manual verification performed. Never describe fixture or build validation as physical-device verification.
