# Guía de instalación — Servidor central (Administrador)

**Gestión de Infraestructura de Red V0.4.1** · Windows

Esta guía es para la persona que instala y administra el sistema. Si lo que necesita es instalar un agente en una sede, use la otra guía: `GUIA_INSTALACION_AGENTE_SITIO.md`.

---

## 1. Antes de empezar

### Qué se instala dónde

El sistema tiene dos piezas y sólo una de ellas va en este equipo:

| Pieza | Dónde se instala | Qué necesita |
|---|---|---|
| **Servidor central** | Un solo equipo o servidor | Node.js + MySQL + esta guía |
| **Agente de Sitio** | Un equipo por cada sede/edificio | Sólo Node.js. **No necesita MySQL** |

El servidor central guarda todo (sedes, inventario, histórico, incidentes) y publica la página web. Los agentes miden desde dentro de cada red y le envían los resultados.

### Requisitos del equipo

- **Windows 10/11 o Windows Server 2019/2022.**
- **Node.js 24.15 LTS o superior.** Descárguelo de https://nodejs.org e instálelo con las opciones por defecto. El instalador verifica la versión y se detiene si es antigua.
- **MySQL 8.0 o superior**, en este mismo equipo o en otro servidor al que se pueda llegar por red. No hace falta crear la base de datos a mano: el sistema la crea sola.
- **Espacio en disco**: 2 GB para la instalación, más el histórico. Con retención de 30 días y unos 200 equipos monitorizados, cuente entre 2 y 5 GB adicionales.
- El equipo debe estar **encendido de forma permanente**: mientras esté apagado no se recibe ninguna medición.

### Decisiones que conviene tomar antes

1. **¿Qué puerto usará la web?** Por defecto el 3000. Si ya está ocupado, elija otro.
2. **¿Qué usuario de MySQL usará?** Para probar, `root` sirve. Para producción, cree un usuario dedicado (§8.1).
3. **¿Los agentes remotos llegarán a este servidor?** Necesitan alcanzar `http://<IP-del-servidor>:3000/api` desde cada sede. Verifíquelo antes, porque es el punto donde más se atasca la puesta en marcha.

---

## 2. Instalación

1. Copie la carpeta completa del sistema a una ruta **sin espacios ni acentos**. Recomendado: `C:\MonitorRed`.
2. Doble clic en **`INSTALAR.bat`**.
3. Responda las preguntas. Pulse Enter para aceptar el valor que aparece entre corchetes.

El instalador recorre cinco pasos:

| Paso | Qué hace |
|---|---|
| 1 | Verifica Node.js y el servicio de MySQL (lo inicia si está detenido) |
| 2 | Le pregunta la configuración y genera `config.env` con secretos aleatorios |
| 3 | Instala dependencias de backend, frontend y agente (tarda varios minutos la primera vez) |
| 4 | Prueba la conexión a MySQL y crea la base de datos |
| 5 | Compila y actualiza el esquema de la base |

### Qué le va a preguntar

| Pregunta | Qué responder |
|---|---|
| Servidor MySQL | `127.0.0.1` si MySQL está en este equipo |
| Puerto MySQL | `3306` salvo que lo haya cambiado |
| Usuario MySQL | El mismo con el que entra a MySQL Workbench |
| Contraseña MySQL | La de ese usuario |
| Nombre de la base de datos | `monitor_red` (se crea sola) |
| Puerto de la página web | `3000` |
| Usuario administrador de la web | `admin` |
| ¿Ejecutar también un Agente de Sitio en este servidor? | `true` si quiere monitorear también la red donde está el servidor |
| Contraseña inicial del administrador | **Mínimo 10 caracteres.** Sólo se usa la primera vez |
| Nombre del Agente local | Cualquier nombre reconocible |

> **Sobre la contraseña del administrador:** sólo se aplica cuando el usuario todavía no existe. Si más adelante la cambia desde la web, editar `config.env` no la revierte.

### Si vuelve a ejecutar INSTALAR.bat

Es seguro hacerlo tantas veces como quiera. Conserva su `config.env`, sus comentarios y sus ajustes propios; sólo agrega las claves nuevas y actualiza lo que el instalador administra. También conserva `probe\config\snmp-profiles.json` sin tocar sus credenciales.

---

## 3. Primer arranque

1. Doble clic en **`INICIAR.bat`**. Se abre solo el navegador en `http://localhost:3000`.
2. Entre con el usuario y la contraseña que definió.
3. **Primera tarea: vaya a `Agentes / Admin` → `Cambiar mi contraseña`.**

