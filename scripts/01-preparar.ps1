# SÓLO DESARROLLADORES. Los usuarios finales deben usar INSTALAR.bat en la raíz.
$ErrorActionPreference='Stop'; $root=Resolve-Path "$PSScriptRoot\.."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js no está instalado o no está en PATH.' }
if (-not (Test-Path "$root\config.env")) { throw 'Falta config.env. Ejecute INSTALAR.bat o CONFIGURAR.bat primero.' }
if (-not (Test-Path "$root\probe\config\snmp-profiles.json")) { Copy-Item "$root\probe\config\snmp-profiles.example.json" "$root\probe\config\snmp-profiles.json" }
foreach($d in 'backend','frontend','probe'){ Write-Host "Instalando $d..."; Push-Location "$root\$d"; npm install; Pop-Location }
Write-Host 'Listo. Use 02-iniciar-pruebas.ps1 para modo desarrollo (Angular en :4200 con recarga automática).' -ForegroundColor Green
