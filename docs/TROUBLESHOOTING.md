# Troubleshooting

## Codex Micro is missing from Settings

- Close all Codex windows.
- Start Codex with `Start Codex Deck.cmd`.
- Keep the launcher folder intact; `runtime-override.mjs` must remain next to the PowerShell script.
- Run this diagnostic from the launcher folder:

```powershell
.\Start-CodexDeck.ps1 -DryRun
```

If the launcher times out after a Codex update, open an issue with the exact Codex version and launcher output.

## Agent keys say Bridge offline

- Confirm Codex was started through the launcher.
- Confirm `%LOCALAPPDATA%\CodexDeck\codex-micro-bridge.json` exists and contains a port number.
- Restart Stream Deck.
- Do not run two launcher-started Codex instances at the same time.

## A key flashes an alert

The native handler was unavailable or the action is not valid in the current composer state. Check that the relevant function is assigned in **Codex Settings > Codex Micro** and that the intended Codex window/composer is active.

## Agent assignments are unexpected

Codex Deck does not choose the six tasks. Open **Codex Settings > Codex Micro > Agent keys** and select pinned, recently updated, priority, or custom assignments. The Stream Deck mirrors those native slots.

## Local command icon does not appear

- Verify the file is in `%LOCALAPPDATA%\CodexDeck\icons`.
- Verify the filename exactly matches the keycap ID reported by Codex, including `+` or `-`.
- Verify the SVG has a numeric `viewBox`.
- Restart Stream Deck after changing icon files.

## Plugin does not appear after installation

Restart Stream Deck. Elgato notes that plugins can fail to appear when the Stream Deck app is still running with elevated state after an install or update.

## What to include in a bug report

- Codex app version (`Get-AppxPackage OpenAI.Codex | Select-Object Version`).
- Stream Deck version and device model.
- Windows version.
- Whether `Start-CodexDeck.ps1 -DryRun` succeeds.
- The relevant Stream Deck plugin log excerpt.
- The exact action that failed.

Do not attach Codex databases, rollout files, authentication data, or the official SVG asset files.
