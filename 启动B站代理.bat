@echo off
chcp 65001 >nul
title 萌豚挑战 B站代理
echo ============================================
echo   正在启动 B站本地音频代理...
echo   启动成功后请保持本窗口开启，
echo   然后回到游戏：设置 → B站代理地址填
echo   http://localhost:8765  → 保存
echo ============================================
echo.
cd /d "%~dp0"
node bili-proxy.mjs
echo.
echo 代理已退出（窗口将在 3 秒后自动关闭）
timeout /t 3 >nul
