#Requires -Version 5.1
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$agentFile=Join-Path $root 'agent.env'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
function Ask($text,$default){$r=Read-Host "$text [$default]";if([string]::IsNullOrWhiteSpace($r)){$default}else{$r.Trim()}}
function SecretAsk($text){$s=Read-Host $text -AsSecureString;[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))}
function ReadCfg(){ $h=@{}; if(Test-Path $agentFile){Get-Content $agentFile|%{if($_ -match '^\s*([^#=]+)=(.*)$'){$h[$matches[1].Trim()]=$matches[2].Trim()}}};$h }
Write-Host ''; Write-Host '=== Agente de Sitio V0.4.1 ===' -ForegroundColor Cyan
Write-Host 'Instala únicamente el cliente local que monitorea esta red y sincroniza con el servidor central.'
$node=Get-Command node -ErrorAction SilentlyContinue
if(-not $node){Write-Host 'Node.js no está instalado. Instale Node.js 24 LTS y vuelva a ejecutar.' -ForegroundColor Red;exit 1}
$v=(node -v).TrimStart('v');$maj=[int]($v.Split('.')[0]);if($maj -lt 24){Write-Host "Se recomienda Node.js 24 LTS o superior. Detectado: $v" -ForegroundColor Red;exit 1}
$c=ReadCfg
$api=Ask 'URL de la API central (incluya /api)' $(if($c.API_URL){$c.API_URL}else{'https://servidor-central.example/api'})
$name=Ask 'Nombre de este agente' $(if($c.AGENT_NAME){$c.AGENT_NAME}else{"Agente-$env:COMPUTERNAME"})
$token=''
if($c.AGENT_TOKEN){$token=SecretAsk 'Token del agente (Enter = conservar el actual)';if([string]::IsNullOrWhiteSpace($token)){$token=$c.AGENT_TOKEN}}
else{$token=SecretAsk 'Pegue el token generado en Administración > Agentes de Sitio'}
if([string]::IsNullOrWhiteSpace($token)){Write-Host 'El token es obligatorio.' -ForegroundColor Red;exit 1}
$defaults=[ordered]@{
  API_URL=$api; AGENT_NAME=$name; AGENT_TOKEN=$token; CONFIG_REFRESH_SEC='60'; HEARTBEAT_SEC='30'; PROBE_CONCURRENCY='5';
  API_TIMEOUT_MS='8000'; SNMP_PROFILES_FILE='./config/snmp-profiles.json'; DNS_TEST_NAME='www.microsoft.com';
  AGENT_BUFFER_DB='./data/agent-buffer.sqlite'; AGENT_BUFFER_MAX='10000'
}
if(Test-Path $agentFile){
  $out=Get-Content $agentFile -Raw
  foreach($k in $defaults.Keys){ if($c[$k] -and -not @('API_URL','AGENT_NAME','AGENT_TOKEN').Contains($k)){ $defaults[$k]=$c[$k] } }
}else{
  $out="# Agente de Sitio V0.4.1`r`n"
}
foreach($k in $defaults.Keys){
  $value=$defaults[$k]
  $pattern="(?m)^\s*$([regex]::Escape($k))=.*$"
  if($out -match $pattern){ $out=[regex]::Replace($out,$pattern,{param($m) "$k=$value"}) }
  else{ $out=$out.TrimEnd()+"`r`n$k=$value`r`n" }
}
[IO.File]::WriteAllText($agentFile,$out,(New-Object Text.UTF8Encoding $false))
Write-Host "[OK] $agentFile (se conservaron claves y comentarios existentes)" -ForegroundColor Green
$profiles=Join-Path $root 'probe\config\snmp-profiles.json'
if(-not(Test-Path $profiles)){Copy-Item (Join-Path $root 'probe\config\snmp-profiles.example.json') $profiles}
Push-Location (Join-Path $root 'probe')
try{
  Write-Host 'Instalando dependencias del agente...'
  npm install --no-audit --no-fund
  if($LASTEXITCODE -ne 0){throw 'npm install falló'}
  npm run build
  if($LASTEXITCODE -ne 0){throw 'La compilación del agente falló'}
}finally{Pop-Location}
Write-Host '';Write-Host 'Agente instalado.' -ForegroundColor Green
Write-Host '1. Configure credenciales SNMPv3 en probe\config\snmp-profiles.json si aplica.'
Write-Host '2. Ejecute INICIAR-AGENTE.bat.'
Write-Host '3. Verifique en el servidor central que el agente aparezca EN LÍNEA.'
