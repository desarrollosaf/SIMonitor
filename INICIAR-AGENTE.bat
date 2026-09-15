@echo off
chcp 65001 >nul
if not exist "%~dp0agent.env" (
  echo Falta agent.env. Ejecute primero INSTALAR-AGENTE.bat
  pause
  exit /b 1
)
if not exist "%~dp0probe\dist\index.js" (
  echo El agente no esta compilado. Ejecute INSTALAR-AGENTE.bat
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-probe.ps1"
