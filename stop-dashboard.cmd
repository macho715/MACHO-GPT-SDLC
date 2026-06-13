@echo off
chcp 65001 >nul
title MCP Dev Hub - Stop
echo MCP Dev Hub 서버를 중지합니다...
powershell -NoProfile -Command "$p=(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host '서버 중지됨 (포트 8787)'} else {Write-Host '실행 중인 서버가 없습니다'}"
"%SystemRoot%\System32\timeout.exe" /t 2 /nobreak >nul
exit /b 0
