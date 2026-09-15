$root=Resolve-Path "$PSScriptRoot\.."
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$root\backend'; npm run start:dev"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$root\frontend'; npm start"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList '-NoExit','-Command',"cd '$root\probe'; npm run dev"
Write-Host 'Se abrieron tres ventanas: API, interfaz y sonda.' -ForegroundColor Green
Write-Host 'Abra http://localhost:4200'