### Revise la consola la primera vez

La ventana negra que queda abierta muestra el arranque. Preste atención a dos cosas:

- `Base de datos 'monitor_red' lista ... Esquema V0.4.1 verificado/actualizado.` → todo bien.
- Si aparece `AVISO: no se pudo crear el índice único ...`, significa que en su base ya hay valores repetidos (códigos de sede, números de inventario o números de serie duplicados). El sistema arranca igual, pero conviene depurar esos duplicados y reiniciar para que quede activa la protección.

No cierre esa ventana: mientras esté abierta, el sistema está funcionando. Para detenerlo use **`DETENER.bat`**.

---

## 4. Orden de configuración recomendado

Este orden evita rehacer trabajo:

```
1. Crear las SEDES          → pestaña Sedes
2. Crear un AGENTE por sede → pestaña Agentes / Admin   (aquí sale el token)
3. Instalar el agente en cada sede    (con la otra guía y su token)
4. Verificar que aparezcan EN LÍNEA   → pestaña Dashboard
5. Registrar los EQUIPOS de cada sede → pestaña Inventario
6. Documentar interfaces, y configurar Wi-Fi/puertos si aplica
```

### 4.1 Crear una sede

`Sedes` → complete el formulario → `Registrar sede`.

El código (por ejemplo `PL-SANTANDER`) se genera solo a partir del nombre si lo deja vacío, y **debe ser único**. Conviene llenar municipio y criticidad aunque parezcan opcionales: son los campos por los que después podrá filtrar y comparar sedes en la pestaña de Análisis.

Para corregir una sede use `Editar` en la tabla. Para darla de baja, `Eliminar`: sólo funciona si ya no tiene equipos ni agentes, precisamente para que no se pierda el histórico por accidente.

### 4.2 Crear un Agente de Sitio y obtener su token

`Agentes / Admin` → complete nombre, código y sede → `Generar agente y token`.

**El token aparece una sola vez, en el recuadro de la derecha.** Cópielo en ese momento y guárdelo donde corresponda; el servidor no lo vuelve a mostrar nunca. Si lo pierde, no hay problema: use `Nuevo token` en la fila de ese agente y se genera otro.

> **Un token por sede.** No reutilice el mismo token en varios sitios. Además del riesgo obvio, dos agentes con el mismo token se registran como si fueran uno solo y verá el nombre del equipo y la última conexión alternando entre las sedes.

Desde la tabla de agentes puede además:

- **Editar**: nombre, código, sede, descripción y si está habilitado.
- **Nuevo token**: revoca el anterior de inmediato. Después hay que actualizar `agent.env` en la sede y reiniciar el agente, o dejará de reportar.
- **Eliminar**: revoca el token y libera los equipos que tuviera asignados. **Los equipos no se borran**, quedan sin agente y hay que reasignarlos.

### 4.3 Registrar equipos

`Inventario` → `Nuevo equipo`.

Lo mínimo para que empiece a monitorearse: **sede, nombre, host/IP y tipo de prueba**. Todo lo demás (inventario patrimonial, ubicación física, garantía) puede completarlo después con `Editar`, sin perder el histórico.

Sobre el campo **Agente de Sitio**:

- `Heredar agente de la sede` funciona cuando la sede tiene **exactamente un** agente activo. Es lo normal y lo más cómodo.
- Si una sede tiene dos o más agentes, la herencia se desactiva a propósito (para no medir dos veces lo mismo) y **hay que asignar el agente explícitamente en cada equipo**. El panel se lo avisa con el mensaje "equipos sin Agente de Sitio válido".

Sobre el tipo de prueba:

| Tipo | Para qué sirve | Campos que usa |
|---|---|---|
| `ping` | Cualquier equipo con IP. Es el predeterminado | Host |
| `tcp` | Comprobar que un servicio responde | Host + Puerto |
| `dns` | Verificar que un servidor DNS resuelve | Host = el servidor DNS; Ruta = el nombre a resolver |
| `https` | Portales y consolas web | Host + Ruta |

> Con `https` el sistema **valida el certificado**. Un switch, AP o UPS con certificado autofirmado aparecerá siempre como caído. Para esos equipos use `ping` o `tcp`.

El campo **Equipo padre** es el que hace útil el diagnóstico: si marca que los equipos de un piso dependen de su switch, cuando ese switch caiga el sistema le dirá "el equipo padre también está sin comunicación, revise primero ahí" en lugar de abrirle veinte incidentes sin contexto.

