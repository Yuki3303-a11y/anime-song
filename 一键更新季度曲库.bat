@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Anime Song - Update Seasonal Library
cd /d "%~dp0"

echo ============================================
echo   萌豚挑战 - 一键更新季度曲库
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 goto :missing_node
node --version >nul 2>&1
if errorlevel 1 goto :missing_node

echo 正在根据本地日期查找当前季度并执行更新，请保持此窗口打开。
echo 如需指定季度，可运行：一键更新季度曲库.bat --year 2026 --season fall
echo.
node scripts\update-season.mjs %*
set "UPDATE_EXIT_CODE=%ERRORLEVEL%"
echo.
if "%UPDATE_EXIT_CODE%"=="0" (
    echo 更新流程已完成。
) else (
    echo 更新未发布。请查看上方原因及 candidates 文件夹中的检查报告。
)
echo.
pause
exit /b %UPDATE_EXIT_CODE%

:missing_node
echo.
echo [错误] 未找到 Node.js。请先安装 Node.js，再重新运行此文件。
pause
exit /b 1
