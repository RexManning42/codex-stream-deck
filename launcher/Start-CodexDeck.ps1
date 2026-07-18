param(
  [switch]$DryRun,
  [switch]$ForceRestart,
  [switch]$InstallStartup,
  [switch]$UninstallStartup
)

$ErrorActionPreference = 'Stop'

if ($InstallStartup -and $UninstallStartup) {
  throw 'Use either -InstallStartup or -UninstallStartup, not both.'
}

function Get-StartupShortcutPath {
  Join-Path ([Environment]::GetFolderPath('Startup')) 'Codex Deck.lnk'
}

function Get-WatcherStopPath {
  Join-Path (Join-Path $env:LOCALAPPDATA 'CodexDeck') 'watcher.stop'
}

function Start-BridgeWatcher {
  $watcherPath = Join-Path $PSScriptRoot 'Watch-CodexDeck.ps1'
  if (-not (Test-Path -LiteralPath $watcherPath)) { throw "Codex Deck watcher not found: $watcherPath" }
  $powerShellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  Start-Process -FilePath $powerShellPath -WindowStyle Hidden -ArgumentList @(
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', "`"$watcherPath`""
  )
}

function Set-StartupShortcut {
  $shortcutPath = Get-StartupShortcutPath
  $watcherPath = Join-Path $PSScriptRoot 'Watch-CodexDeck.ps1'
  if (-not (Test-Path -LiteralPath $watcherPath)) { throw "Codex Deck watcher not found: $watcherPath" }
  $stopPath = Get-WatcherStopPath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stopPath) | Out-Null
  Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')
  $shortcut.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watcherPath`" -RecoverExistingSession"
  $shortcut.WorkingDirectory = $PSScriptRoot
  $shortcut.Description = 'Keep the Codex Deck bridge available while Codex is running'
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,44"
  $shortcut.Save()
  Start-BridgeWatcher
  Write-Host "Startup shortcut installed: $shortcutPath"
  Write-Host 'The background watcher is running. An existing normal Codex session was not restarted.'
}

if ($InstallStartup) {
  Set-StartupShortcut
  exit 0
}

if ($UninstallStartup) {
  $shortcutPath = Get-StartupShortcutPath
  $stopPath = Get-WatcherStopPath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stopPath) | Out-Null
  [IO.File]::WriteAllText($stopPath, [DateTimeOffset]::UtcNow.ToString('o'), [Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
    Write-Host "Startup shortcut removed: $shortcutPath"
  } else {
    Write-Host 'No Codex Deck startup shortcut was installed.'
  }
  exit 0
}

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

function Get-HealthyDebugPort($Processes) {
  foreach ($process in $Processes) {
    if ([string]::IsNullOrWhiteSpace($process.CommandLine)) { continue }
    if ($process.CommandLine -match '--remote-debugging-port=(\d+)') {
      $candidate = [int]$Matches[1]
      try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$candidate/json/version" -TimeoutSec 1
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { return $candidate }
      }
      catch { }
    }
  }
  return $null
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) { throw 'Node.js 20 or newer is required. Install it from https://nodejs.org/ and try again.' }
$major = [int]((& $node.Source --version).TrimStart('v').Split('.')[0])
if ($major -lt 20) { throw "Node.js 20 or newer is required. Found: $(& $node.Source --version)" }

$codex = Get-CodexInstallation
$processes = Get-CodexProcesses $codex.Root
$existingPort = Get-HealthyDebugPort $processes
if ($DryRun) {
  Write-Host "Codex version: $($codex.Version)"
  Write-Host "Executable: $($codex.Executable)"
  Write-Host "Node: $(& $node.Source --version)"
  if ($existingPort) { Write-Host "Reusable debug port: $existingPort" }
  elseif ($processes.Count -gt 0) { Write-Host 'Codex is running without a reusable debug bridge; a restart is required.' }
  else { Write-Host 'Codex is not running; the launcher will start it.' }
  exit 0
}

$port = $existingPort
if ($ForceRestart -or -not $port) {
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
}

if ($existingPort -and -not $ForceRestart) {
  Write-Host "Reusing the existing Codex session on loopback port $port..."
}
else {
  Write-Host "Starting Codex $($codex.Version) with a loopback-only bridge on port $port..."
  Start-Process -FilePath $codex.Executable -ArgumentList @(
    '--remote-debugging-address=127.0.0.1',
    "--remote-debugging-port=$port"
  )
}

$stateRoot = Join-Path $env:LOCALAPPDATA 'CodexDeck'
$statePath = Join-Path $stateRoot 'codex-micro-bridge.json'
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
[IO.File]::WriteAllText(
  $statePath,
  (@{ port = $port; updatedAt = [DateTimeOffset]::UtcNow.ToString('o') } | ConvertTo-Json -Compress),
  [Text.UTF8Encoding]::new($false)
)

$runtimeScript = Join-Path $PSScriptRoot 'runtime-override.mjs'
if (-not (Test-Path -LiteralPath $runtimeScript)) {
  $runtimeScript = Join-Path $PSScriptRoot '..\release\codex-deck-launcher\runtime-override.mjs'
}
if (-not (Test-Path -LiteralPath $runtimeScript)) {
  throw 'The bundled runtime-override.mjs is missing. Run npm run build or use the extracted release launcher folder.'
}

& $node.Source $runtimeScript $port
if ($LASTEXITCODE -ne 0) { throw 'The Codex Micro runtime could not be enabled.' }

Write-Host 'Codex Deck is ready. Keep this Codex session open while using Stream Deck.'
