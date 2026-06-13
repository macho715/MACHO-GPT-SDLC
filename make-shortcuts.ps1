$ErrorActionPreference = 'Stop'
$proj = 'C:\Users\jichu\Downloads\MACHO-GPT SDLC'
$desktop = [Environment]::GetFolderPath('Desktop')
$sys = $env:SystemRoot
$shell = New-Object -ComObject WScript.Shell

# 시작 바로가기
$start = $shell.CreateShortcut((Join-Path $desktop 'MCP 대시보드 시작.lnk'))
$start.TargetPath = (Join-Path $proj 'start-dashboard.cmd')
$start.WorkingDirectory = $proj
$start.IconLocation = "$sys\System32\SHELL32.dll,13"
$start.Description = 'MCP Dev Hub 대시보드 실행 (서버 시작 후 브라우저 자동 열기)'
$start.WindowStyle = 1
$start.Save()

# 중지 바로가기
$stop = $shell.CreateShortcut((Join-Path $desktop 'MCP 대시보드 중지.lnk'))
$stop.TargetPath = (Join-Path $proj 'stop-dashboard.cmd')
$stop.WorkingDirectory = $proj
$stop.IconLocation = "$sys\System32\SHELL32.dll,27"
$stop.Description = 'MCP Dev Hub 서버 중지'
$stop.WindowStyle = 1
$stop.Save()

Write-Host ('DESKTOP: ' + $desktop)
Get-ChildItem -Path $desktop -Filter 'MCP 대시보드*.lnk' | ForEach-Object { Write-Host ('  created: ' + $_.Name) }
