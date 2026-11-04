$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'launcher.mjs'
$targets = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($launcher) }
foreach ($target in $targets) {
    & taskkill.exe /PID $target.ProcessId /T /F
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop AI Zhipin.' }
}
Write-Host 'AI Zhipin stopped. No scheduled task was installed.'
