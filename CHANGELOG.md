# Changelog

## 0.4.2 - 2026-09-15
### Catálogo de VLANs y subredes
- Nueva tabla `site_vlans` y sección **Configuración → VLANs**: cada sede puede declarar sus VLANs con nombre, propósito (datos, voz, gestión, cámaras, impresión, servidores, control de acceso, invitados), subred CIDR, gateway y rango DHCP.
- **Los campos de VLAN pasan a ser desplegables** —con número y nombre— en el formulario de equipo y en el de interfaces, en cuanto la sede tiene catálogo. Sin catálogo se sigue capturando el número libre, así que la adopción es gradual y por sede.
- **Validación contra el catálogo**: una VLAN no declarada se rechaza con la lista de las disponibles. Antes un número mal tecleado se guardaba sin más.
- **Validación de IP contra la subred de la VLAN**: si la VLAN declara CIDR, una dirección fuera de rango se rechaza indicando la subred esperada.
- Protecciones: no se puede eliminar ni renumerar una VLAN en uso, y el número es único por sede. El catálogo muestra cuántas interfaces y cuántos equipos usan cada VLAN.
- Endpoints `GET /api/vlans`, `GET /api/sites/:id/vlans`, `POST /api/sites/:id/vlans`, `PATCH /api/vlans/:id`, `DELETE /api/vlans/:id`.

## 0.4.1 - 2026-09-15
### Correcciones
- **Editar un equipo devolvía error 400.** La lista de equipos entrega `wifi_enabled` como 0/1 y el formulario lo reenviaba tal cual, chocando contra la validación `@IsBoolean()`. Se normaliza en el formulario y, además, los DTO aceptan ahora 0/1/"true" en todos los campos booleanos (`ToBool`).
- **Editar cualquier equipo creaba configuración Wi-Fi.** La condición `body.wifi_enabled !== undefined` se cumplía siempre; ahora sólo se toca `wifi_ap_config` si el equipo es un AP, si se pide habilitarlo, o si ya tenía configuración.
- **El `token_hash` de los Agentes de Sitio viajaba al navegador** en `/api/agents`, `/api/probes` y el resumen del panel. Las consultas enumeran columnas y ya no lo incluyen.
- **`checked_at` del agente se valida** (`safeCheckedAt`): una fecha inválida provocaba un error de MySQL y un reloj desfasado hacía que los equipos aparecieran como "sin datos" sin motivo aparente.
- **Fuga de temporizador en la web**: el refresco automático se acumulaba con cada inicio de sesión. Ahora se detiene al salir.
- Alta de equipo devuelve la fila real y, si es un switch, crea también su configuración de puertos (antes sólo lo hacía para Wi-Fi).
- `GET /devices/:id` consulta un único equipo en lugar de cargar todo el inventario y filtrarlo en memoria.

### Agente de Sitio
- **Ciclos separados para sondeos y SNMP.** Antes compartían un candado: un switch lento dejaba sin pinguear a toda la sede durante minutos. Cada ciclo tiene su propia concurrencia (`PROBE_CONCURRENCY`, `SNMP_CONCURRENCY`) y hay un tope por dispositivo (`DEVICE_TIMEOUT_MS`).
- **Ping con varios paquetes** (`PING_COUNT`, 4 por defecto): se reporta `packet_loss` real —la columna existía y nunca se llenaba— y la pérdida parcial se clasifica como advertencia en lugar de caída.
- **El buffer ya no se atasca**: un elemento rechazado repetidamente se descarta tras `AGENT_BUFFER_MAX_ATTEMPTS` intentos (20 por defecto). Antes bloqueaba la cola indefinidamente.

### Inventario
- **Catálogo de tipos ampliado y agrupado**: teléfonos IP, copiadoras/multifuncionales, escáneres de red, conmutador/PBX, equipos de cómputo, almacenamiento/NAS, controladora Wi-Fi, NVR/DVR, control de acceso, reloj checador y proyector, además de los existentes. Ahora con etiquetas en español y agrupados por categoría.
- **Corregida la detección de access points.** Se hacía por subcadena (`includes('ap')`), así que un equipo de tipo `laptop` se trataba como AP y se le creaba configuración Wi-Fi. Ahora la coincidencia es exacta, tanto en el backend como en el listado de APs de la interfaz.
- Nueva guía `docs/GUIA_REGISTRO_INVENTARIO.md` con criterios de captura, manejo de VLANs y un ejemplo completo de alta de un piso.

