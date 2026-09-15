@echo off
title Monitor de Red - Inicio automatico con Windows
echo Este paso necesita permisos de administrador. Acepte la ventana de confirmacion.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','\"%~dp0scripts\05-registrar-inicio-automatico.ps1\"'"
