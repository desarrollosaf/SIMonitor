$ErrorActionPreference='Continue'; $root=Resolve-Path "$PSScriptRoot\.."; New-Item -ItemType Directory -Path "$root\logs" -Force | Out-Null
$log="$root\logs\backend.log"; if((Test-Path $log) -and (Get-Item $log).Length -gt 20MB){ Move-Item $log "$root\logs\backend.$(Get-Date -f yyyyMMdd-HHmmss).log" -Force }
Set-Location "$root\backend"
while($true){ "[$(Get-Date -f s)] Iniciando servidor" | Tee-Object -FilePath $log -Append; node dist/main.js 2>&1 | Tee-Object -FilePath $log -Append; "[$(Get-Date -f s)] El servidor terminó; reintento en 10 s" | Tee-Object -FilePath $log -Append; Start-Sleep 10 }
