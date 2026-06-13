@echo off
chcp 65001 >nul
title MCP Dev Hub - Dashboard Launcher
cd /d "%~dp0"
set "CURL=%SystemRoot%\System32\curl.exe"
set "WAIT=%SystemRoot%\System32\timeout.exe"

echo ============================================
echo   MCP Dev Hub - 대시보드 실행기
echo ============================================
echo.

REM npm 존재 확인
where npm >nul 2>&1
if errorlevel 1 (
  echo [오류] npm 을 찾을 수 없습니다. Node.js / nvm 설치를 확인하세요.
  pause
  exit /b 1
)

REM 이미 서버가 떠 있으면 브라우저만 열고 종료
"%CURL%" -s -o nul --max-time 2 http://127.0.0.1:8787/health
if not errorlevel 1 (
  echo [정보] 서버가 이미 실행 중입니다.
  goto openbrowser
)

echo [1/3] 로컬 DB 스키마 확인 중...
call npm run db:init:local >nul 2>&1

echo [2/3] 서버 시작 중... (별도 창에서 실행됩니다. 끄면 서버가 중지됩니다)
start "MCP Dev Hub Server" /min cmd /k "npm run dev"

echo [3/3] 서버 준비 대기 중...
set /a tries=0
:wait
"%WAIT%" /t 2 /nobreak >nul
"%CURL%" -s -o nul --max-time 2 http://127.0.0.1:8787/health
if not errorlevel 1 goto openbrowser
set /a tries+=1
if %tries% lss 30 goto wait
echo [오류] 서버가 시간 내에 준비되지 않았습니다. 'MCP Dev Hub Server' 창의 로그를 확인하세요.
pause
exit /b 1

:openbrowser
echo.
echo [완료] 브라우저를 엽니다: http://127.0.0.1:8787/dashboard
start "" "http://127.0.0.1:8787/dashboard"
"%WAIT%" /t 2 /nobreak >nul
exit /b 0
