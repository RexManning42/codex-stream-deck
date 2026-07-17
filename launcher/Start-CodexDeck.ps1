param([switch]$DryRun)

$ErrorActionPreference = 'Stop'

function Get-CodexInstallation {
  $package = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue |
    Sort-Object Version -Descending |
    Select-Object -First 1
  if ($null -eq $package -or [string]::IsNullOrWhiteSpace($package.InstallLocation)) {
    throw 'The OpenAI Codex Windows app is not installed.'
  }
  $appRoot = Join-Path $package.InstallLocation 'app'
  $executable = Join-Path $appRoot 'ChatGPT.exe'
  if (-not (Test-Path -LiteralPath $executable)) { throw "Codex executable not found: $executable" }
  [pscustomobject]@{ Root = [IO.Path]::GetFullPath($appRoot).TrimEnd('\'); Executable = $executable; Version = $package.Version.ToString() }
}

function Get-CodexProcesses([string]$AppRoot) {
  $prefix = $AppRoot.TrimEnd('\') + '\'
  @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_.ExecutablePath) -and
    $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
  })
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) { throw 'Node.js 20 or newer is required. Install it from https://nodejs.org/ and try again.' }
$major = [int]((& $node.Source --version).TrimStart('v').Split('.')[0])
if ($major -lt 20) { throw "Node.js 20 or newer is required. Found: $(& $node.Source --version)" }

$codex = Get-CodexInstallation
if ($DryRun) {
  Write-Host "Codex version: $($codex.Version)"
  Write-Host "Executable: $($codex.Executable)"
  Write-Host "Node: $(& $node.Source --version)"
  exit 0
}

$processes = Get-CodexProcesses $codex.Root
if ($processes.Count -gt 0) {
  Write-Host "Closing $($processes.Count) Codex process(es)..."
  foreach ($process in ($processes | Sort-Object ParentProcessId -Descending)) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
  $deadline = (Get-Date).AddSeconds(10)
  do { Start-Sleep -Milliseconds 250; $remaining = Get-CodexProcesses $codex.Root }
  while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)
  if ($remaining.Count -gt 0) { throw 'Some Codex background processes could not be closed.' }
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDeck'
$statePath = Join-Path $stateRoot 'codex-micro-bridge.json'
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
[IO.File]::WriteAllText(
  $statePath,
  (@{ port = $port; updatedAt = [DateTimeOffset]::UtcNow.ToString('o') } | ConvertTo-Json -Compress),
  [Text.UTF8Encoding]::new($false)
)

Write-Host "Starting Codex $($codex.Version) with a loopback-only bridge on port $port..."
Start-Process -FilePath $codex.Executable -ArgumentList @(
  '--remote-debugging-address=127.0.0.1',
  "--remote-debugging-port=$port"
)

& $node.Source (Join-Path $PSScriptRoot 'runtime-override.mjs') $port
if ($LASTEXITCODE -ne 0) { throw 'The Codex Micro runtime could not be enabled.' }

Write-Host 'Codex Deck is ready. Keep this Codex session open while using Stream Deck.'
