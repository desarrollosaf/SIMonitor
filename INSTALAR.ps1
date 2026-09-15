#Requires -Version 5.1
<#
  Monitor de Red - Instalador guiado (Windows)
  Uso: doble clic en INSTALAR.bat
  Hace todo: verifica Node.js y MySQL, pregunta la contraseña de root, genera config.env
  con secretos aleatorios, instala dependencias, compila y crea la base de datos.
  Se puede ejecutar varias veces sin perder la configuración existente.
#>
param([switch]$SoloConfigurar)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cfgFile = Join-Path $root 'config.env'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Titulo($t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "  [!] $t" -ForegroundColor Yellow }
function Fallo($t) { Write-Host "  [ERROR] $t" -ForegroundColor Red }
function Secreto($n) { $b = New-Object byte[] $n; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ([Convert]::ToBase64String($b)) -replace '[+/=]', 'x' }
function Preguntar($texto, $defecto) {
  $r = Read-Host "$texto [$defecto]"
  if ([string]::IsNullOrWhiteSpace($r)) { return $defecto } else { return $r.Trim() }
}
function PreguntarClave($texto) {
  $s = Read-Host $texto -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function LeerConfig() {
  $h = @{}
  if (Test-Path $cfgFile) { Get-Content $cfgFile | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { $h[$matches[1].Trim()] = $matches[2].Trim() } } }
  return $h
}

Write-Host ''
Write-Host '  Gestión de Infraestructura de Red 0.4.1 - Instalación guiada' -ForegroundColor Magenta
Write-Host '  Responda las preguntas o pulse Enter para aceptar el valor entre corchetes.'

# ---------------------------------------------------------------- Requisitos
if (-not $SoloConfigurar) {
  Titulo 'Paso 1 de 5: requisitos'
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { Fallo 'Node.js no está instalado.'; Write-Host '  Descárguelo (versión LTS 24) en https://nodejs.org , instálelo y vuelva a ejecutar INSTALAR.bat'; Read-Host 'Enter para salir'; exit 1 }
  $v = (node -v).TrimStart('v'); $parts = $v.Split('.') | ForEach-Object { [int]$_ }
  $okNode = ($parts[0] -ge 26) -or ($parts[0] -eq 24 -and ($parts[1] -gt 15 -or ($parts[1] -eq 15))) -or ($parts[0] -eq 22 -and ($parts[1] -gt 22 -or ($parts[1] -eq 22 -and $parts[2] -ge 3)))
  if (-not $okNode) { Fallo "Node.js $v es demasiado antiguo. Se necesita 24.15 o superior."; Write-Host '  Descargue la versión LTS en https://nodejs.org e instálela encima.'; Read-Host 'Enter para salir'; exit 1 }
  Ok "Node.js $v"
  $svc = Get-Service | Where-Object { $_.Name -like 'MySQL*' } | Select-Object -First 1
  if ($svc) {
    if ($svc.Status -ne 'Running') { Aviso "El servicio $($svc.Name) está detenido. Intentando iniciarlo..."; try { Start-Service $svc.Name; Ok "Servicio $($svc.Name) iniciado" } catch { Aviso 'No se pudo iniciar (ejecute como administrador o inícielo desde Servicios).' } }
    else { Ok "Servicio MySQL en ejecución ($($svc.Name))" }
  } else { Aviso 'No se encontró un servicio MySQL en este equipo. Si MySQL está en otro servidor, indíquelo en el siguiente paso.' }
}

# ---------------------------------------------------------------- Configuración
Titulo 'Paso 2 de 5: configuración'
$c = LeerConfig
if ($c.Count -gt 0) { Aviso 'Ya existe config.env; los valores actuales se muestran como predeterminados.' }

