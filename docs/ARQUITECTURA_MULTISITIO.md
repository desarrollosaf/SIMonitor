# Arquitectura multisitio V0.4.0

## Objetivo

Centralizar el inventario y el análisis de múltiples edificios sin requerir acceso entrante desde el servidor central hacia cada LAN.

## Flujo

1. El Agente de Sitio descarga exclusivamente su configuración autorizada.
2. Realiza pruebas dentro de la LAN: PING, TCP, DNS, HTTPS, SNMP Wi-Fi y SNMP de puertos.
3. Calcula localmente tasas y deltas de contadores.
4. Envía resultados a la API central por HTTPS.
5. Si la API no está disponible, conserva los resultados en SQLite.
6. Al recuperar conectividad, vacía la cola en orden cronológico.

## Asignación

- Un equipo puede tener `probe_id` explícito.
- Si no lo tiene y la sede posee exactamente un agente habilitado, hereda ese agente.
- Si la sede tiene cero o más de un agente habilitado, el equipo sin asignación queda pendiente para evitar monitoreo duplicado.
- El servidor valida la pertenencia antes de aceptar cualquier resultado.

## Modelo principal

```text
sites
  ├── probes (Agentes de Sitio)
  └── devices
       ├── device_interfaces
       ├── check_results
       ├── incidents
       ├── wifi_* 
       └── switch_port_*
```

## Sitios

Los datos de dirección se guardan en campos independientes (país, estado, municipio, localidad, colonia, código postal, calle y números) para permitir filtros geográficos y operativos. La sede también conserva responsables, horario, ISP y ancho de banda contratado.

## Equipos

`devices` conserva la identidad del activo, clasificación, hardware/software, ubicación física, datos patrimoniales y configuración básica de monitoreo.

`device_interfaces` resuelve equipos multi-NIC y permite documentar la conexión física a un switch, `ifIndex`, nombre de puerto como `Gi1/0/24`, roseta y patch panel. Las relaciones a switches de otra sede se rechazan.

## Análisis

`GET /api/analytics/sites?days=30` calcula por sede:

- cantidad de equipos;
- incidentes y críticos;
- incidentes abiertos;
- minutos acumulados de indisponibilidad;
- MTTR;
- alertas de puertos;
- alertas Wi-Fi;
- disponibilidad aproximada;
- incidentes por cada 100 equipos;
- índice de riesgo normalizado por tamaño de sede para ranking.

La disponibilidad es un indicador de operación y no sustituye un SLA contractual si éste requiere reglas específicas de horario, exclusiones o ventanas de mantenimiento.
