@echo off
chcp 65001 >nul
if "%~1"=="" (
  echo.
  echo   把图片拖到这个文件上就行了。
  echo   支持 png / jpg / pdf，可以一次拖好几张。
  echo.
  pause
  exit /b
)
node "%~dp0\..\食品系统\工具-试OCR.js" %*
if errorlevel 1 pause
