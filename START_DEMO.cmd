@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 goto directory_error
if not exist "package.json" goto missing_files

where node >nul 2>nul
if errorlevel 1 goto missing_node
where pnpm >nul 2>nul
if errorlevel 1 goto missing_pnpm

node -e "if(Number(process.versions.node.split('.')[0])!==24){console.error('Node.js 24 is required.');process.exit(1)}"
if errorlevel 1 goto wrong_node

call pnpm install --frozen-lockfile
if errorlevel 1 goto install_error
call pnpm demo
set "demo_exit=%errorlevel%"
if not "%demo_exit%"=="0" pause
popd
exit /b %demo_exit%

:missing_node
echo Node.js was not found. Install Node.js 24, then run this file again.
goto failed

:missing_pnpm
echo pnpm was not found. Run this command in a terminal:
echo npm install -g pnpm@11.25.0
goto failed

:wrong_node
echo Install or select Node.js 24, then run this file again.
goto failed

:missing_files
echo Extract the entire ZIP first. Keep this file next to package.json.
goto failed

:install_error
echo Dependency installation failed. See the error above and try again.
goto failed

:directory_error
echo Could not open the project folder. Extract the entire ZIP first.
pause
exit /b 1

:failed
pause
popd
exit /b 1
