param(
  [string]$Repository = 'ChaoFan-c/mangyu',
  [string]$Version = 'v0.1.0',
  [string]$LocalRoot = (Join-Path $env:LOCALAPPDATA 'MangYu'),
  [string]$UserRoot = (Join-Path $env:APPDATA 'MangYu'),
  [switch]$CreateDesktopShortcut,
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$NodeVersion = '24.14.1'
$PnpmVersion = '11.25.0'
$MinimumFreeBytes = 2GB

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Assert-ChildPath([string]$Path, [string]$Root) {
  $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  $fullRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not $fullPath.StartsWith($fullRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝操作安装目录以外的路径：$fullPath"
  }
}
function Remove-Directory([string]$Path) {
  if (Test-Path -LiteralPath $Path) { [IO.Directory]::Delete([IO.Path]::GetFullPath($Path), $true) }
}
function Remove-File([string]$Path) {
  if (Test-Path -LiteralPath $Path) { [IO.File]::Delete([IO.Path]::GetFullPath($Path)) }
}
function Download-File([string]$Uri, [string]$Destination) {
  $lastError = $null
  foreach ($attempt in 1..3) {
    try {
      Invoke-WebRequest -Uri $Uri -OutFile $Destination -UseBasicParsing -TimeoutSec 120
      return
    } catch {
      $lastError = $_
      if ($attempt -lt 3) { Start-Sleep -Seconds ([Math]::Pow(2, $attempt)) }
    }
  }
  throw "下载失败（已重试 3 次）：$Uri`n$($lastError.Exception.Message)"
}
function Assert-Hash([string]$File, [string]$Expected) {
  $actual = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash
  if (-not $actual.Equals($Expected.Trim(), [StringComparison]::OrdinalIgnoreCase)) {
    throw "SHA-256 校验失败：$([IO.Path]::GetFileName($File))。期望 $Expected，实际 $actual"
  }
}
function Expand-SafeZip([string]$Zip, [string]$Destination) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $targetRoot = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
  $archive = [IO.Compression.ZipFile]::OpenRead($Zip)
  try {
    foreach ($entry in $archive.Entries) {
      $target = [IO.Path]::GetFullPath((Join-Path $Destination $entry.FullName))
      if (-not $target.StartsWith($targetRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "发布包包含不安全路径：$($entry.FullName)"
      }
    }
  } finally { $archive.Dispose() }
  Expand-Archive -LiteralPath $Zip -DestinationPath $Destination -Force
}
function Get-NodeVersion([string]$NodeExe) {
  if (-not (Test-Path -LiteralPath $NodeExe)) { return '' }
  try { return ((& $NodeExe --version 2>$null) -replace '^v', '').Trim() } catch { return '' }
}
function Get-PnpmVersion([string]$NodeExe, [string]$PnpmCjs) {
  if (-not (Test-Path -LiteralPath $PnpmCjs)) { return '' }
  try { return ((& $NodeExe $PnpmCjs --version 2>$null) | Select-Object -Last 1).Trim() } catch { return '' }
}
function Move-WithRollback([string]$Prepared, [string]$Current, [string]$Rollback) {
  Assert-ChildPath $Current $LocalRoot
  Assert-ChildPath $Rollback $LocalRoot
  Remove-Directory $Rollback
  if (Test-Path -LiteralPath $Current) { [IO.Directory]::Move($Current, $Rollback) }
  try { [IO.Directory]::Move($Prepared, $Current) } catch {
    if (Test-Path -LiteralPath $Rollback) { [IO.Directory]::Move($Rollback, $Current) }
    throw
  }
}
function Restore-Rollback([string]$Current, [string]$Rollback) {
  Remove-Directory $Current
  if (Test-Path -LiteralPath $Rollback) { [IO.Directory]::Move($Rollback, $Current) }
}

if ($env:OS -ne 'Windows_NT') { throw '忙鱼一键安装当前只支持 Windows 10/11。' }
if ($PSVersionTable.PSVersion -lt [Version]'5.1') { throw '需要 Windows PowerShell 5.1 或 PowerShell 7。' }
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') {
  throw 'GitHub 仓库格式无效，应为“用户名/仓库名”。'
}
if ($Version -notmatch '^v\d+\.\d+\.\d+([-.][A-Za-z0-9.-]+)?$') { throw "版本格式无效：$Version" }

$archName = switch ($env:PROCESSOR_ARCHITECTURE) {
  'AMD64' { 'x64' }
  'ARM64' { 'arm64' }
  default { throw "不支持的 CPU 架构：$env:PROCESSOR_ARCHITECTURE（仅支持 x64/arm64）" }
}

