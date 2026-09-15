@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR-AGENTE.ps1"
pause
