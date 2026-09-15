# Gestión de Infraestructura de Red 0.4.0

Plataforma multisitio para inventario, monitoreo y análisis de infraestructura tecnológica con **Angular + NestJS + MySQL** y **Agentes de Sitio Node.js**.

Está pensada para organizaciones con varios edificios y redes independientes. El servidor central no necesita entrar a las redes remotas: cada edificio ejecuta un agente local que monitorea sus equipos y envía resultados por HTTPS hacia la API central.

## Arquitectura V0.4.0

```text
                         SERVIDOR CENTRAL
                    Angular + NestJS + MySQL
                              │
                         HTTPS / API
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    Agente Sitio 1      Agente Sitio 2     Agente Sitio N
          │                   │                   │
       red local           red local            red local
          │                   │                   │
 Switch / AP / UPS     Switch / AP / UPS    Switch / AP / UPS
 Servidores / DNS     Impresoras / PCs      Firewalls / etc.
```

Cada Agente de Sitio tiene un token propio. Si se revoca una credencial, no se comprometen los demás edificios.

## Novedades principales

- Sedes con dirección estructurada: país, estado, municipio, localidad, colonia, CP, calle, números, referencias y coordenadas opcionales.
- Responsable del inmueble, contacto técnico, horario y enlaces de Internet principal/secundario.
- Inventario técnico y patrimonial ampliado: inventario, activo, fabricante, modelo, serie, part number, service tag, firmware/SO, garantía, proveedor, contrato y responsable.
- Ubicación física: edificio/sección, piso, área, cuarto/SITE, rack, unidad U y descripción precisa.
- Red: host/IP, hostname/FQDN, MAC principal, VLAN, máscara, gateway, DNS y método de direccionamiento.
- Varias interfaces por equipo mediante `device_interfaces`: MAC, IPv4/IPv6, VLAN, velocidad y conexión a switch, `ifIndex`, nombre físico de puerto (p. ej. `Gi1/0/24`), roseta y patch panel.
- **Edición completa del Inventario monitorizado**, además de eliminar.
- Ciclo de vida: activo, mantenimiento, reserva, sustituido o baja.
- Agentes asignados a sede y/o dispositivo.
- Buffer SQLite local en el agente: si se cae la comunicación con el servidor central, continúa midiendo y sincroniza posteriormente.
- Análisis por sitio: disponibilidad aproximada, incidentes, incidentes por cada 100 equipos, incidentes críticos, tiempo caído, MTTR, alertas de puerto/Wi-Fi e índice de riesgo normalizado.
- Filtros de inventario por sede, tipo, fabricante, estado, criticidad y búsqueda textual.
- Se conserva el monitoreo de puertos SNMP, Wi-Fi, PING/TCP/DNS/HTTPS y retención de 30 días.

## Instalación del servidor central

**Requisitos:** Windows 10/11 o Windows Server, Node.js 24 LTS y MySQL 8.

1. Ejecute `INSTALAR.bat`.
2. El instalador conserva `config.env`, perfiles SNMP y los datos de versiones anteriores.
3. Migra automáticamente la base de datos a V0.4.0.
4. Elija si el servidor central también ejecutará un agente local (`START_LOCAL_AGENT=true/false`).
5. Ejecute `INICIAR.bat`.
6. Abra `http://localhost:3000`.

## Incorporar un edificio remoto

1. En la web cree la **Sede** con su domicilio y datos operativos.
2. En **Agentes / Admin** cree un nuevo Agente de Sitio asociado a esa sede.
3. Copie el paquete V0.4.0 al equipo/VM que permanecerá encendido dentro del edificio.
4. Ejecute `INSTALAR-AGENTE.bat`.
5. Indique la URL de la API central y pegue el token que la web mostró una sola vez.
6. Ejecute `INICIAR-AGENTE.bat`.
7. Verifique que el agente aparezca **EN LÍNEA**.
8. Registre los equipos de esa sede. Si la sede tiene un solo agente activo, pueden heredarlo; si tiene varios, asigne el agente explícitamente por equipo.

Consulte `docs/INSTALACION_AGENTE_SITIO.md`.

## Buffer local

El agente usa `node:sqlite` y crea por defecto:

```text
probe/data/agent-buffer.sqlite
```

Si el enlace al servidor central se interrumpe, PING/SNMP/TCP/DNS/HTTPS continúan ejecutándose. Los resultados pendientes se almacenan localmente y se reenvían cuando regresa la comunicación. `AGENT_BUFFER_MAX` limita la cola (10,000 elementos por defecto).

## Inventario monitorizado

La pantalla **Inventario** permite:

- registrar;
- editar;
- documentar interfaces;
- filtrar;
- dar de baja mediante el estado de ciclo de vida;
- eliminar sólo cuando realmente se necesita borrar el registro y su historial.

Para bajas ordinarias se recomienda **editar el equipo y marcarlo como Baja**, no eliminarlo, para conservar trazabilidad histórica.

## Monitoreo de puertos

Se conserva la V0.3.0:

- IF-MIB / IF-X-MIB / EtherLike-MIB;
- LLDP opcional;
- estado, velocidad, dúplex;
- RX/TX y Mbps calculados en el agente;
- CRC/FCS, colisiones tardías y descartes;
- puertos críticos y uplinks;
- retención automática de 30 días;
- histórico únicamente para puertos en uso.

## Seguridad

- SNMP es de sólo lectura.
- Las credenciales SNMP permanecen localmente en `probe/config/snmp-profiles.json`.
- Cada Agente de Sitio tiene un token individual almacenado en el servidor sólo como huella SHA-256.
- El servidor verifica que el equipo reportado corresponda al agente autenticado.
- Las comunicaciones entre edificios y servidor deben publicarse mediante **HTTPS/TLS o VPN**, nunca HTTP abierto en Internet.
- JWT protege la interfaz administrativa.

## Archivos principales

| Archivo | Función |
|---|---|
| `INSTALAR.bat` | Instala/actualiza servidor central y migra MySQL |
| `INICIAR.bat` | Inicia servidor y agente local opcional |
| `INSTALAR-AGENTE.bat` | Instala únicamente un Agente de Sitio remoto |
| `INICIAR-AGENTE.bat` | Inicia únicamente el agente remoto |
| `config.env` | Configuración del servidor central |
| `agent.env` | Configuración independiente del agente remoto |
| `probe/config/snmp-profiles.json` | Perfiles/credenciales SNMP locales |
| `docs/ARQUITECTURA_MULTISITIO.md` | Diseño y relaciones |
| `docs/GUIA_INVENTARIO_MULTISITIO.md` | Criterios para capturar inventario |
| `docs/GUIA_INTERPRETAR_ERRORES_PUERTO.md` | Diagnóstico de puertos |
| `CHANGELOG.md` | Cambios por versión |
