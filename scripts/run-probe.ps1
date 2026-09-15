$ErrorActionPreference='Continue'; $root=Resolve-Path "$PSScriptRoot\.."; New-Item -ItemType Directory -Path "$root\logs" -Force | Out-Null
$log="$root\logs\probe.log"; if((Test-Path $log) -and (Get-Item $log).Length -gt 20MB){ Move-Item $log "$root\logs\probe.$(Get-Date -f yyyyMMdd-HHmmss).log" -Force }
Set-Location "$root\probe"
while($true){ "[$(Get-Date -f s)] Iniciando Agente de Sitio" | Tee-Object -FilePath $log -Append; node dist/index.js 2>&1 | Tee-Object -FilePath $log -Append; "[$(Get-Date -f s)] El Agente de Sitio terminó; reintento en 10 s" | Tee-Object -FilePath $log -Append; Start-Sleep 10 }
