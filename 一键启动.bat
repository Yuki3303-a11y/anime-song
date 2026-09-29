@echo off
setlocal EnableExtensions
title Anime Song Quiz Launcher
cd /d "%~dp0"

echo ============================================
echo   Anime Song Quiz - Local Launcher
echo ============================================
echo.

call :port_open 8765
if errorlevel 1 (
    where node >nul 2>&1
    if errorlevel 1 goto :missing_node
    node --version >nul 2>&1
    if errorlevel 1 goto :missing_node
    echo [1/2] Starting Bilibili proxy: http://127.0.0.1:8765
    start "Anime Song Quiz - Bilibili Proxy" /min cmd /k "node bili-proxy.mjs"
) else (
    echo [1/2] Bilibili proxy is already running. Reusing it.
)

call :http_ready
if errorlevel 1 (
    call :port_open 8080
    if not errorlevel 1 goto :port_8080_unhealthy
    where python >nul 2>&1
    if errorlevel 1 goto :missing_python
    python --version >nul 2>&1
    if errorlevel 1 goto :missing_python
    echo [2/2] Starting website server: http://127.0.0.1:8080
    start "Anime Song Quiz - Website" /min cmd /k "python -m http.server 8080 --bind 127.0.0.1"
) else (
    echo [2/2] Website server is already running. Reusing it.
)

call :wait_for_services
if errorlevel 1 goto :startup_timeout

echo.
echo Both services are ready. Opening the browser...
start "" "http://127.0.0.1:8080/"
exit /b 0

:wait_for_services
set "WAIT_COUNT=0"
:wait_loop
call :port_open 8765
if errorlevel 1 goto :wait_again
call :http_ready
if errorlevel 1 goto :wait_again
exit /b 0

:wait_again
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 30 exit /b 1
echo Waiting for services... %WAIT_COUNT%/30
powershell -NoProfile -Command "Start-Sleep -Seconds 1" >nul 2>&1
goto :wait_loop

:port_open
powershell -NoProfile -ExecutionPolicy Bypass -Command "$client = [Net.Sockets.TcpClient]::new(); try { $async = $client.BeginConnect('127.0.0.1', %~1, $null, $null); if (-not $async.AsyncWaitHandle.WaitOne(300)) { exit 1 }; $client.EndConnect($async); exit 0 } catch { exit 1 } finally { $client.Dispose() }" >nul 2>&1
exit /b %errorlevel%

:http_ready
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:missing_node
echo.
echo [ERROR] Node.js was not found. The Bilibili proxy cannot start.
echo Install Node.js and then run this file again.
pause
exit /b 1

:missing_python
echo.
echo [ERROR] Python was not found. The website server cannot start.
echo Install Python, ensure the python command works, and run this file again.
pause
exit /b 1

:startup_timeout
echo.
echo [ERROR] Startup timed out. Both services were not ready within 30 seconds.
echo Check the Bilibili Proxy and Website windows for error messages.
pause
exit /b 1

:port_8080_unhealthy
echo.
echo [ERROR] Port 8080 is occupied, but the website is not responding.
echo Close the old process using port 8080, then run this file again.
pause
exit /b 1
