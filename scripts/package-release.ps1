param(
  [string]$Version = 'v0.1.0',
  [ValidateSet('x64', 'arm64')][string]$Architecture = 'x64'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^v\d+\.\d+\.\d+([-.][A-Za-z0-9.-]+)?$') { throw "版本格式无效：$Version" }

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = Join-Path $projectRoot "outputs\releases\$Version"
$stage = Join-Path $projectRoot "work\release-$([Guid]::NewGuid().ToString('N'))"
$assetName = "mangyu-$Version-win-$Architecture.zip"
$asset = Join-Path $releaseRoot $assetName

function Remove-Directory([string]$Path) {
  if (Test-Path -LiteralPath $Path) { [IO.Directory]::Delete([IO.Path]::GetFullPath($Path), $true) }
}

[IO.Directory]::CreateDirectory($stage) | Out-Null
[IO.Directory]::CreateDirectory($releaseRoot) | Out-Null
try {
  foreach ($dir in @('backend', 'frontend', 'shared', 'scripts', '.github')) {
    $source = Join-Path $projectRoot $dir
    $destination = Join-Path $stage $dir
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    Get-ChildItem -LiteralPath $source -Recurse -File | Where-Object {
      $_.FullName -notmatch '[\\/]node_modules[\\/]' -and
      $_.FullName -notmatch '[\\/]dist[\\/]' -and
      $_.FullName -notmatch '[\\/]data[\\/]'
    } | ForEach-Object {
      $relative = $_.FullName.Substring($source.Length).TrimStart('\')
      $target = Join-Path $destination $relative
      [IO.Directory]::CreateDirectory((Split-Path $target -Parent)) | Out-Null
      [IO.File]::Copy($_.FullName, $target, $true)
    }
  }
  foreach ($file in @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'README.md', 'LICENSE', '.gitignore', '.env.example')) {
    [IO.File]::Copy((Join-Path $projectRoot $file), (Join-Path $stage $file), $true)
  }
  [IO.File]::WriteAllText((Join-Path $stage 'VERSION'), $Version, [Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $asset) { [IO.File]::Delete($asset) }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $asset -CompressionLevel Optimal
  $hash = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText("$asset.sha256", "$hash  $assetName`r`n", [Text.UTF8Encoding]::new($false))
  Write-Host "发布包：$asset"
  Write-Host "SHA-256：$hash"
} finally {
  Remove-Directory $stage
}
