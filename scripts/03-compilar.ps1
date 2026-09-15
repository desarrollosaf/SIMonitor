$ErrorActionPreference='Stop'; $root=Resolve-Path "$PSScriptRoot\.."
foreach($d in 'backend','frontend','probe'){
  Write-Host "  Compilando $d..."
  if(Test-Path "$root\$d\dist"){ Remove-Item "$root\$d\dist" -Recurse -Force }
  Push-Location "$root\$d"; npm run build --loglevel=error; $code=$LASTEXITCODE; Pop-Location
  if($code -ne 0){ Write-Host "  La compilación de $d falló (código $code)." -ForegroundColor Red; exit $code }
}
$public="$root\backend\public"
if(Test-Path $public){Remove-Item $public -Recurse -Force}
New-Item -ItemType Directory -Path $public | Out-Null
$browser="$root\frontend\dist\monitor-red\browser"
if(-not (Test-Path $browser)){ $browser="$root\frontend\dist\monitor-red" }
Copy-Item "$browser\*" $public -Recurse -Force
Write-Host '  Compilación terminada. La página web se sirve desde el backend (puerto de config.env).' -ForegroundColor Green
exit 0