### Monitor de sala de control
- **Nueva pestaña *Monitor***: tablero oscuro a pantalla completa con todas las incidencias activas, pensado para dejarlo en una pantalla dedicada.
- **Alarma sonora al aparecer una incidencia nueva**: tono triple agudo para las críticas y doble grave para las advertencias, generados por el navegador (sin archivos de audio). El operador debe pulsar *Activar sonido* una vez por sesión, porque los navegadores no permiten reproducir audio sin una acción del usuario.
- Mientras quede una incidencia crítica sin reconocer, el tono se repite cada 20 segundos y el borde del tablero parpadea. El botón *Silenciar* reconoce lo que está en pantalla; una incidencia nueva vuelve a sonar.
- Nuevo endpoint `GET /api/monitor/events`: unifica en una sola consulta las caídas de equipo, alertas de puerto, alertas Wi-Fi y **agentes sin comunicación**, que antes no generaban ninguna incidencia pese a dejar una sede entera sin medir.
- Resumen por sede, filtro al hacer clic en una sede, antigüedad de cada incidencia, y salto directo al detalle correspondiente al pulsar una fila.
- Intervalo de refresco configurable (5/10/15/30 s), reloj, botón de pantalla completa y notificaciones del navegador. Las preferencias de sonido e intervalo se recuerdan.

### Interfaz reorganizada por secciones
- **El menú se divide en tres bloques**: *Operación* (panel, incidentes, puertos, Wi-Fi, análisis), *Configuración* (sedes, agentes, inventario, monitoreo SNMP) y *Cuenta*.
- **"Cambiar mi contraseña" sale de la administración de dispositivos** y pasa a la sección *Mi cuenta*, junto con los datos de sesión. Estaba mezclada con la configuración SNMP de switches y APs.
- **La pestaña "Agentes / Admin" se separa en dos**: *Agentes* queda sólo para los Agentes de Sitio, y la configuración SNMP de switches y APs pasa a su propia sección *Monitoreo SNMP*.
- **Nueva sección "Puesta en marcha"**: cinco pasos numerados que se marcan como listos según los datos existentes, con su propio botón para ir a cada uno. El panel avisa cuántos pasos quedan pendientes.
- Los pasos de configuración se numeran en el menú (1 Sedes → 2 Agentes → 3 Inventario → 4 Monitoreo SNMP) y cada sección enlaza al paso siguiente.
- Los formularios largos indican qué secciones son obligatorias y cuáles son documentación, y el formulario de equipo explica qué campos usa cada tipo de prueba.
- Textos de ayuda contextual en sedes, agentes, inventario y monitoreo; tablas vacías con mensaje explicativo en lugar de quedarse en blanco.
- La pantalla de Agentes incluye las instrucciones de instalación y un botón para copiar el token.

### Editar y eliminar en todos los formularios
- **Sedes**: botón Eliminar, con bloqueo si todavía tiene equipos o agentes (para no perder histórico por accidente).
- **Agentes de Sitio**: formulario de edición completo (nombre, código, sede, descripción, habilitado), eliminación con liberación de los equipos asignados, y **regeneración de token** que revoca el anterior de inmediato.
- **Monitoreo Wi-Fi y de puertos**: botón "Quitar monitoreo" que cierra las alertas abiertas y conserva el histórico.
- **Puertos de switch**: botón Restablecer para limpiar nombre funcional, velocidad esperada y marcas de crítico/uplink.
- Todas las operaciones muestran el mensaje de error del servidor en pantalla en lugar de fallar en silencio.

### Base de datos y mantenimiento
- Índices `UNIQUE` en `sites.code`, `probes.agent_code`, `devices.inventory_number` y `devices.serial_number`. Si la instalación ya tiene duplicados, el arranque avisa por consola y continúa sin crear el índice.
- La purga de retención se hace por lotes de 5 000 filas: un `DELETE` sin límite sobre `switch_port_metrics` podía bloquear la tabla varios minutos.
- `inventory_audit` entra en la retención con periodo propio (`AUDIT_RETENTION_DAYS`, 365 días por defecto).

## 0.4.0 - 2026-09-14
### Arquitectura multisitio distribuida
- La sonda evoluciona a **Agente de Sitio** con credencial individual por edificio.
- Cada agente puede quedar asociado a una sede; los equipos pueden asignarse explícitamente o heredar el único agente activo de su sede.
- Si una sede tiene varios agentes, la asignación automática se desactiva para evitar mediciones duplicadas.
- El servidor valida la pertenencia equipo-agente antes de aceptar resultados.
- Nuevo `INSTALAR-AGENTE.bat` / `INICIAR-AGENTE.bat` para despliegue remoto sin MySQL.
- Buffer SQLite local: el agente sigue midiendo durante una pérdida de WAN/API y reenvía pendientes al recuperar conectividad.

