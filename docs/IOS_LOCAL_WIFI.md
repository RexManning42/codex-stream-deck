# Test the iPhone app on local Wi-Fi without Tailscale

Nearby mode connects the iPhone directly to one Mac or Windows computer on the
same private Wi-Fi. It does not use Tailscale, the internet, or Chrome DevTools.
The existing Tailscale profile can remain saved as a separate remote route.

## Before pairing

- Put the iPhone and computer on the same normal Wi-Fi network. Guest networks
  and access points with client isolation usually block device-to-device traffic.
- Keep Wi-Fi enabled on the phone.
- Under **iPhone Settings > Privacy & Security > Local Network**, allow
  **Codex Deck**.
- Install the normal Codex Deck launcher or watcher on the computer first.

## Enable a Nearby node

On macOS, open Terminal in the extracted macOS launcher directory and run:

```zsh
./start-codex-deck.sh mobile-local-config
```

The installed watcher notices the new configuration automatically. Codex does
not need to restart.

On Windows, open PowerShell in the extracted Windows launcher directory and run:

```powershell
.\Configure-CodexDeckMobile.ps1 -Local
```

If Windows Firewall asks, allow Node.js on **Private networks** only. Then reload
only the Codex Deck Stream Deck plugin so it reads the optional listener config;
do not restart Codex.

Each command opens a private pairing QR code. Scan it with the normal iPhone
Camera app and accept **Open in Codex Deck**. Do not share the QR code: it
contains the authentication secret and pinned certificate identity.

## Prove the connection is not using Tailscale

1. Open Codex Deck on the iPhone and wait until the newly paired computer shows
   **Nearby** and **Connected**.
2. Leave Wi-Fi on, then turn Tailscale off on the iPhone.
3. In Codex Deck, open **Settings > Computers**, select the Nearby profile, and
   use its connection test.
4. Return to the dashboard. Agent states and usage should update, and a safe
   control such as selecting an agent should return a command receipt.
5. Confirm the route remains **Nearby**. A private endpoint begins with
   `10.`, `172.16` through `172.31`, or `192.168`; it is not a `*.ts.net` name.

Turning Tailscale off before a Nearby profile has been added will disconnect an
existing remote-only profile. That is expected and does not indicate a bug.

## If Nearby still does not connect

- Confirm both devices are on the same SSID and neither is on guest Wi-Fi.
- Toggle the iPhone's Local Network permission off and back on, then reopen the app.
- Temporarily disable another VPN or network filter that may suppress Bonjour.
- Re-run the platform command without a rotate option. Rotating credentials
  invalidates the older QR profile and should be reserved for a lost or exposed
  pairing code.
- On Windows, confirm the firewall rule is Private-only and reload the Stream
  Deck plugin. On macOS, inspect `~/Library/Application Support/CodexDeck/watcher.log`.

To disable only the local listener later:

```zsh
./start-codex-deck.sh mobile-local-disable
```

```powershell
.\Configure-CodexDeckMobile.ps1 -Local -Disable
```

Disabling Nearby does not remove the Tailscale profile, delete user icons, or
change Codex. Full transport and security details are in [the iPhone guide](IOS.md).