### 4.4 Monitoreo Wi-Fi y de puertos (opcional)

Se configura en `Agentes / Admin`, en los dos formularios de abajo. Necesita que el perfil SNMP exista en el agente de esa sede (§6).

Para quitarlo, cada formulario tiene `Quitar monitoreo`: cierra las alertas abiertas y conserva el histórico.

---

## 5. Puesta en producción

### 5.1 Inicio automático con Windows

Doble clic en **`INICIO-AUTOMATICO.bat`** y acepte la ventana de permisos de administrador. Registra dos tareas programadas que arrancan con el equipo.

Por defecto usa la cuenta `SYSTEM`, y el propio script le avisa de que no es lo recomendable. Para producción, abra PowerShell **como administrador** y ejecute:

```powershell
cd C:\MonitorRed\scripts
.\05-registrar-inicio-automatico.ps1 -Usuario "DOMINIO\svc_monitor"
```

Con una cuenta de servicio dedicada el archivo de credenciales SNMP queda protegido con permisos NTFS de esa cuenta. Ni el servidor ni el agente necesitan privilegios de sistema.

Para quitar las tareas: `scripts\06-eliminar-inicio-automatico.ps1`.

**Reinicie el equipo y compruebe que todo levanta solo antes de dar por terminada la instalación.**

### 5.2 Abrir el firewall

En el servidor central, permita la entrada al puerto de la web:

```powershell
New-NetFirewallRule -DisplayName "Monitor de Red - Web/API" -Direction Inbound `
  -Protocol TCP -LocalPort 3000 -Action Allow
```

Ajuste el puerto si cambió el predeterminado.

### 5.3 Ajustar CORS y la URL de la API

Si los agentes van a conectarse por la IP o el nombre del servidor (no por `localhost`), edite `config.env`:

```
CORS_ORIGIN=http://10.20.0.5:3000,http://monitor.midominio.local:3000
```

Y reinicie con `DETENER.bat` + `INICIAR.bat`.

### 5.4 Publicar por HTTPS

**El token de cada agente viaja en una cabecera HTTP.** Si los agentes están en otras sedes y el tráfico cruza la WAN, publique el sistema detrás de un proxy inverso con TLS (IIS con ARR, nginx o Caddy) y configure los agentes con `https://`. Por HTTP plano el token viaja legible.

---

## 6. Perfiles SNMP

Viven en `probe\config\snmp-profiles.json`, en **cada equipo con agente** (incluido este servidor si tiene agente local). El servidor central sólo guarda el *nombre* del perfil; el contenido y las credenciales están en el agente.

Vienen cuatro de ejemplo:

| Perfil | Para qué |
|---|---|
| `SIMULADOR-WIFI` | Pruebas. Genera métricas Wi-Fi falsas, **no consulta la red** |
| `SIMULADOR-SWITCH` | Pruebas. Simula un switch de 24 puertos |
| `SNMPV3-ESTANDAR` | Switches con IF-MIB / IF-X-MIB / EtherLike-MIB y LLDP estándar |
| `LAB-SNMPV3-EJEMPLO` | Plantilla para APs; sustituya OIDs por los de su fabricante |

Para usar SNMP real, edite el archivo y sustituya `CAMBIAR_AUTH_KEY` y `CAMBIAR_PRIV_KEY` por las credenciales reales del usuario SNMP de sólo lectura.

> **Limitación importante:** el agente sólo habla **SNMPv3**. Los equipos que únicamente tengan v2c habilitado no se pueden consultar todavía. Verifíquelo antes de planificar el monitoreo de puertos.

Al ejecutar `INSTALAR.bat` de nuevo, los perfiles nuevos del ejemplo se agregan pero **sus credenciales no se sobrescriben nunca**.

---

## 7. Operación diaria

| Quiero... | Cómo |
|---|---|
| Iniciar el sistema | `INICIAR.bat` |
| Detenerlo | `DETENER.bat` |
| Cambiar configuración sin reinstalar | `CONFIGURAR.bat`, luego reiniciar |
| Ver el estado general | Pestaña Dashboard |
| Saber qué sede falla más | Pestaña Análisis |
| Revisar el log del agente local | `logs\probe.log` |

### Qué mirar en el panel

