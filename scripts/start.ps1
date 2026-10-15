param(
  [int]$PreferredPort = 3210,
  [switch]$NoBrowser
)

. (Join-Path $PSScriptRoot 'common.ps1')
$paths = Get-MangYuPaths
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$main = Join-Path $appRoot 'backend\src\main.ts'
$index = Join-Path $appRoot 'frontend\dist\index.html'

if (-not (Test-Path -LiteralPath $main) -or -not (Test-Path -LiteralPath $index)) {
  throw '忙鱼程序文件或前端构建缺失，请重新运行安装命令。'
}

foreach ($dir in @($paths.Logs, $paths.State, $paths.Data, $paths.Config, $paths.Browser)) {
  [IO.Directory]::CreateDirectory($dir) | Out-Null
}

$state = Read-MangYuServerState $paths
if ($null -ne $state) {
  $process = Get-Process -Id ([int]$state.pid) -ErrorAction SilentlyContinue
  $expectedNode = Get-MangYuNode $paths
  $actualNode = if ($null -ne $process) { try { [IO.Path]::GetFullPath($process.Path) } catch { '' } } else { '' }
  $sameNode = $actualNode.Equals([IO.Path]::GetFullPath($expectedNode), [StringComparison]::OrdinalIgnoreCase)
  $sameApp = ([string]$state.appRoot).Equals($appRoot, [StringComparison]::OrdinalIgnoreCase)
  if ($null -ne $process -and $sameNode -and $sameApp -and (Test-MangYuHealth ([string]$state.url))) {
    Write-Host "忙鱼已在运行：$($state.url)"
    if (-not $NoBrowser) { Start-Process ([string]$state.url) }
    return
  }
  Remove-MangYuFile (Get-MangYuStateFile $paths)
}

$node = Get-MangYuNode $paths
$port = Find-MangYuPort $PreferredPort
$url = "http://127.0.0.1:$port"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stdout = Join-Path $paths.Logs "server-$stamp.out.log"
$stderr = Join-Path $paths.Logs "server-$stamp.err.log"

$env:HOST = '127.0.0.1'
$env:PORT = [string]$port
$env:MANGYU_DATA_DIR = $paths.Data
$env:MANGYU_BROWSER_PROFILE_DIR = Join-Path $paths.Config 'browser-profile'
$env:MANGYU_STATIC_DIR = Join-Path $appRoot 'frontend\dist'
$env:PLAYWRIGHT_BROWSERS_PATH = $paths.Browser

$process = Start-Process -FilePath $node -ArgumentList @("`"$main`"") -WorkingDirectory $appRoot `
  -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru

$statePayload = [ordered]@{
  pid = $process.Id
  port = $port
  url = $url
  node = $node
  appRoot = $appRoot
  startedAt = (Get-Date).ToString('o')
}
$statePayload | ConvertTo-Json | Set-Content -LiteralPath (Get-MangYuStateFile $paths) -Encoding UTF8

$healthy = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
  if ($process.HasExited) { break }
  if (Test-MangYuHealth $url 2) { $healthy = $true; break }
  Start-Sleep -Milliseconds 500
}

if (-not $healthy) {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  Remove-MangYuFile (Get-MangYuStateFile $paths)
  $detail = if (Test-Path -LiteralPath $stderr) { (Get-Content -LiteralPath $stderr -Tail 20) -join [Environment]::NewLine } else { '未生成错误日志' }
  throw "忙鱼启动失败。日志：$stderr`n$detail"
}

Write-Host "忙鱼已启动：$url"
Write-Host "运行日志：$stdout"
if (-not $NoBrowser) { Start-Process $url }
