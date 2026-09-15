# Instalación de un Agente de Sitio

## Antes de instalar

En el servidor central:

1. Registre la sede.
2. Abra **Agentes / Admin**.
3. Cree el agente para ese edificio.
4. Copie el token mostrado. Sólo se presenta una vez.

## En el edificio remoto

1. Copie/descomprima la V0.4.0 en el equipo o VM que permanecerá encendido.
2. Ejecute `INSTALAR-AGENTE.bat`.
3. Capture la URL pública/privada de la API central, incluyendo `/api`.
4. Capture el nombre del agente.
5. Pegue el token generado en el servidor.
6. Configure los perfiles SNMPv3 locales cuando sean necesarios.
7. Ejecute `INICIAR-AGENTE.bat`.

El instalador genera `agent.env`; no requiere credenciales de MySQL porque el agente nunca se conecta directamente a la base central.

## Puertos de red

El agente inicia conexiones salientes hacia la API central. No es necesario abrir accesos entrantes desde el servidor hacia la LAN del edificio.

Para SNMP, el equipo del agente sí debe alcanzar por UDP/161 a los switches/AP que vaya a consultar.

## Pérdida de Internet/WAN

El archivo `probe/data/agent-buffer.sqlite` conserva temporalmente resultados no enviados. La cola se vacía automáticamente cuando vuelve la API. El valor `AGENT_BUFFER_MAX` evita crecimiento ilimitado.

## Verificación

En la web central revise:

- estado EN LÍNEA;
- hostname e IP local del agente;
- versión;
- profundidad del buffer;
- sede asignada;
- cantidad de equipos que atiende.
