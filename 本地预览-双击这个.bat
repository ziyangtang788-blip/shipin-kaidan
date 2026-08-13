@echo off
chcp 65001 >nul
title 本地预览 - 食品系统
cd /d "%~dp0"
echo.
echo   正在开...
echo.
start "" http://localhost:8080
node "%~dp0本地预览.js"
echo.
echo   停了。按任意键关掉这个窗口。
pause >nul
