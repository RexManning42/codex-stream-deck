[CmdletBinding()]
param(
  [string]$MacAddress,
  [string]$Token,
  [string]$SshHost,
  [ValidateRange(1024, 65535)][int]$Port = 47651,
  [ValidateRange(1024, 65535)][int]$RemotePort = 47651,
  [switch]$Disable
)

$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDeck'
$configPath = Join-Path $stateRoot 'relay-client.json'

if ($Disable) {
  Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $stateRoot 'control-target.json') -Force -ErrorAction SilentlyContinue
  Write-Host 'Mac relay removed. Restart only the Stream Deck plugin to apply the change.'
  exit 0
}

if ([string]::IsNullOrWhiteSpace($MacAddress)) { throw 'MacAddress is required.' }
if ([string]::IsNullOrWhiteSpace($Token)) {
  $secureToken = Read-Host 'Paste the Mac relay token (input is hidden)' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try { $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
if ([Text.Encoding]::UTF8.GetByteCount($Token) -lt 32) { throw 'Token must contain at least 32 bytes.' }
if ($MacAddress -match '^(0\.0\.0\.0|::|\[::\]|\*)$') { throw 'Use 127.0.0.1 for an SSH tunnel or the specific Mac Tailscale address, never a wildcard.' }
if (-not [string]::IsNullOrWhiteSpace($SshHost) -and $SshHost -notmatch '^[A-Za-z0-9._-]+$') {
  throw 'SshHost must be a safe SSH hostname or config alias without spaces.'
}
if (-not [string]::IsNullOrWhiteSpace($SshHost) -and $MacAddress -notmatch '^(127\.0\.0\.1|ws://127\.0\.0\.1(?::\d+)?)$') {
  throw 'An automatically managed SSH tunnel must use the Windows loopback address.'
}

$url = if ($MacAddress -match '^ws://') { $MacAddress } else { "ws://${MacAddress}:$Port" }
if ($url -notmatch '^ws://[^/]+(?::\d+)?$') { throw 'MacAddress must be a Tailscale IP/hostname or a ws:// URL without a path.' }

New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
$config = [ordered]@{ enabled = $true; url = $url; token = $Token }
if (-not [string]::IsNullOrWhiteSpace($SshHost)) {
  $config.sshHost = $SshHost
  $config.localPort = $Port
  $config.remotePort = $RemotePort
}
$temporary = "$configPath.$PID.tmp"
[IO.File]::WriteAllText($temporary, (($config | ConvertTo-Json) + "`n"), [Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $configPath -Force
Write-Host "Mac relay configured: $url"
if (-not [string]::IsNullOrWhiteSpace($SshHost)) {
  Write-Host "The Codex Deck watcher will maintain a separate SSH relay tunnel through '$SshHost'."
}
Write-Host 'Restart only the Stream Deck plugin to connect. Codex does not need to restart.'