$dbHost = Preguntar 'Servidor MySQL' ($(if ($c.DB_HOST) { $c.DB_HOST } else { '127.0.0.1' }))
$dbPort = Preguntar 'Puerto MySQL' ($(if ($c.DB_PORT) { $c.DB_PORT } else { '3306' }))
$dbUser = Preguntar 'Usuario MySQL (el mismo de Workbench)' ($(if ($c.DB_USER) { $c.DB_USER } else { 'root' }))
$dbPass = ''
if ($c.DB_PASSWORD) { $dbPass = PreguntarClave "Contraseña MySQL de '$dbUser' (Enter = conservar la actual)"; if ([string]::IsNullOrEmpty($dbPass)) { $dbPass = $c.DB_PASSWORD } }
else { $dbPass = PreguntarClave "Contraseña MySQL de '$dbUser'" }
$dbName = Preguntar 'Nombre de la base de datos (se crea sola)' ($(if ($c.DB_NAME) { $c.DB_NAME } else { 'monitor_red' }))
$port = Preguntar 'Puerto de la página web' ($(if ($c.PORT) { $c.PORT } else { '3000' }))
$adminUser = Preguntar 'Usuario administrador de la web' ($(if ($c.ADMIN_USER) { $c.ADMIN_USER } else { 'admin' }))
$startLocalAgent = Preguntar '¿Ejecutar también un Agente de Sitio en este servidor? (true/false)' ($(if ($c.START_LOCAL_AGENT) { $c.START_LOCAL_AGENT } else { 'true' }))
$startLocalAgent = $(if ($startLocalAgent -match '^(?i:true|si|sí|s|1)$') { 'true' } else { 'false' })
if ($c.ADMIN_PASSWORD) {
  $adminPass = $c.ADMIN_PASSWORD
  Aviso 'Se conserva ADMIN_PASSWORD existente (sólo se usa si aún no existe el usuario administrador).'
} else {
  do { $adminPass = PreguntarClave 'Contraseña inicial del administrador (mín. 10 caracteres)' ; if ($adminPass.Length -lt 10) { Aviso 'Debe tener al menos 10 caracteres.' } } while ($adminPass.Length -lt 10)
}
$agentName = Preguntar 'Nombre del Agente de Sitio local (opcional, en este mismo equipo)' ($(if ($c.AGENT_NAME) { $c.AGENT_NAME } elseif ($c.PROBE_NAME) { $c.PROBE_NAME } else { "Agente-$env:COMPUTERNAME" }))
$jwt = if ($c.JWT_SECRET -and $c.JWT_SECRET.Length -ge 32) { $c.JWT_SECRET } else { Secreto 48 }
$tok = if ($c.AGENT_BOOTSTRAP_TOKEN -and $c.AGENT_BOOTSTRAP_TOKEN.Length -ge 32) { $c.AGENT_BOOTSTRAP_TOKEN } elseif ($c.PROBE_TOKEN -and $c.PROBE_TOKEN.Length -ge 32) { ($c.PROBE_TOKEN -split ',')[0] } else { Secreto 36 }
$localAgentToken = if ($c.AGENT_TOKEN -and $c.AGENT_TOKEN.Length -ge 20) { $c.AGENT_TOKEN } elseif ($c.PROBE_TOKEN_ACTIVE) { $c.PROBE_TOKEN_ACTIVE } else { $tok }
$legacyProbeToken = if ($c.PROBE_TOKEN) { $c.PROBE_TOKEN } else { $tok }

$plantilla = Get-Content (Join-Path $root 'config.env.example') -Raw
$valores = @{ DB_HOST = $dbHost; DB_PORT = $dbPort; DB_USER = $dbUser; DB_PASSWORD = $dbPass; DB_NAME = $dbName; PORT = $port
  ADMIN_USER = $adminUser; ADMIN_PASSWORD = $adminPass; JWT_SECRET = $jwt; START_LOCAL_AGENT = $startLocalAgent; AGENT_BOOTSTRAP_TOKEN = $tok; AGENT_TOKEN = $localAgentToken; AGENT_NAME = $agentName
  PROBE_TOKEN = $legacyProbeToken; API_URL = "http://localhost:$port/api"; CORS_ORIGIN = "http://localhost:$port,http://localhost:4200" }
