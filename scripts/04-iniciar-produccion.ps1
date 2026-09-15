$root=Resolve-Path "$PSScriptRoot\.."
$cfg=@{}; if(Test-Path "$root\config.env"){ Get-Content "$root\config.env" | ForEach-Object { if($_ -match '^\s*([^#=]+)=(.*)$'){ $cfg[$matches[1].Trim()]=$matches[2].Trim() } } }
$startAgent = -not $cfg.ContainsKey('START_LOCAL_AGENT') -or $cfg.START_LOCAL_AGENT -match '^(?i:true|1|si|sí|s)$'
Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File',"$PSScriptRoot\run-backend.ps1" -WindowStyle Minimized
Start-Sleep -Seconds 3
if($startAgent){
  Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File',"$PSScriptRoot\run-probe.ps1" -WindowStyle Minimized
  Write-Host 'Servidor central y Agente de Sitio local iniciados (ventanas minimizadas).' -ForegroundColor Green
}else{
  Write-Host 'Servidor central iniciado. START_LOCAL_AGENT=false: no se inició un agente en este equipo.' -ForegroundColor Green
}
