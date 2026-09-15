# Detiene el servidor y la sonda iniciados con INICIAR.bat (o por el inicio automático).
$root = (Resolve-Path $PSScriptRoot).Path
$n = 0
# Primero las ventanas que reinician automáticamente (run-backend / run-probe), después los procesos node.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*run-backend.ps1*' -or $_.CommandLine -like '*run-probe.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like "*$root*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }
if ($n) { Write-Host "Detenidos $n proceso(s) de Monitor de Red." -ForegroundColor Green } else { Write-Host 'No había procesos de Monitor de Red en ejecución.' -ForegroundColor Yellow }