### Sedes e inventario
- Dirección estructurada: país, estado, municipio, localidad, colonia, CP, calle, números, referencias y coordenadas opcionales.
- Datos de responsables, horario, contacto técnico, ISP principal/secundario y ancho de banda.
- Inventario ampliado con números patrimoniales, fabricante/modelo/serie, part number, service tag, firmware/SO, garantía, proveedor, contrato, criticidad y ciclo de vida.
- Ubicación física por edificio/sección, piso, área, cuarto/SITE, rack y unidad U.
- Red detallada: hostname/FQDN, MAC, VLAN, máscara, gateway, DNS y método de direccionamiento.
- Nueva tabla `device_interfaces` para múltiples MAC/IP/VLAN y trazabilidad a switch, `ifIndex`, nombre físico de puerto, roseta y patch panel.
- **Inventario monitorizado editable** desde la web; ya no se limita a eliminar.
- Bitácora `inventory_audit` para altas, cambios y eliminaciones de sedes, agentes, equipos e interfaces.

### Análisis
- Nuevo ranking de fallas por sede para 7/30/90/365 días.
- Disponibilidad operativa aproximada, incidentes, incidentes por 100 equipos, críticos, minutos caídos, MTTR, alertas de puertos/Wi-Fi e índice de riesgo normalizado por tamaño de sede.
- Filtros de inventario por sede, tipo, fabricante, ciclo de vida, criticidad, estado de monitoreo y búsqueda textual; análisis filtrable por municipio y criticidad.

### Operación central/remota
- El servidor central puede operar sin un agente local mediante `START_LOCAL_AGENT=false`; los 17 edificios pueden usar únicamente `INSTALAR-AGENTE.bat`.
- El instalador remoto conserva `agent.env` y perfiles SNMP existentes al reejecutarse.
- Las relaciones equipo-padre, agente-sede e interfaz-switch se validan para impedir cruces accidentales entre edificios.

### Compatibilidad
- Conserva Angular/NestJS/MySQL y las funciones V0.3.0 de puertos SNMP, Wi-Fi, incidentes, estado vencido y retención.
- Migración incremental: `INSTALAR.bat` agrega campos/tablas sin borrar configuración ni históricos existentes.

## 0.3.0 - 2026-09-14
### Puertos de switch por SNMP
- Nueva recolección cada 5 minutos por defecto, configurable por switch.
- IF-MIB/IF-X-MIB/EtherLike-MIB con LLDP opcional; contadores de 64 bits preferidos.
- Estado, velocidad, dúplex, bytes RX/TX, Mbps por intervalo, CRC/FCS, colisiones tardías y descartes.
- Sólo los puertos con enlace generan histórico; los apagados mantienen únicamente una fila de estado actual.
- Nueva retención para `switch_port_metrics` y alertas de puerto resueltas usando `RETENTION_DAYS` (30 por defecto).
- Perfil `SIMULADOR-SWITCH` para validar interfaz y flujo sin consultar infraestructura real.

### Diagnóstico y alertas
- CRC/FCS crecientes: recomendación de revisar cable/conector/patch panel/SFP.
- Alerta por half-duplex y por negociación inferior a velocidad esperada/histórica.
- Uplink configurable: alerta si supera 80% durante 10 minutos por defecto.
- Detección de descartes simultáneos en múltiples puertos como indicio de congestión, bucle o tormenta.
- Puertos marcados críticos generan alarma roja al perder enlace.
- La alerta de utilización de canal Wi-Fi se conserva e integra al flujo de diagnóstico.

### Interfaz
- Vista `Puertos con problemas` en Dashboard, priorizada por gravedad.
- Módulo `Puertos` con mapa de interfaces por switch, estado por color, LLDP y detalle.
- Gráficas de tráfico RX/TX, CRC/FCS y descartes de las últimas 24 h.
- Nombre funcional por puerto, velocidad esperada y banderas `crítico` / `uplink`.
- Umbrales de puerto editables desde Administración.

### Multisede y confiabilidad
- Tabla `probes`: cada token identifica una sonda y los dispositivos pueden asignarse a ella.
- Una sonda no puede reportar dispositivos asignados a otra.
- Compatibilidad de una sola sonda: si aún no hay asignaciones, se entregan todos los dispositivos.
- Estado efectivo `unknown/sin datos` si la última medición excede 2.5 veces su intervalo.
- Confirmación de fallos (`FAIL_CONFIRMATIONS=3`) y recuperación (`RECOVERY_CONFIRMATIONS=2`) para reducir falsos incidentes.
- DNS ahora consulta el servidor configurado directamente usando un nombre de prueba.
- Timeout de llamadas sonda→API configurable (`API_TIMEOUT_MS`).

