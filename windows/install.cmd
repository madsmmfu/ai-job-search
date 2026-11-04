@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul || (echo Install Node.js 22 LTS first. & pause & exit /b 1)
set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
call npm ci --ignore-scripts
if errorlevel 1 goto failed
call npx --no-install playwright install chromium
if errorlevel 1 goto failed
call npm ci --prefix web
if errorlevel 1 goto failed
call npm run build --prefix web
if errorlevel 1 goto failed
echo Installation complete. Run windows\start.cmd.
pause
exit /b 0
:failed
echo Installation failed. See the error above.
pause
exit /b 1
