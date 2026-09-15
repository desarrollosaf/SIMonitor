# Manual de puesta en marcha y operación

> **Aviso V0.4.0:** este documento conserva referencias históricas de versiones anteriores. Para despliegues multisitio use primero `ARQUITECTURA_MULTISITIO.md`, `INSTALACION_AGENTE_SITIO.md` y `GUIA_INVENTARIO_MULTISITIO.md`.

> **V0.3.0:** use `INSTALAR.bat` + `config.env`. El instalador conserva la configuración, migra MySQL automáticamente y agrega los perfiles de ejemplo faltantes sin reemplazar credenciales. Las referencias antiguas a `backend\.env` o `probe\.env` deben leerse como `config.env` en la raíz. Para puertos SNMP consulte `GUIA_INTERPRETAR_ERRORES_PUERTO.md`.

## Monitor de Red V0.2 - Red cableada + Wi-Fi

### 1. Propósito
Definir cómo operar el monitor, interpretar alarmas y utilizar la sonda de forma segura, incluyendo la nueva telemetría Wi-Fi.

### 2. Alcance
La V0.2 vigila equipos registrados mediante PING, TCP, DNS o HTTP/S y, en AP habilitados, consulta métricas Wi-Fi por perfiles SNMPv3 locales. No descubre redes, no captura tráfico, no modifica configuración y no almacena contraseñas Wi-Fi.

### 3. Flujo de supervisión
La sonda realiza dos ciclos independientes:
- conectividad: según `interval_sec` del dispositivo;
- Wi-Fi: según `poll_interval_sec` del AP.

Los resultados viajan al backend, se almacenan en MySQL y alimentan incidentes/alertas.

### 4. Puesta en marcha inicial
1. Confirmar MySQL.
2. Iniciar backend.
3. Confirmar `/api/health`.
4. Iniciar sonda.
5. Confirmar heartbeat.
6. Dar de alta gateway/switches.
7. Modelar dependencias padre-hijo.
8. Dar de alta AP.
9. Probar Wi-Fi con `SIMULADOR-WIFI`.
10. Habilitar SNMP real sólo después de validar el perfil del fabricante.

### 5. Topología recomendada
WAN -> firewall/gateway -> core -> switch de acceso -> AP.

Si el switch padre está caído y el AP también, atienda primero el switch. No interprete una cascada de equipos inaccesibles como fallas simultáneas independientes.

### 6. Estados de conectividad
- `unknown`: sin medición.
- `ok`: prueba satisfactoria.
- `warning`: respuesta degradada.
- `down`: timeout/no respuesta o umbral crítico.

### 7. Módulo Wi-Fi
La pestaña Wi-Fi presenta:
- AP monitorizados y su estado de red;
- estado del recolector SNMP;
- clientes reportados;
- uplink, PoE, CPU/RAM cuando existan OIDs;
- radios: banda, canal, ancho, clientes, utilización, ruido y potencia;
- SSID y clientes;
- alertas inalámbricas abiertas.

### 8. Diferencia entre AP caído y SNMP fallando
Un AP puede responder PING pero fallar la consulta SNMP. En ese caso:
- conectividad del AP: `ok`;
- recolector Wi-Fi: `warning`;
- diagnóstico: revisar perfil, ACL, usuario y OIDs.

No concluya que el AP está fuera de servicio si únicamente falla SNMP.

### 9. Alertas Wi-Fi automáticas
La V0.2 puede abrir alertas por:
- recolector SNMP sin datos;
- clientes por encima del umbral;
- radio `down/disabled`;
- utilización por encima de warning/crítico;
- ruido peor que el umbral configurado;
- SSID reportado como `down/disabled`.

Las alertas se resuelven cuando la métrica vuelve a condición normal.

### 10. Umbrales
Valores iniciales del proyecto:
- máximo de clientes: 40;
- utilización warning: 70%;
- utilización crítica: 85%;
- ruido warning: -75 dBm.

No son criterios universales de diseño RF. Ajuste tras obtener una línea base y conocer capacidad/modelo.

### 11. Interpretar utilización alta
Una utilización alta puede deberse a tráfico legítimo, interferencia, co-canal, ancho excesivo de canal, demasiados clientes o cobertura/diseño. El sistema sólo alerta y orienta; no cambia canal ni potencia automáticamente.

### 12. Interpretar ruido
Un valor de ruido menos negativo suele representar mayor ruido. Si el sistema alerta, confirme con herramientas del fabricante o análisis de espectro. No cambie parámetros de RF basándose en una sola lectura.

### 13. Clientes altos
Una alta concentración de clientes no necesariamente implica falla. Revise:
- distribución entre AP;
- capacidad del modelo;
- roaming;
- RSSI/SNR de clientes;
- densidad y cobertura;
- tipo de uso.

### 14. Canal y ancho
El dashboard permite visualizar los valores reportados por el AP. Use esta información para identificar anomalías o confirmar configuración, no como mecanismo de configuración remota.

### 15. PoE y uplink
Cuando el fabricante expone OIDs compatibles, puede visualizar potencia PoE y velocidad de uplink. Si un AP cae y el switch sigue en línea, revise primero puerto PoE, cableado y negociación.

