param(
  [switch]$Yes,
  [switch]$NoStart
)

. (Join-Path $PSScriptRoot 'common.ps1')
$paths = Get-MangYuPaths
$installStateFile = Join-Path $paths.State 'install.json'
if (-not (Test-Path -LiteralPath $installStateFile)) { throw '找不到安装状态，请重新执行一键安装。' }
$installState = Get-Content -LiteralPath $installStateFile -Raw | ConvertFrom-Json
$repository = [string]$installState.repository
$currentVersion = [string]$installState.version

Write-Host "当前版本：$currentVersion"
try {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/latest" `
    -Headers @{ 'User-Agent' = 'MangYu-Updater' } -TimeoutSec 30 -UseBasicParsing
} catch {
  throw "检查 GitHub Releases 失败：$($_.Exception.Message)"
}

if ($release.prerelease -or $release.draft) { throw 'GitHub latest 返回了预发布或草稿版本，已拒绝更新。' }
$latestVersion = [string]$release.tag_name
Write-Host "最新稳定版：$latestVersion"
if ($latestVersion -eq $currentVersion) { Write-Host '当前已是最新稳定版。'; return }

if (-not $Yes) {
  $answer = Read-Host "确认更新到 $latestVersion？输入 YES 继续"
  if ($answer -ne 'YES') { Write-Host '已取消更新。'; return }
}

$installer = Join-Path $paths.App 'scripts\install.ps1'
if (-not (Test-Path -LiteralPath $installer)) { throw '安装脚本缺失，请重新执行 README 中的一键安装命令。' }
& $installer -Repository $repository -Version $latestVersion -LocalRoot $paths.LocalRoot `
  -UserRoot $paths.UserRoot -NoStart:$NoStart