- 🔴 **Equipos sin comunicación** — hay caídas activas.
- 🔴 **Agentes sin heartbeat** — un agente dejó de reportar. Puede ser el agente, el equipo donde corre o el enlace de esa sede. Mientras tanto, **esos equipos no se están midiendo**, aunque aparezcan como "sin datos" y no como caídos.
- ⚪ **Equipos sin Agente válido** — típicamente una sede con dos agentes donde falta asignar explícitamente.
- La columna **buffer** de cada agente: si crece, el agente está midiendo pero no logra entregar los resultados. Suele ser problema de red o de token.

### Retención de datos

Configurable en `config.env`:

```
RETENTION_DAYS=30              # mediciones, métricas e incidentes resueltos
HEARTBEAT_RETENTION_HOURS=48   # detalle de heartbeats
AUDIT_RETENTION_DAYS=365       # bitácora de cambios del inventario
```

La limpieza corre sola cada hora, por lotes, para no bloquear la base.

---

## 8. Producción: recomendaciones

### 8.1 Usuario dedicado de MySQL

No deje `root` en producción. En MySQL Workbench, conectado como root, abra `database\init.sql`, **cambie la contraseña de ejemplo** y ejecútelo. Después, en `config.env`:

```
DB_USER=monitor_user
DB_PASSWORD=<la contraseña que puso>
```

Reinicie y confirme en la consola que la base arranca sin errores.

### 8.2 Respaldos

Respalde dos cosas:

```powershell
# 1. La base de datos
mysqldump -u root -p monitor_red > C:\Respaldos\monitor_red_%DATE%.sql

# 2. La configuración y los perfiles SNMP
copy C:\MonitorRed\config.env C:\Respaldos\
copy C:\MonitorRed\probe\config\snmp-profiles.json C:\Respaldos\
```

`config.env` contiene el `JWT_SECRET` y el token del agente local; guárdelo con el mismo cuidado que una contraseña.

### 8.3 Cuentas de usuario

En esta versión **sólo existe el usuario administrador** y no hay gestión de usuarios ni de roles desde la web: cualquiera que entre puede crear agentes, ver sus tokens y borrar equipos. Trate esa contraseña como una credencial de administración y no la comparta para consultas.

---

## 9. Problemas frecuentes

**`ERROR: no se pudo conectar a MySQL`**
Revise que el servicio MySQL esté iniciado y que `DB_USER`/`DB_PASSWORD` de `config.env` sean los mismos con los que entra a Workbench. Corrija con `CONFIGURAR.bat`. Para diagnosticar: `node scripts\probar-mysql.js`.

**`Ya hay algo escuchando en el puerto 3000`**
El sistema ya está iniciado, o hay otro programa usando el puerto. Ejecute `DETENER.bat` y vuelva a intentar. Para cambiar de puerto: `CONFIGURAR.bat`.

**`El sistema no está compilado`**
Falta ejecutar `INSTALAR.bat`, o la compilación falló. Vuelva a ejecutarlo y lea los mensajes del paso 5.

**`No existe un administrador y ADMIN_PASSWORD no está definida`**
Ponga en `config.env` una `ADMIN_PASSWORD` de 10 caracteres o más y reinicie.

**Un agente aparece SIN HEARTBEAT**
Por orden: ¿el equipo de la sede está encendido?, ¿el agente está corriendo?, ¿`API_URL` en su `agent.env` apunta a este servidor?, ¿el firewall permite el puerto?, ¿el token sigue siendo válido? Revise `logs\probe.log` en el equipo de la sede.

**Un equipo aparece como "sin datos" y no como caído**
Nadie lo está midiendo. Casi siempre es porque su agente está fuera de línea, o porque la sede tiene varios agentes y falta asignarle uno explícitamente.

**Todos los equipos de una sede pasan a "sin datos" de golpe**
Mire el reloj del equipo donde corre ese agente. Si está muy desfasado, las mediciones llegan con fecha inválida. Sincronícelo con NTP.

---

## 10. Lista de verificación final

- [ ] `INSTALAR.bat` terminó sin errores
- [ ] La web abre y se puede iniciar sesión
- [ ] La contraseña del administrador se cambió desde la web
- [ ] La consola no muestra avisos de índices únicos
- [ ] Las sedes están creadas
- [ ] Cada sede tiene su agente y su token propio, guardado en lugar seguro
- [ ] El firewall permite el puerto de la web
- [ ] Inicio automático registrado con cuenta de servicio, y **probado reiniciando el equipo**
- [ ] Respaldo de base de datos programado
- [ ] `config.env` y `snmp-profiles.json` respaldados
- [ ] Usuario dedicado de MySQL configurado (producción)
