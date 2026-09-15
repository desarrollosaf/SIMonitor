# Manual de instalación en Windows

> **Aviso V0.4.0:** este documento conserva referencias históricas de versiones anteriores. Para despliegues multisitio use primero `ARQUITECTURA_MULTISITIO.md`, `INSTALACION_AGENTE_SITIO.md` y `GUIA_INVENTARIO_MULTISITIO.md`.

> **V0.3.0:** use `INSTALAR.bat` + `config.env`. El instalador conserva la configuración, migra MySQL automáticamente y agrega los perfiles de ejemplo faltantes sin reemplazar credenciales. Las referencias antiguas a `backend\.env` o `probe\.env` deben leerse como `config.env` en la raíz. Para puertos SNMP consulte `GUIA_INTERPRETAR_ERRORES_PUERTO.md`.

## Monitor de Red V0.2 - MySQL + Wi-Fi

### 1. Objetivo
Instalar el sistema en una computadora Windows para pruebas iniciales. En laboratorio pueden convivir Angular, NestJS, MySQL y la sonda en la misma máquina. Después la sonda puede trasladarse al edificio remoto y el servidor mantenerse centralizado.

### 2. Principios de seguridad
- No se realiza descubrimiento automático ni barrido de rangos IP.
- Sólo se consulta infraestructura registrada expresamente.
- No se capturan paquetes ni contenido de usuarios.
- El módulo Wi-Fi no conoce contraseñas de las redes inalámbricas.
- SNMP debe utilizarse en modo sólo lectura; se recomienda SNMPv3 `authPriv`.
- Las credenciales SNMP permanecen en la sonda y no se guardan en MySQL.
- No se modifica configuración de AP, switches ni controladores.
- MySQL debe permanecer local durante laboratorio.
- Para una sede remota, use VPN o HTTPS para el canal sonda-servidor; no abra puertos de administración hacia la LAN remota.

### 3. Versiones objetivo
- Windows 10/11 de 64 bits.
- Node.js 24.15 o posterior dentro de la rama compatible con Angular 22.
- MySQL 8.4 LTS.
- PowerShell 5.1 o superior.
- Navegador moderno.

### 4. Requisitos recomendados
- CPU 4 núcleos.
- 8 GB RAM mínimo; 16 GB recomendado.
- 10 GB libres para aplicación, dependencias, BD y logs.
- IP estable cuando otras estaciones consulten el dashboard.
- Para SNMP real, ruta IP desde la sonda a los AP/controlador y permiso UDP/161 únicamente donde sea necesario.

### 5. Estructura del proyecto
- `backend`: API NestJS, autenticación, MySQL y motor de alertas.
- `frontend`: Angular.
- `probe`: sonda de conectividad y SNMPv3.
- `probe\config`: perfiles SNMP locales.
- `database`: creación inicial de la BD/usuario MySQL.
- `scripts`: instalación, desarrollo, compilación e inicio automático.
- `docs`: manuales.

### 6. Instalar Node.js
Instale Node.js 24.15+ y verifique en una nueva ventana de PowerShell:

```powershell
node -v
npm -v
```

### 7. Instalar MySQL
Instale MySQL Server 8.4 LTS. Configure una contraseña robusta para `root` y mantenga el servidor escuchando localmente durante el laboratorio. MySQL Workbench es opcional.

### 8. Copiar el proyecto
Descomprima, por ejemplo, en:

```text
C:\MonitorRed
```

Evite OneDrive/Dropbox u otras carpetas sincronizadas durante las primeras pruebas.

### 9. Preparar la base de datos
Edite `database\init.sql` y cambie la contraseña de ejemplo de `monitor_user`. Después ejecute:

```powershell
mysql -u root -p < C:\MonitorRed\database\init.sql
```

El backend crea automáticamente las tablas de V0.2 al iniciar. Si actualiza desde V0.1, se conservan `sites`, `devices`, resultados e incidentes; se agregan las tablas Wi-Fi nuevas sin borrar los registros existentes.

### 10. Política de PowerShell
Si es necesario:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

No use `Unrestricted` como solución permanente.

### 11. Preparar dependencias
Desde la raíz:

```powershell
.\scripts\01-preparar.ps1
```

El script:
- instala dependencias de backend, frontend y sonda;
- crea `backend\.env` y `probe\.env` si no existen;
- crea `probe\config\snmp-profiles.json` a partir del ejemplo si no existe.

### 12. Configurar backend
Revise `backend\.env`:

```text
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=monitor_user
DB_PASSWORD=<clave MySQL>
DB_NAME=monitor_red
JWT_SECRET=<cadena aleatoria larga>
ADMIN_USER=admin
ADMIN_PASSWORD=<clave robusta>
PROBE_TOKEN=<token aleatorio largo>
CORS_ORIGIN=http://localhost:4200,http://localhost:3000
```

No reutilice la misma clave para JWT, administrador y sonda.

### 13. Configurar la sonda
Revise `probe\.env`:

```text
API_URL=http://localhost:3000/api
PROBE_TOKEN=<mismo valor del backend>
PROBE_NAME=Sonda-Edificio-Pruebas
CONFIG_REFRESH_SEC=60
HEARTBEAT_SEC=30
SNMP_PROFILES_FILE=./config/snmp-profiles.json
```

### 14. Proteger el archivo SNMP
`probe\config\snmp-profiles.json` puede contener secretos SNMPv3. Restrinja sus permisos NTFS a la cuenta que ejecutará la sonda y administradores autorizados. No lo suba a Git ni lo comparta por correo/chat.

### 15. Arranque de laboratorio
Ejecute:

```powershell
.\scripts\02-iniciar-pruebas.ps1
```

Abra:

```text
http://localhost:4200
```

### 16. Alta inicial de red cableada
Agregue gradualmente:
1. Gateway.
2. Switch principal.
3. Switches de acceso.
4. Destino WAN autorizado.
5. DNS/servicios.
6. AP.

Asigne correctamente el campo `Equipo padre` para que el diagnóstico conozca la dependencia lógica.

### 17. Probar el módulo Wi-Fi sin tocar la red
Registre un dispositivo tipo `ap / Wi-Fi` y active `Wi-Fi avanzado`. En `Perfil local` coloque:

```text
SIMULADOR-WIFI
```

El perfil genera métricas sintéticas dentro de la sonda. No envía SNMP ni otra consulta adicional al AP. Abra la pestaña `Wi-Fi` y verifique que aparecen AP, dos radios y un SSID de laboratorio.

### 18. Activar Wi-Fi en AP existentes de V0.1
En `Administración` use `Activar/ajustar Wi-Fi en un AP existente`. Seleccione el AP, habilite monitoreo avanzado, asigne el perfil y guarde. No es necesario borrar ni volver a crear el dispositivo.

### 19. Configurar SNMPv3 real
Antes de editar la sonda:
1. Cree en el AP/controlador un usuario exclusivo de monitoreo y sólo lectura.
2. Preferentemente use `authPriv` con SHA y AES si el fabricante lo soporta.
3. Limite por ACL la consulta a la IP de la sonda cuando sea posible.
4. Obtenga la MIB/OIDs exactos de la marca y modelo.
5. Valide primero en un AP de laboratorio.

Edite `probe\config\snmp-profiles.json`. Consulte `docs\PERFILES_SNMP_WIFI.md`.

### 20. Métricas Wi-Fi soportadas
Según lo que exponga el fabricante, la V0.2 puede almacenar:
- AP: clientes, uptime, PoE, velocidad de uplink, CPU y memoria.
- Radio: estado, banda, canal, ancho, clientes, utilización, ruido y potencia TX.
- SSID: estado, banda y clientes.

La ausencia de un OID no impide seguir monitoreando disponibilidad por PING/TCP.

### 21. Intervalo SNMP
El valor inicial es 120 s y el mínimo de la V0.2 es 30 s. Para pruebas normales se recomienda 60-180 s. No reduzca el intervalo sólo para obtener gráficas más densas; primero mida la carga del controlador/AP.

### 22. Umbrales Wi-Fi iniciales
El formulario permite configurar por AP:
- máximo de clientes: 40;
- utilización warning: 70%;
- utilización crítica: 85%;
- ruido warning: -75 dBm.

Son valores iniciales, no universales. Deben ajustarse a la línea base, densidad y diseño de RF del sitio.

### 23. Prueba de alarma de conectividad
Puede usar temporalmente `192.0.2.1` para verificar un incidente sin apagar infraestructura productiva. Elimine el registro al terminar.

### 24. Prueba de alertas Wi-Fi
Use `SIMULADOR-WIFI` para comprobar el tablero sin tocar la red. Para probar umbrales, disminuya temporalmente el máximo de clientes o el límite de utilización en un AP de laboratorio; restaure los valores después de verificar.

### 25. Compilar para operación fija
Ejecute:

```powershell
.\scripts\03-compilar.ps1
.\scripts\04-iniciar-produccion.ps1
```

La interfaz queda servida desde NestJS en:

```text
http://localhost:3000
```

### 26. Inicio automático
En PowerShell como administrador:

```powershell
.\scripts\05-registrar-inicio-automatico.ps1
```

Se crean tareas para backend y sonda. Los logs quedan en `logs\`.

### 27. Firewall
- No publique TCP/3306.
- Si otras PC acceden al dashboard, limite TCP/3000 a la red administrativa durante pruebas.
- Para SNMP, permita UDP/161 únicamente desde la sonda hacia los equipos necesarios.
- No publique UDP/161 a Internet.

### 28. Separar servidor y sonda
En el edificio remoto sólo necesita la sonda. Configure `API_URL` hacia el servidor central por VPN o HTTPS. La conexión de aplicación se inicia desde la sonda. Las consultas SNMP se mantienen locales dentro del edificio.

### 29. Migración a máquina fija
1. Respaldar MySQL.
2. Instalar Node/MySQL compatibles en el destino.
3. Copiar proyecto y archivos `.env` protegidos.
4. Copiar el perfil SNMP sólo si la nueva máquina será la sonda.
5. Ejecutar preparación/compilación.
6. Restaurar MySQL.
7. Validar heartbeat, conectividad y módulo Wi-Fi.
8. Registrar inicio automático al final.

### 30. Respaldo
```powershell
mysqldump -u root -p monitor_red > monitor_red_YYYYMMDD.sql
```

Respalde por separado los archivos secretos con controles adecuados. No incluya `snmp-profiles.json` en respaldos abiertos o repositorios públicos.

### 31. Solución rápida de problemas Wi-Fi
- `Perfil no encontrado`: revise el nombre exacto en MySQL/interfaz y en `snmp-profiles.json`.
- `SNMPv3 timeout`: confirme IP, UDP/161, ACL, usuario, nivel de seguridad y claves.
- AP responde PING pero no hay métricas: la conectividad básica funciona; revise perfil/OIDs SNMP.
- Sólo aparece uptime: el perfil sólo tiene el OID estándar de uptime; agregue OIDs del fabricante.
- Radios/SSID vacíos: el perfil no define OIDs para ellos o el equipo no los expone de esa forma.
- Valores absurdos: revise unidades del fabricante y use `scale`/`offset` en el perfil.

### 32. Criterio de aceptación
La instalación es satisfactoria cuando:
- `/api/health` devuelve `ok` y versión 0.3.0;
- se inicia sesión;
- la sonda aparece en línea;
- un dispositivo válido se monitorea;
- una falla controlada genera/resuelve incidente;
- un AP con `SIMULADOR-WIFI` aparece en la pestaña Wi-Fi;
- el backend conserva las métricas en MySQL;
- no se han abierto puertos innecesarios ni usado credenciales administrativas para SNMP.


## Anexo V0.3.0 - Cambios operativos

- **Contraseña del administrador:** `ADMIN_PASSWORD` sólo se usa al crear el usuario la primera vez. Para cambiarla después use `Administración > Cambiar mi contraseña` (mínimo 10 caracteres). Tras 5 intentos fallidos de login se bloquea el usuario/IP durante 15 minutos.
- **Retención de históricos:** el backend purga automáticamente resultados, métricas Wi-Fi, heartbeats e incidentes/alertas resueltos con más de `RETENTION_DAYS` días (30 por defecto, configurable en `backend\.env`).
- **Varias sondas:** defina un token por sonda en `PROBE_TOKEN=tokenA,tokenB` y un `PROBE_NAME` distinto en cada `probe\.env`. El dashboard muestra cada sonda por separado y alarma si cualquiera deja de reportar.
- **Sonda remota:** si la sonda cruza Internet, publique la API por HTTPS (reverse proxy con TLS) o VPN y use `API_URL=https://...`. Nunca HTTP plano fuera de la LAN.
- **Inicio automático:** `.\05-registrar-inicio-automatico.ps1 -Usuario "DOMINIO\svc_monitor"` registra las tareas con una cuenta de servicio sin privilegios. Ejecutarlo sin `-Usuario` usa SYSTEM y muestra una advertencia.
- **Estados:** `warning` y `critical` indican que el equipo responde pero con latencia alta (umbrales `warning_ms` / `critical_ms`); `down` se reserva para equipos sin respuesta. La sonda ahora usa el RTT real de `ping`, no el tiempo de ejecución del comando.
