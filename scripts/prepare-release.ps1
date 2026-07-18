param([string]$MacArchivePath)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version
$output = Join-Path $root "outputs\release-v$version"

Push-Location $root
try {
  & npm run check
  if ($LASTEXITCODE -ne 0) { throw 'TypeScript validation failed.' }
  & npm test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
  & npm run validate
  if ($LASTEXITCODE -ne 0) { throw 'Stream Deck validation failed.' }
  & npm run pack
  if ($LASTEXITCODE -ne 0) { throw 'Stream Deck packaging failed.' }
  & node scripts/audit-release.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Release audit failed.' }

  Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $output | Out-Null
  Copy-Item -LiteralPath (Join-Path $root 'com.simeo.codex-deck.streamDeckPlugin') -Destination $output
  Compress-Archive -Path (Join-Path $root 'release\codex-deck-launcher') -DestinationPath (Join-Path $output "codex-deck-launcher-windows-v$version.zip") -CompressionLevel Optimal
  if (-not [string]::IsNullOrWhiteSpace($MacArchivePath)) {
    if (-not (Test-Path -LiteralPath $MacArchivePath -PathType Leaf)) { throw "Mac archive not found: $MacArchivePath" }
    Copy-Item -LiteralPath $MacArchivePath -Destination (Join-Path $output "codex-deck-launcher-macos-v$version.zip")
  } else {
    Write-Warning 'macOS ZIP omitted. Create it with scripts/package-macos-release.sh on macOS so executable bits are preserved, then rerun with -MacArchivePath.'
  }
  $artifacts = Get-ChildItem -LiteralPath $output -File | Sort-Object Name
  $checksums = @($artifacts | ForEach-Object { "{0}  {1}" -f (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant(), $_.Name })
  [IO.File]::WriteAllLines((Join-Path $output 'SHA256SUMS.txt'), $checksums, [Text.UTF8Encoding]::new($false))
  Write-Host "Release candidate prepared at: $output"
} finally {
  Pop-Location
}