### Instalación / migración
- `INSTALAR.bat` conserva `config.env` completo (incluidas claves/comentarios propios), perfiles SNMP y datos existentes.
- La instalación ejecuta la migración automática del esquema a V0.3.0 y agrega índices de retención para mantener eficiente la purga del histórico.
- Los perfiles nuevos del archivo de ejemplo se agregan sin reemplazar perfiles/credenciales existentes.
- Nueva guía `docs/GUIA_INTERPRETAR_ERRORES_PUERTO.md`.

## 0.2.1 - 2026-09-14
### Corregido
- `frontend/package.json` pedía `@angular/*` 22.1.8, versión inexistente en npm: `npm install` fallaba. Ahora 22.1.6 (CLI/build en 22.1.8) y TypeScript `~6.0`.
- `01-preparar.ps1` sobrescribía `backend/.env` y `probe/.env` en cada ejecución; ahora los conserva si existen.
- La sonda medía como latencia el tiempo de arranque de `ping.exe` (50-150 ms en Windows), generando falsos "warning". Ahora parsea el RTT real (`tiempo=`, `time=`, es/en) y detecta "Host de destino inaccesible", que Windows devuelve con código 0.
- `check_path` se ignoraba cuando el host ya incluía `http(s)://`.
- Latencia ≥ `critical_ms` se marcaba como `down` ("sin comunicación"). Ahora existe el estado `critical` (latencia crítica), distinto de `down` (sin respuesta).
- El JWT expirado dejaba la interfaz fallando en silencio; ahora vuelve al login.
- `PATCH /devices/:id` devolvía error 500 (bind parameter undefined) al editar un dispositivo sin enviar todos los campos; ahora conserva los valores no enviados.
- TypeScript 6: `baseUrl`, `moduleResolution: node`, `incremental` y falta de `rootDir` impedían compilar backend y sonda.
### Seguridad
- Autenticación por `Guard` de NestJS (JWT y token de sonda) aplicado a nivel de controlador: ningún endpoint puede quedar sin proteger.
- DTOs con `class-validator` en todos los endpoints de usuario: cuerpos inválidos devuelven 400 en vez de errores 500 de MySQL.
- Límite de intentos de login: 5 fallos por usuario+IP cada 15 minutos.
- Comparación del token de sonda en tiempo constante. `PROBE_TOKEN` admite varios tokens separados por coma (uno por sonda).
- Endpoint y formulario para cambiar la contraseña del usuario.
- Advertencia en arranque si `JWT_SECRET` es corto. `05-registrar-inicio-automatico.ps1` acepta `-Usuario` para no correr como SYSTEM.
- `ng serve` ya no escucha en `0.0.0.0` en modo pruebas.
### Instalación simplificada
- Un solo archivo de configuración `config.env` en la raíz (backend y sonda lo leen). Ya no hay `backend/.env` ni `probe/.env` obligatorios.
- `INSTALAR.bat`: asistente que verifica Node.js/MySQL, pregunta la contraseña de root, genera secretos aleatorios, instala, prueba MySQL y compila. Se puede repetir sin perder la configuración.
- El backend crea la base de datos automáticamente: no hay que ejecutar `init.sql` (queda como opcional para crear un usuario dedicado en producción).
- `INICIAR.bat` / `DETENER.bat` / `CONFIGURAR.bat` / `INICIO-AUTOMATICO.bat` de doble clic.
- Servidor y sonda se reinician solos si el proceso muere; logs con rotación a 20 MB.
- Mensajes de error claros si MySQL no responde o la contraseña es incorrecta.
### Operación
- Job de retención (`RETENTION_DAYS`, por defecto 30) que purga resultados, métricas Wi-Fi, heartbeats e incidentes/alertas resueltos en lotes.
- El dashboard muestra el último heartbeat de **cada** sonda y alarma si cualquiera deja de reportar (antes sólo se veía la más reciente).
- La sonda ejecuta chequeos con concurrencia limitada (`PROBE_CONCURRENCY`, por defecto 5) y evita pasadas solapadas.

## 0.2.0 - 2026-09-14
- Se agrega módulo Wi-Fi a Angular/NestJS/MySQL.
- Se agregan tablas de configuración, AP, radios, SSID y alertas Wi-Fi.
- Se agrega telemetría por SNMPv3 con perfiles almacenados localmente en la sonda.
- Las credenciales SNMP no se almacenan en MySQL.
- Se agrega perfil `SIMULADOR-WIFI` para laboratorio sin tráfico SNMP.
- Se agregan alertas por clientes, utilización, ruido, estado de radio/SSID y fallas del recolector.
- Se mantiene compatibilidad con los dispositivos registrados en V0.1.
- Se actualizan manuales de instalación y operación.