# Si ya existe config.env, se parte del archivo REAL para conservar claves, comentarios y ajustes propios.
# Después sólo se agregan las claves nuevas de la plantilla y se actualizan los valores que el instalador administra.
if (Test-Path $cfgFile) {
  $salida = Get-Content $cfgFile -Raw
  $nuevas = New-Object System.Collections.Generic.List[string]
  foreach ($linea in ($plantilla -split "`r?`n")) {
    if ($linea -match '^\s*([^#=]+)=') {
      $clave = $matches[1].Trim()
      if ($salida -notmatch "(?m)^\s*$([regex]::Escape($clave))=") { [void]$nuevas.Add($linea) }
    }
  }
  if ($nuevas.Count -gt 0) { $salida = $salida.TrimEnd() + "`r`n`r`n# Claves agregadas automáticamente por V0.4.1`r`n" + ($nuevas -join "`r`n") + "`r`n" }
} else { $salida = $plantilla }
# Conservar valores avanzados ya editados por el usuario.
foreach ($k in 'CONFIG_REFRESH_SEC', 'HEARTBEAT_SEC', 'PROBE_CONCURRENCY', 'API_TIMEOUT_MS', 'PROBE_TOKEN_ACTIVE', 'SNMP_PROFILES_FILE', 'DNS_TEST_NAME', 'AGENT_BUFFER_DB', 'AGENT_BUFFER_MAX', 'RETENTION_DAYS', 'HEARTBEAT_RETENTION_HOURS', 'RETENTION_EVERY_MIN', 'AGENT_STALE_SEC', 'PROBE_STALE_SEC', 'FAIL_CONFIRMATIONS', 'RECOVERY_CONFIRMATIONS') { if ($c[$k]) { $valores[$k] = $c[$k] } }
if ($c.API_URL -and $c.API_URL -notmatch '^http://localhost') { $valores.API_URL = $c.API_URL }
foreach ($k in $valores.Keys) {
  $patron = "(?m)^\s*$([regex]::Escape($k))=.*$"
  if ($salida -match $patron) { $salida = [regex]::Replace($salida, $patron, { param($m) "$k=$($valores[$k])" }) }
  else { $salida = $salida.TrimEnd() + "`r`n$k=$($valores[$k])`r`n" }
}
[IO.File]::WriteAllText($cfgFile, $salida, (New-Object System.Text.UTF8Encoding $false))
Ok "config.env guardado en $cfgFile"

$profiles = Join-Path $root 'probe\config\snmp-profiles.json'
if (-not (Test-Path $profiles)) { Copy-Item (Join-Path $root 'probe\config\snmp-profiles.example.json') $profiles; Ok 'Perfiles SNMP de ejemplo creados (probe\config\snmp-profiles.json)' }
# Agrega únicamente perfiles nuevos del ejemplo; nunca reemplaza credenciales/perfiles existentes.
node (Join-Path $root 'scripts\actualizar-perfiles.js')
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron actualizar los perfiles SNMP conservando la configuración.' }
if ($SoloConfigurar) { Write-Host ''; Ok 'Configuración terminada. Reinicie con INICIAR.bat para aplicar los cambios.'; Read-Host 'Enter para salir'; exit 0 }

# ---------------------------------------------------------------- Dependencias
Titulo 'Paso 3 de 5: instalando dependencias (puede tardar varios minutos la primera vez)'
foreach ($d in 'backend', 'frontend', 'probe') {
  Write-Host "  - $d ..."
  Push-Location (Join-Path $root $d)
  try { npm install --no-audit --no-fund --loglevel=error; if ($LASTEXITCODE -ne 0) { throw "npm install falló en $d" } } finally { Pop-Location }
  Ok $d
}

# ---------------------------------------------------------------- MySQL
Titulo 'Paso 4 de 5: probando MySQL y creando la base de datos'
node (Join-Path $root 'scripts\probar-mysql.js')
if ($LASTEXITCODE -ne 0) { Write-Host ''; Aviso 'Corrija la contraseña ejecutando CONFIGURAR.bat y luego INSTALAR.bat de nuevo.'; Read-Host 'Enter para salir'; exit 1 }

# ---------------------------------------------------------------- Compilación
Titulo 'Paso 5 de 5: compilando'
& (Join-Path $root 'scripts\03-compilar.ps1')
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) { throw 'La compilación falló.' }

# ---------------------------------------------------------------- Migración automática
Titulo 'Actualizando esquema de base de datos (conserva datos existentes)'
Push-Location (Join-Path $root 'backend')
try {
  $env:MIGRATE_ONLY='1'
  node dist/main.js
  if ($LASTEXITCODE -ne 0) { throw 'La migración automática de la base de datos falló.' }
  Ok 'Base de datos actualizada a V0.4.1'
} finally {
  Remove-Item Env:MIGRATE_ONLY -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host ''
Write-Host '  ¡Instalación completa!' -ForegroundColor Green
Write-Host "  1. Doble clic en INICIAR.bat"
Write-Host "  2. Abra http://localhost:$port  (usuario: $adminUser)"
Write-Host "  3. Cambie la contraseña en Administración > Cambiar mi contraseña"
Write-Host "  La configuración del servidor está en config.env. Para agentes remotos use INSTALAR-AGENTE.bat" -ForegroundColor Gray
Read-Host 'Enter para salir'