### 16. Recolector SNMP
`collector_status=warning` significa que no se obtuvo telemetría avanzada. Causas comunes:
- perfil inexistente;
- credenciales incorrectas;
- ACL SNMP;
- UDP/161 bloqueado;
- OID no soportado;
- agente SNMP deshabilitado.

### 17. Credenciales
Las credenciales SNMP no deben registrarse en el dashboard ni MySQL. Se mantienen exclusivamente en la sonda dentro de `probe\config\snmp-profiles.json`.

### 18. Perfil de simulación
`SIMULADOR-WIFI` es exclusivamente de laboratorio. Genera métricas sintéticas para validar la interfaz y flujo de almacenamiento sin tocar la red. Sustitúyalo por un perfil real antes de considerar que un AP está siendo telemetrizado.

### 19. Frecuencia de consulta
Comience con 120 s. Para equipos/controladores con muchos AP, evite crear perfiles que realicen cientos de GET por ciclo. La V0.2 usa GET de OIDs definidos; no realiza WALK indiscriminado.

### 20. Alta de un AP
Documente:
- nombre lógico;
- IP/host;
- sede;
- switch padre;
- prueba de conectividad;
- perfil SNMP;
- intervalo Wi-Fi;
- límites de clientes/utilización/ruido.

### 21. Actualizar un AP de V0.1
Seleccione el AP en `Activar/ajustar Wi-Fi en un AP existente`. Guarde el perfil y umbrales. No es necesario volver a crear el objeto.

### 22. Procedimiento ante AP sin comunicación
1. Verificar heartbeat de la sonda.
2. Revisar si el switch padre está `down`.
3. Si el padre está bien, revisar PoE/puerto/cableado.
4. Confirmar estado en controlador si existe.
5. Corroborar si hubo reinicio/mantenimiento.
6. Esperar recuperación en el monitor.

### 23. Procedimiento ante alerta de utilización
1. Confirmar que el AP sigue en línea.
2. Revisar banda, canal, clientes y duración del evento.
3. Comparar AP vecinos.
4. Confirmar en controlador/fabricante.
5. Sólo después decidir si requiere ajuste de RF.

### 24. Procedimiento ante fallo SNMP
1. No reiniciar el AP.
2. Probar conectividad IP.
3. Confirmar perfil asociado.
4. Validar usuario SNMPv3 y ACL.
5. Confirmar OID con herramienta de laboratorio/documentación.
6. Revisar `logs\probe.log`.

### 25. Alarmas del navegador
Pueden notificar aumento de equipos críticos, pérdida de heartbeat o aumento de alertas Wi-Fi mientras el navegador esté abierto y tenga permiso. Para 24x7 se requiere posteriormente un canal externo institucional.

### 26. Logs
- `logs\backend.log`
- `logs\probe.log`

Ante problemas Wi-Fi, revise primero el log de sonda y busque `SNMPv3`, `Perfil` o el nombre del AP.

### 27. Tablas MySQL relevantes
Además de las tablas V0.1:
- `wifi_ap_config`: perfil y umbrales, sin secretos.
- `wifi_ap_metrics`: métricas generales del AP.
- `wifi_radio_metrics`: métricas por radio.
- `wifi_ssid_metrics`: estado/clientes por SSID.
- `wifi_alerts`: alertas abiertas/resueltas.

### 28. Retención
Desde V0.2.1 el backend purga automáticamente el histórico con más de `RETENTION_DAYS` días (30 por defecto). Ajuste el valor en `config.env` (por ejemplo 90/180/365 días) según auditoría, capacidad y necesidades operativas; los heartbeats de sonda se conservan `HEARTBEAT_RETENTION_HOURS` horas (48 por defecto).

### 29. Seguridad diaria
- comprobar que el perfil real no usa cuentas administrativas;
- mantener `snmp-profiles.json` restringido;
- no abrir UDP/161 fuera de la red necesaria;
- no compartir tokens/claves;
- mantener MySQL no expuesto;
- usar VPN/HTTPS entre sonda y servidor central.

### 30. Indicadores de salud diaria
- sonda en línea;
- gateway/WAN/DNS correctos;
- switches principales correctos;
- AP sin caídas inesperadas;
- recolectores SNMP en `ok`;
- sin radios/SSID inesperadamente deshabilitados;
- utilización/ruido dentro de línea base;
- alertas abiertas justificadas o atendidas.

### 31. Limitaciones de V0.2
- Los OIDs avanzados son específicos de fabricante/modelo.
- No existe descubrimiento automático de AP.
- No se capturan tramas 802.11 ni tráfico de usuarios.
- No hace análisis de espectro.
- No cambia canal/potencia.
- No administra controladores.
- No calcula todavía SLA mensual ni mapas RF.

### 32. Próxima ampliación recomendada
- perfiles específicos para los AP reales del edificio;
- integración con API de controlador cuando sea más completa/segura que SNMP;
- ventanas de mantenimiento;
- supresión visual de alarmas hijas;
- correo/Teams/webhook;
- gráficas históricas por radio/AP;
- SLA/reportes PDF;
- RBAC y auditoría de cambios.
