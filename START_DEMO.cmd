@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Установите Node.js 24 и откройте этот файл снова.
  pause
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo Установите pnpm командой: npm install -g pnpm@11.25.0
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])!==24){console.error('Нужен Node.js 24.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
call pnpm install --frozen-lockfile
if errorlevel 1 (
  pause
  exit /b 1
)
call pnpm demo
if errorlevel 1 pause
