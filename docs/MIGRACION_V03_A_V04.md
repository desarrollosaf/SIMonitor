# Migración de V0.3.x a V0.4.0

## Objetivo

Actualizar una instalación existente sin borrar `config.env`, perfiles SNMP, inventario, históricos, incidentes ni métricas de puertos/Wi-Fi.

## Servidor central

1. Haga una copia de seguridad de la carpeta actual y de la base MySQL.
2. Descomprima V0.4.0 sobre una copia de la instalación actual.
3. Conserve `config.env` y `probe/config/snmp-profiles.json` de la instalación existente.
4. Ejecute `INSTALAR.bat`.
5. El instalador agrega las claves nuevas sin sustituir las existentes y ejecuta la migración incremental MySQL.
6. Elija `START_LOCAL_AGENT=false` si el servidor será sólo central; use `true` si también monitoreará la LAN donde se encuentra.
7. Inicie con `INICIAR.bat`.

## Conversión a edificios con Agente de Sitio

1. Complete/edite cada registro en **Sedes** con su dirección estructurada.
2. Cree un **Agente de Sitio** por edificio en **Agentes / Admin**.
3. Guarde el token mostrado una sola vez.
4. En el equipo/VM del edificio ejecute `INSTALAR-AGENTE.bat` y pegue ese token.
5. Asigne los equipos a su sede. Si sólo existe un agente habilitado en esa sede, los equipos sin `probe_id` lo heredan automáticamente.
6. Si una sede usa dos o más agentes, asigne explícitamente cada equipo para evitar mediciones duplicadas.

## Inventario existente

Los equipos previos permanecen en la tabla `devices`. V0.4.0 agrega campos de fabricante, modelo, serie, datos patrimoniales, ubicación, garantía, responsable y ciclo de vida sin eliminar los datos anteriores.

Use **Inventario > Editar** para completar progresivamente los campos. Las interfaces MAC/IP/VLAN y su conexión física se documentan en **Inventario > Interfaces**.

## Recomendación

No use **Eliminar** para una baja ordinaria. Edite el equipo y cambie **Estado = Baja** para conservar su histórico y permitir análisis posteriores.
