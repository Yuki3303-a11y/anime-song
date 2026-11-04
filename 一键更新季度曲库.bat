@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Anime Song - Update Seasonal Library
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto :missing_node
node --version >nul 2>&1
if errorlevel 1 goto :missing_node

rem Let supported Node versions use the configured proxy for upstream requests.
rem Keep the local Bilibili service on a direct connection.
if defined HTTP_PROXY set "NODE_USE_ENV_PROXY=1"
if defined HTTPS_PROXY set "NODE_USE_ENV_PROXY=1"
if defined NO_PROXY (
    set "NO_PROXY=%NO_PROXY%,127.0.0.1,localhost"
) else (
    set "NO_PROXY=127.0.0.1,localhost"
)
node scripts\update-season.mjs --windows-launcher %*
set "UPDATE_EXIT_CODE=%ERRORLEVEL%"
pause >nul
exit /b %UPDATE_EXIT_CODE%

:missing_node
echo.
echo [ERROR] Node.js was not found. Install Node.js and try again.
pause
exit /b 1
