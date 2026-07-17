# Contributing

Thanks for helping improve Codex Deck.

## Before opening a pull request

1. Keep the project Windows-only unless the new platform path is tested end to end.
2. Do not commit OpenAI/Elgato proprietary assets, Codex installation files, databases, logs, rollout files, personal paths, or generated release bundles.
3. Do not add hotkey or task-database fallbacks to the native bridge without a separate design discussion.
4. Update compatibility notes when changing renderer integration behavior.
5. Run:

```powershell
npm ci
npm run check
npm test
npm run validate
```

Pull requests should explain the tested Codex version, Stream Deck version, hardware model, and manual verification performed.
