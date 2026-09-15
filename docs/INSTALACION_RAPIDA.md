# Instalación rápida — V0.3.0 (Windows)

> **Aviso V0.4.0:** este documento conserva referencias históricas de versiones anteriores. Para despliegues multisitio use primero `ARQUITECTURA_MULTISITIO.md`, `INSTALACION_AGENTE_SITIO.md` y `GUIA_INVENTARIO_MULTISITIO.md`.


## Antes de empezar
1. **MySQL 8** instalado y en ejecución. Si puede conectarse con MySQL Workbench como `root`, está listo.
2. **Node.js 24 LTS**: https://nodejs.org → botón "LTS" → Siguiente, Siguiente, Instalar.
3. Descomprima la carpeta del sistema donde quiera (por ejemplo `C:\MonitorRed`). Evite rutas con acentos.

## Instalar
Doble clic en **`INSTALAR.bat`**. Responda:

| Pregunta | Qué poner |
|---|---|
| Servidor MySQL | Enter (127.0.0.1) si MySQL está en este equipo |
| Puerto MySQL | Enter (3306) |
| Usuario MySQL | Enter (root) |
| Contraseña MySQL | La misma que usa en Workbench (no se ve al escribir) |
| Base de datos | Enter (monitor_red). Se crea sola |
| Puerto web | Enter (3000) |
| Usuario / contraseña admin | Enter para ``admin` y la contraseña segura que indique durante la instalación |
| Nombre de la sonda | Enter |

El instalador descarga dependencias (5-10 minutos la primera vez), prueba MySQL, crea la base de datos y compila. Si algo falla, lo dice en rojo con la causa.

## Usar
- **`INICIAR.bat`** abre dos ventanas minimizadas (servidor y sonda) y el navegador en `http://localhost:3000`.
- **`DETENER.bat`** las cierra.
- Para que arranque con Windows: **`INICIO-AUTOMATICO.bat`** (pide permisos de administrador).

## Cambiar la configuración
Edite `config.env` con el Bloc de notas (o ejecute `CONFIGURAR.bat`) y reinicie con `DETENER.bat` + `INICIAR.bat`.

## Problemas frecuentes
| Mensaje | Solución |
|---|---|
| `Node.js no está instalado` | Instale Node.js LTS y vuelva a ejecutar INSTALAR.bat |
| `ER_ACCESS_DENIED_ERROR` | Contraseña de root incorrecta. `CONFIGURAR.bat` y escríbala de nuevo |
| `ECONNREFUSED` | MySQL está detenido. Abra *Servicios* de Windows e inicie `MySQL84` |
| `Ya hay algo escuchando en el puerto 3000` | Ejecute `DETENER.bat` o cambie `PORT` en `config.env` |
| La página no carga | Revise `logs\backend.log` |
| Todo aparece "unknown" | La sonda no reporta. Revise `logs\probe.log` |


## Actualización V0.3.0
Al volver a ejecutar `INSTALAR.bat`, se conserva `config.env`, se conservan los perfiles SNMP existentes, se agregan sólo perfiles de ejemplo faltantes y se ejecuta la migración automática de MySQL. No es necesario ejecutar SQL manualmente.
