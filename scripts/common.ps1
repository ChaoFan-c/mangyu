Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-MangYuPaths {
  $localRoot = if ($env:MANGYU_LOCAL_ROOT) { $env:MANGYU_LOCAL_ROOT } else { Join-Path $env:LOCALAPPDATA 'MangYu' }
  $userRoot = if ($env:MANGYU_USER_ROOT) { $env:MANGYU_USER_ROOT } else { Join-Path $env:APPDATA 'MangYu' }
  [pscustomobject]@{
    LocalRoot = [IO.Path]::GetFullPath($localRoot)
    UserRoot = [IO.Path]::GetFullPath($userRoot)
    App = Join-Path $localRoot 'app'
    Runtime = Join-Path $localRoot 'runtime'
    Browser = Join-Path $localRoot 'browser'
    Logs = Join-Path $localRoot 'logs'
    State = Join-Path $localRoot 'state'
    Data = Join-Path $userRoot 'data'
    Config = Join-Path $userRoot 'config'
  }
}

function Assert-MangYuChildPath([string]$Path, [string]$Root) {
  $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not $fullPath.StartsWith($fullRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝操作工作目录以外的路径：$fullPath"
  }
}

function Get-MangYuStateFile($Paths) {
  Join-Path $Paths.State 'server.json'
}

function Read-MangYuServerState($Paths) {
  $file = Get-MangYuStateFile $Paths
  if (-not (Test-Path -LiteralPath $file)) { return $null }
  try { return Get-Content -LiteralPath $file -Raw | ConvertFrom-Json } catch { return $null }
}

function Remove-MangYuFile([string]$Path) {
  if (Test-Path -LiteralPath $Path) { [IO.File]::Delete([IO.Path]::GetFullPath($Path)) }
}

function Test-MangYuHealth([string]$Url, [int]$TimeoutSec = 3) {
  try {
    $result = Invoke-RestMethod -Uri "$Url/api/v1/health" -TimeoutSec $TimeoutSec -UseBasicParsing
    return $result.status -eq 'ok'
  } catch { return $false }
}

function Get-MangYuNode($Paths) {
  $node = Join-Path $Paths.Runtime 'node\node.exe'
  if (-not (Test-Path -LiteralPath $node)) {
    throw "忙鱼专属 Node.js 不完整：$node。请重新运行安装命令。"
  }
  return $node
}

function Find-MangYuPort([int]$PreferredPort = 3210) {
  foreach ($port in $PreferredPort..($PreferredPort + 80)) {
    $listener = $null
    try {
      $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
      $listener.Start()
      return $port
    } catch {
      continue
    } finally {
      if ($null -ne $listener) { $listener.Stop() }
    }
  }
  throw "端口 $PreferredPort 至 $($PreferredPort + 80) 均被占用。"
}
