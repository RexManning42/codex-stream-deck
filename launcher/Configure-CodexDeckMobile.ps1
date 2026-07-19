[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)][int]$Port = 47652,
  [switch]$Disable
)

$ErrorActionPreference = 'Stop'
$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDeck'
$configPath = Join-Path $stateRoot 'mobile-relay-server.json'

if ($Disable) {
  Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue
  Write-Host 'iPhone relay disabled. Reload only the Codex Deck Stream Deck plugin.'
  Write-Host "If Tailscale Serve was configured for this port, disable that mapping separately with: tailscale serve --https=$Port off"
  exit 0
}

New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
$bytes = [byte[]]::new(32)
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($bytes) }
finally { $random.Dispose() }
$token = [Convert]::ToBase64String($bytes)
$config = [ordered]@{
  enabled = $true
  listenHost = '127.0.0.1'
  port = $Port
  token = $token
}
$temporary = "$configPath.$PID.tmp"
[IO.File]::WriteAllText($temporary, (($config | ConvertTo-Json) + "`n"), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $configPath -Force

Write-Host "iPhone relay configured on 127.0.0.1:$Port. Reload only the Codex Deck Stream Deck plugin."
Write-Host "Then expose it privately with: tailscale serve --bg --https=$Port http://127.0.0.1:$Port"
Write-Host 'Pair the iPhone app with the wss:// URL printed by Tailscale and this token:'
Write-Host $token
Write-Warning 'Treat the token as a password. Running this command again rotates it.'
