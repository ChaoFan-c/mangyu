param()

. (Join-Path $PSScriptRoot 'common.ps1')
$paths = Get-MangYuPaths
$stateFile = Get-MangYuStateFile $paths
$state = Read-MangYuServerState $paths

if ($null -eq $state) {
  Write-Host '忙鱼当前未运行。'
  return
}

$pidValue = [int]$state.pid
$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
if ($null -eq $process) {
  Remove-MangYuFile $stateFile
  Write-Host '忙鱼进程已结束，已清理过期状态。'
  return
}

$expectedNode = [IO.Path]::GetFullPath([string]$state.node)
$actualNode = try { [IO.Path]::GetFullPath($process.Path) } catch { '' }
$expectedMain = Join-Path ([string]$state.appRoot) 'backend\src\main.ts'
$commandLine = try { [string](Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue").CommandLine } catch { '' }
if (-not $actualNode.Equals($expectedNode, [StringComparison]::OrdinalIgnoreCase) -or
    $commandLine.IndexOf($expectedMain, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw "状态文件中的 PID 已被其他程序占用，拒绝停止：$pidValue"
}

try {
  Invoke-WebRequest -Method Post -Uri "$($state.url)/api/v1/collection/browser/stop" -TimeoutSec 10 -UseBasicParsing | Out-Null
} catch {
  Write-Warning '浏览器会话未能通过 API 正常关闭，将继续停止忙鱼服务。'
}

Stop-Process -Id $pidValue -Force
for ($attempt = 1; $attempt -le 20; $attempt++) {
  if ($null -eq (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
Remove-MangYuFile $stateFile
Write-Host '忙鱼已停止；用户数据库和配置均已保留。'
