# Inicia el servidor central y, si START_LOCAL_AGENT=true, también el Agente de Sitio local.
$ErrorActionPreference = 'Stop'; $root = $PSScriptRoot
if (-not (Test-Path "$root\config.env")) { Write-Host 'Falta config.env. Ejecute primero INSTALAR.bat' -ForegroundColor Red; Read-Host 'Enter'; exit 1 }
$cfg=@{}; Get-Content "$root\config.env" | ForEach-Object { if($_ -match '^\s*([^#=]+)=(.*)$'){ $cfg[$matches[1].Trim()]=$matches[2].Trim() } }
$startAgent = -not $cfg.ContainsKey('START_LOCAL_AGENT') -or $cfg.START_LOCAL_AGENT -match '^(?i:true|1|si|sí|s)$'
$missingBuild = -not (Test-Path "$root\backend\dist\main.js") -or -not (Test-Path "$root\backend\public\index.html") -or ($startAgent -and -not (Test-Path "$root\probe\dist\index.js"))
if ($missingBuild) {
  Write-Host 'El sistema no está compilado. Ejecute INSTALAR.bat' -ForegroundColor Red; Read-Host 'Enter'; exit 1
}
$port = 3000; Get-Content "$root\config.env" | ForEach-Object { if ($_ -match '^\s*PORT=(\d+)') { $port = $matches[1] } }
$yaCorre = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($yaCorre) { Write-Host "Ya hay algo escuchando en el puerto $port (¿el sistema ya está iniciado?). Use DETENER.bat primero." -ForegroundColor Yellow; Read-Host 'Enter'; exit 1 }
& "$root\scripts\04-iniciar-produccion.ps1"
Start-Sleep -Seconds 4
Start-Process "http://localhost:$port"
Write-Host "Abriendo http://localhost:$port. Servidor central iniciado$(if($startAgent){' con Agente local'}else{' sin Agente local'})." -ForegroundColor Green
