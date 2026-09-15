# Ejecutar PowerShell COMO ADMINISTRADOR.
# Por defecto las tareas corren con una cuenta de servicio dedicada (parámetro -Usuario), no como SYSTEM:
# ni el backend ni la sonda necesitan privilegios de sistema, y así snmp-profiles.json queda protegido
# con permisos NTFS de esa cuenta. Si no indica -Usuario se usará SYSTEM (no recomendado en producción).
param([string]$Usuario = 'SYSTEM')
$root=Resolve-Path "$PSScriptRoot\.."
$backend="powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-backend.ps1`""
$probe="powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-probe.ps1`""
if ($Usuario -eq 'SYSTEM') {
  Write-Host 'ADVERTENCIA: registrando como SYSTEM. Use -Usuario "DOMINIO\svc_monitor" en producción.' -ForegroundColor Yellow
  schtasks /Create /TN "MonitorRed-Backend" /SC ONSTART /RU SYSTEM /TR $backend /F
  schtasks /Create /TN "MonitorRed-Sonda" /SC ONSTART /RU SYSTEM /TR $probe /F
} else {
  $cred = Get-Credential -UserName $Usuario -Message 'Contraseña de la cuenta de servicio'
  $pwd = $cred.GetNetworkCredential().Password
  schtasks /Create /TN "MonitorRed-Backend" /SC ONSTART /RU $Usuario /RP $pwd /TR $backend /F
  schtasks /Create /TN "MonitorRed-Sonda" /SC ONSTART /RU $Usuario /RP $pwd /TR $probe /F
}
Write-Host 'Tareas de inicio registradas. Reinicie y valide los logs antes de usar en producción.' -ForegroundColor Green