$LocalRoot = [IO.Path]::GetFullPath($LocalRoot)
$UserRoot = [IO.Path]::GetFullPath($UserRoot)
$paths = [ordered]@{
  App = Join-Path $LocalRoot 'app'
  Runtime = Join-Path $LocalRoot 'runtime'
  Browser = Join-Path $LocalRoot 'browser'
  Logs = Join-Path $LocalRoot 'logs'
  State = Join-Path $LocalRoot 'state'
  Data = Join-Path $UserRoot 'data'
  Config = Join-Path $UserRoot 'config'
}

Write-Step '检查系统、权限、网络和磁盘空间'
foreach ($dir in @($LocalRoot, $UserRoot, $paths.Logs, $paths.State, $paths.Data, $paths.Config)) {
  [IO.Directory]::CreateDirectory($dir) | Out-Null
}
$probe = Join-Path $paths.State "write-test-$([Guid]::NewGuid().ToString('N')).tmp"
[IO.File]::WriteAllText($probe, 'ok')
Remove-File $probe
$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($LocalRoot).TrimEnd('\').TrimEnd(':'))
if ($drive.Free -lt $MinimumFreeBytes) { throw '可用磁盘空间不足 2 GB，无法安全安装 Node.js、依赖和浏览器。' }
try { Invoke-WebRequest -Uri 'https://github.com' -Method Head -UseBasicParsing -TimeoutSec 20 | Out-Null } catch {
  throw "无法连接 GitHub：$($_.Exception.Message)"
}

$stage = Join-Path $paths.State "install-$([Guid]::NewGuid().ToString('N'))"
Assert-ChildPath $stage $LocalRoot
[IO.Directory]::CreateDirectory($stage) | Out-Null
$preparedApp = Join-Path $stage 'app'
$preparedRuntime = Join-Path $stage 'runtime'
[IO.Directory]::CreateDirectory($preparedRuntime) | Out-Null
$installLog = Join-Path $paths.Logs "install-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').log"
$transcriptStarted = $false
$succeeded = $false
try { Start-Transcript -LiteralPath $installLog | Out-Null; $transcriptStarted = $true } catch {
  Write-Warning "无法启动安装日志记录：$($_.Exception.Message)"
}

try {
  Write-Step "下载并校验忙鱼 $Version"
  $assetName = "mangyu-$Version-win-$archName.zip"
  $assetUrl = "https://github.com/$Repository/releases/download/$Version/$assetName"
  $zip = Join-Path $stage $assetName
  $checksum = "$zip.sha256"
  Download-File $assetUrl $zip
  Download-File "$assetUrl.sha256" $checksum
  $expectedAssetHash = ((Get-Content -LiteralPath $checksum -Raw) -split '\s+')[0]
  if ($expectedAssetHash -notmatch '^[A-Fa-f0-9]{64}$') { throw '发布包校验文件格式无效。' }
  Assert-Hash $zip $expectedAssetHash
  [IO.Directory]::CreateDirectory($preparedApp) | Out-Null
  Expand-SafeZip $zip $preparedApp
  foreach ($required in @('package.json', 'pnpm-lock.yaml', 'backend\src\main.ts', 'scripts\start.ps1')) {
    if (-not (Test-Path -LiteralPath (Join-Path $preparedApp $required))) { throw "发布包缺少：$required" }
  }

  Write-Step "准备专属 Node.js $NodeVersion"
  $currentNode = Join-Path $paths.Runtime 'node\node.exe'
  $nodeExe = $currentNode
  $replaceNode = (Get-NodeVersion $currentNode) -ne $NodeVersion
  if ($replaceNode) {
    $nodeArchiveName = "node-v$NodeVersion-win-$archName.zip"
    $nodeZip = Join-Path $stage $nodeArchiveName
    $nodeChecksums = Join-Path $stage 'SHASUMS256.txt'
    Download-File "https://nodejs.org/dist/v$NodeVersion/$nodeArchiveName" $nodeZip
    Download-File "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" $nodeChecksums
    $line = Get-Content -LiteralPath $nodeChecksums | Where-Object { $_ -match "\s+$([regex]::Escape($nodeArchiveName))$" } | Select-Object -First 1
    if (-not $line) { throw 'Node.js 官方校验文件中没有目标压缩包。' }
    Assert-Hash $nodeZip (($line -split '\s+')[0])
    $nodeExtract = Join-Path $stage 'node-extract'
    Expand-SafeZip $nodeZip $nodeExtract
    $nodeSource = Join-Path $nodeExtract "node-v$NodeVersion-win-$archName"
    $preparedNode = Join-Path $preparedRuntime 'node'
    [IO.Directory]::Move($nodeSource, $preparedNode)
    $nodeExe = Join-Path $preparedNode 'node.exe'
  }

  Write-Step "准备专属 pnpm $PnpmVersion"
  $currentPnpm = Join-Path $paths.Runtime 'pnpm\node_modules\pnpm\bin\pnpm.cjs'
  $pnpmCjs = $currentPnpm
  $replacePnpm = $replaceNode -or (Get-PnpmVersion $nodeExe $currentPnpm) -ne $PnpmVersion
  if ($replacePnpm) {
    $preparedPnpm = Join-Path $preparedRuntime 'pnpm'
    [IO.Directory]::CreateDirectory($preparedPnpm) | Out-Null
    $npmCmd = Join-Path (Split-Path $nodeExe -Parent) 'npm.cmd'
    & $npmCmd install --prefix $preparedPnpm "pnpm@$PnpmVersion" --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'pnpm 专属运行时安装失败。' }
    $pnpmCjs = Join-Path $preparedPnpm 'node_modules\pnpm\bin\pnpm.cjs'
  }

  Write-Step '安装锁定依赖并构建生产前端'
  $env:PLAYWRIGHT_BROWSERS_PATH = $paths.Browser
  $storeDir = Join-Path $paths.Runtime 'pnpm-store'
  & $nodeExe $pnpmCjs --dir $preparedApp install --frozen-lockfile --store-dir $storeDir
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，旧版本未被替换。' }
  & $nodeExe $pnpmCjs --dir $preparedApp build
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $preparedApp 'frontend\dist\index.html'))) {
    throw '生产构建失败，旧版本未被替换。'
  }
  & $nodeExe $pnpmCjs --dir $preparedApp exec playwright install chromium
  if ($LASTEXITCODE -ne 0) { throw 'Playwright Chromium 安装失败，旧版本未被替换。' }

  Write-Step '切换到新版本'
  $env:MANGYU_LOCAL_ROOT = $LocalRoot
  $env:MANGYU_USER_ROOT = $UserRoot
  $oldStop = Join-Path $paths.App 'scripts\stop.ps1'
  if (Test-Path -LiteralPath $oldStop) { & $oldStop }

  $appRollback = Join-Path $LocalRoot 'app-rollback'
  $nodeRollback = Join-Path $paths.Runtime 'node-rollback'
  $pnpmRollback = Join-Path $paths.Runtime 'pnpm-rollback'
  [IO.Directory]::CreateDirectory($paths.Runtime) | Out-Null
  $appSwapped = $false
  $nodeSwapped = $false
  $pnpmSwapped = $false
  try {
    Move-WithRollback $preparedApp $paths.App $appRollback
    $appSwapped = $true
    if ($replaceNode) {
      Move-WithRollback (Join-Path $preparedRuntime 'node') (Join-Path $paths.Runtime 'node') $nodeRollback
      $nodeSwapped = $true
    }
    if ($replacePnpm) {
      Move-WithRollback (Join-Path $preparedRuntime 'pnpm') (Join-Path $paths.Runtime 'pnpm') $pnpmRollback
      $pnpmSwapped = $true
    }
  } catch {
    if ($pnpmSwapped) { Restore-Rollback (Join-Path $paths.Runtime 'pnpm') $pnpmRollback }
    if ($nodeSwapped) { Restore-Rollback (Join-Path $paths.Runtime 'node') $nodeRollback }
    if ($appSwapped) { Restore-Rollback $paths.App $appRollback }
    throw
  }

  if (-not $NoStart) {
    try { & (Join-Path $paths.App 'scripts\start.ps1') } catch {
      if ($pnpmSwapped) { Restore-Rollback (Join-Path $paths.Runtime 'pnpm') $pnpmRollback }
      if ($nodeSwapped) { Restore-Rollback (Join-Path $paths.Runtime 'node') $nodeRollback }
      if ($appSwapped) { Restore-Rollback $paths.App $appRollback }
      throw "新版本启动失败，已回滚程序文件。$($_.Exception.Message)"
    }
  }

  $installState = [ordered]@{
    repository = $Repository
    version = $Version
    nodeVersion = $NodeVersion
    pnpmVersion = $PnpmVersion
    architecture = $archName
    installedAt = (Get-Date).ToString('o')
  }
  $installState | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $paths.State 'install.json') -Encoding UTF8

  if ($CreateDesktopShortcut) {
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '忙鱼.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = 'powershell.exe'
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $paths.App 'scripts\start.ps1')`""
    $shortcut.WorkingDirectory = $paths.App
    $shortcut.Save()
  }

  Remove-Directory $appRollback
  if ($replaceNode) { Remove-Directory $nodeRollback }
  if ($replacePnpm) { Remove-Directory $pnpmRollback }
  $succeeded = $true
  Write-Host "`n忙鱼 $Version 安装完成。用户数据目录：$($paths.Data)" -ForegroundColor Green
} catch {
  throw "安装失败：$($_.Exception.Message)`n安装日志：$installLog`n诊断目录：$stage"
} finally {
  if ($transcriptStarted) { try { Stop-Transcript | Out-Null } catch {} }
  if ($succeeded -and (Test-Path -LiteralPath $stage)) {
    try { Remove-Directory $stage } catch { Write-Warning "未能清理安装临时目录：$stage" }
  }
}
