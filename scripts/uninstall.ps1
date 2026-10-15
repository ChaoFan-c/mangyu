param(
  [switch]$DeleteUserData,
  [switch]$Yes
)

. (Join-Path $PSScriptRoot 'common.ps1')
$paths = Get-MangYuPaths

if ($DeleteUserData -and -not $Yes) {
  $answer = Read-Host '这会永久删除忙鱼数据库和浏览器登录状态。输入 DELETE 确认'
  if ($answer -ne 'DELETE') { Write-Host '已取消卸载。'; return }
}

& (Join-Path $PSScriptRoot 'stop.ps1')

$targets = @($paths.App, $paths.Runtime, $paths.Browser, $paths.Logs, $paths.State)
foreach ($target in $targets) { Assert-MangYuChildPath $target $paths.LocalRoot }
if ($DeleteUserData) {
  $expectedUserRoot = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'MangYu'))
  if (-not [IO.Path]::GetFullPath($paths.UserRoot).Equals($expectedUserRoot, [StringComparison]::OrdinalIgnoreCase) -and
      -not $env:MANGYU_USER_ROOT) {
    throw '用户数据目录不是预期的 MangYu 目录，拒绝删除。'
  }
  $targets += $paths.UserRoot
}

$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '忙鱼.lnk'
if (Test-Path -LiteralPath $shortcutPath) { [IO.File]::Delete($shortcutPath) }

foreach ($target in $targets) {
  if (Test-Path -LiteralPath $target) { [IO.Directory]::Delete($target, $true) }
}

if ($DeleteUserData) {
  Write-Host '忙鱼已卸载，程序文件与用户数据均已删除。'
} else {
  Write-Host "忙鱼已卸载；用户数据库和配置已保留在：$($paths.UserRoot)"
}
