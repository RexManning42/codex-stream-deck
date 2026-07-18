# Windows + Mac multi-host relay

This optional mode keeps the physical Stream Deck and Stream Deck software on Windows while controlling both desktop Codex apps. Each computer still has a fully independent local bridge; disabling the relay returns them to normal single-host behavior.

```text
Stream Deck -> Windows plugin -> local Windows Codex
                           \-> authenticated relay -> local Mac Codex
```

The relay never exposes Chrome DevTools. It forwards only typed Codex Deck commands and six native agent snapshots.

## Before pairing

1. Complete [Windows setup](WINDOWS.md), including `-InstallStartup`.
2. Complete [macOS setup](MACOS.md), including `install`.
3. Confirm both local bridges work independently.
4. Use either:
   - **SSH tunnel (recommended when SSH already works):** Mac listens on loopback and the Windows watcher maintains a dedicated `ssh -N` tunnel.
   - **Tailscale:** Mac listens on its explicit tailnet address.

Never use `0.0.0.0`, a public IP, or router port forwarding. Codex Deck rejects wildcard and arbitrary public-IP relay addresses.

## Pair with SSH

On the Mac:

```zsh
./start-codex-deck.sh relay-config 127.0.0.1
```

This creates a random 256-bit token in `~/Library/Application Support/CodexDeck/relay-server.json` with user-only permissions. Treat the printed token as a password.

On Windows, run the matching configurator and omit `-Token` so the secret is entered through a hidden prompt rather than appearing on the command line:

```powershell
.\Configure-CodexDeckRelay.ps1 `
  -MacAddress 127.0.0.1 `
  -SshHost '<Mac SSH hostname or config alias>'
```

The persistent Windows watcher maintains this dedicated tunnel after sign-in and reconnects it after network interruptions. It does not adopt or depend on Codex desktop's remote-CLI SSH process.

Restart only the Stream Deck plugin or Stream Deck app after pairing. Do not restart Codex.

## Pair with Tailscale

On the Mac, substitute its specific Tailscale IP or `*.ts.net` name:

```zsh
./start-codex-deck.sh relay-config 100.x.y.z
```

On Windows:

```powershell
.\Configure-CodexDeckRelay.ps1 -MacAddress 100.x.y.z
```

Enter the token in the hidden prompt. The relay accepts loopback, Tailscale IPv4 (`100.64.0.0/10`), Tailscale IPv6, and `*.ts.net` targets only.

## Stream Deck behavior

- The six agent keys are one globally ordered Windows+Mac list.
- Each visible tile receives a small `W` or `M` badge and routes to its owning desktop.
- Add **Windows / Mac Target** to page 2. It switches action slots, joystick, encoder, reasoning, standalone keycaps, and New Task between computers.
- Agent keys ignore the selected target because each task already knows its owner.
- The selected target survives plugin and relay restarts. If Mac is selected while offline, the key visibly fails instead of silently executing on Windows.

### Ownership and SSH mirrors

Codex's built-in remote-SSH feature can mirror a Mac-backed task into the Windows renderer. Codex Deck does not confuse that CLI connection with the Mac desktop app. In multi-host mode it compares exact local rollout **filenames** on both hosts to find the owning desktop; it never reads rollout contents, prompts, responses, or project names.

For the same cloud task visible on both hosts, live status and selection are merged while commands route to the rollout owner. Ownership is host-generic and contains no hard-coded task IDs or project names.

### Ordering boundary

Native activity timestamps are used when available. Otherwise Codex Deck retains the last observed assignment, title, selection, or status change. Connecting a second host does not make old idle tasks appear recent. Immediately after first pairing, historical ordering between already-idle mirrored tasks remains best effort when Codex exposes no timestamp; activity observed after pairing is ordered exactly.

## Disable or rotate

Mac:

```zsh
./start-codex-deck.sh relay-disable
```

Windows:

```powershell
.\Configure-CodexDeckRelay.ps1 -Disable
```

Disabling Windows also removes the persisted Mac control target so single-host mode resumes locally. Run `relay-config` again to rotate the token, then reconfigure Windows. Never commit either relay JSON file or paste its token into an issue, log, shell command, or screenshot.
