CODEX DECK LAUNCHER

1. Install Node.js 20 or newer.
2. Double-click "Start Codex Deck.cmd" instead of launching Codex normally.
3. Keep that Codex session open while using the Stream Deck plugin.

If Codex is already running from this launcher, running it again reuses the
existing debug session instead of closing and reopening Codex. Use
`Start-CodexDeck.ps1 -ForceRestart` only when you explicitly want a clean
restart.

If Codex was started normally without a debug port, the launcher must restart
that session once. It then starts the installed Codex Windows app with a
loopback-only Chrome DevTools port and enables the Codex Micro UI for that
session. It does not patch the Codex installation or upload any data.

Optional: run `Start-CodexDeck.ps1 -InstallStartup` once to add a hidden
Windows-login shortcut. That starts the bridge automatically after sign-in.
Remove it again with `Start-CodexDeck.ps1 -UninstallStartup`.

This is an unofficial compatibility bridge and may need an update after a Codex
desktop release.
