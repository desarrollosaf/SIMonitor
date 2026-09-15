@echo off
title Monitor de Red - Configurar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR.ps1" -SoloConfigurar
