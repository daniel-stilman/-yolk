@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."

pushd "%REPO_ROOT%"
call npm run build
if errorlevel 1 goto :fail

node scripts\test-flow-server.mjs --open --port 4173
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%

:fail
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
