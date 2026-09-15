# Guía de instalación — Agente de Sitio

**Gestión de Infraestructura de Red V0.4.1** · Windows

Esta guía se entrega a la persona que instala el agente en una sede. **No necesita conocimientos de bases de datos ni instalar MySQL.**

---

## 1. Qué va a instalar y para qué

El Agente de Sitio es un programa pequeño que se queda corriendo en un equipo de esta sede. Hace dos cosas:

1. Mide desde **dentro** de la red local: hace ping a los equipos, consulta switches y APs por SNMP.
2. Envía los resultados al servidor central.

Se instala así, y no desde la oficina central, porque la medición tiene que salir desde esta red: sólo desde aquí se ve realmente cómo responden los equipos de la sede.

**Si se cae el enlace con el servidor central, el agente sigue midiendo.** Guarda todo en un archivo local y lo reenvía en cuanto vuelve la conexión, así que no se pierde información.

---

## 2. Lo que necesita tener a mano antes de empezar

| Necesita | Quién se lo da | Ejemplo |
|---|---|---|
| **Dirección de la API central** | El administrador | `http://10.20.0.5:3000/api` |
| **Token del agente** | El administrador | Un texto largo de letras y números |
| **Nombre para este agente** | Acordado | `Agente-Santander` |

> **El token es una contraseña.** Recíbalo por un medio seguro, no lo comparta y no lo reenvíe por correo a más personas. Si sospecha que se filtró, avise al administrador: puede generar uno nuevo en segundos.

### Requisitos del equipo

- **Windows 10/11 o Windows Server.**
- **Node.js 24 LTS o superior.** Si no lo tiene, descárguelo de https://nodejs.org e instálelo con las opciones por defecto. El instalador del agente se detiene si falta.
- Que esté **encendido de forma permanente**. Mientras esté apagado, esta sede no se monitorea. Un equipo de escritorio que alguien apaga al irse no sirve.
- Conexión a la red local de la sede y salida hacia el servidor central.
- Aproximadamente 500 MB libres.

> No use un equipo que se suspenda o hiberne. Desactive la suspensión en `Configuración → Sistema → Inicio/apagado`.

---

## 3. Instalación

1. Copie la carpeta del sistema a este equipo, en una ruta **sin espacios ni acentos**. Recomendado: `C:\MonitorRed`.
2. Doble clic en **`INSTALAR-AGENTE.bat`**.
3. Responda las tres preguntas:

| Pregunta | Qué escribir |
|---|---|
| URL de la API central (incluya /api) | Lo que le dio el administrador, **terminando en `/api`** |
| Nombre de este agente | El nombre acordado |
| Pegue el token generado | Pegue el token con clic derecho → Pegar |

> Al pegar el token **no verá nada en pantalla**: es normal, se escribe oculto como una contraseña. Pegue y pulse Enter.

4. Espere. Instala dependencias y compila; la primera vez tarda varios minutos.
5. Al terminar debe ver `Agente instalado.` en verde.

Esto crea el archivo `agent.env` con su configuración. Si vuelve a ejecutar el instalador, ese archivo se conserva y sólo se actualizan los valores que cambie.

---

## 4. Poner el agente en marcha

Doble clic en **`INICIAR-AGENTE.bat`**.

Se abre una ventana con mensajes como estos:

```
Agente de Sitio Agente-Santander v0.4.1. Buffer: ...
Configuración: 12 dispositivos asignados a Agente-Santander
Switch-Piso1: ok 2.4ms
Impresora-Recepcion: ok 1.8ms
```

**No cierre esa ventana.** Mientras esté abierta, el agente está trabajando.

### Confirme con el administrador

Pídale que revise el panel: su agente debe aparecer **EN LÍNEA** en la pestaña `Agentes / Admin`. Esa es la señal de que la instalación quedó bien. Puede tardar hasta un minuto en aparecer.

Si dice `Configuración: 0 dispositivos asignados`, el agente está bien conectado pero todavía no le han asignado equipos desde el servidor central. Es normal en una instalación nueva.

---

## 5. Dejarlo corriendo siempre

Para que el agente arranque solo cuando se encienda el equipo, y no dependa de que alguien abra la ventana:

Doble clic en **`INICIO-AUTOMATICO.bat`** y acepte la ventana de permisos de administrador.

Para producción, el administrador puede preferir una cuenta de servicio dedicada. En ese caso, abra PowerShell **como administrador**:

```powershell
cd C:\MonitorRed\scripts
.\05-registrar-inicio-automatico.ps1 -Usuario "DOMINIO\svc_monitor"
```

**Reinicie el equipo y confirme que el agente vuelve a aparecer EN LÍNEA sin que nadie haga nada.** Sin esta comprobación no dé la instalación por terminada.

---

## 6. Permisos de red que necesita el agente

Confirme con quien administre la red de la sede:

**Salida hacia el servidor central**

| Destino | Puerto |
|---|---|
| Servidor central | TCP 3000 (o el que le hayan indicado) |

**Hacia los equipos de la sede local**

| Para | Protocolo |
|---|---|
| Ping | ICMP |
| Consultar switches y APs | UDP 161 (SNMP) |
| Pruebas de servicio | El puerto TCP que se configure |

Si el firewall de Windows bloquea el ping saliente, todos los equipos aparecerán caídos aunque estén bien.

---

## 7. Perfiles SNMP (sólo si esta sede tiene switches o APs monitorizados)

Si el administrador le indicó que aquí se van a monitorear puertos de switch o métricas Wi-Fi, hay que poner las credenciales SNMP en este equipo.

Edite `probe\config\snmp-profiles.json` con el Bloc de notas y sustituya:

```json
"user": "monitor_readonly",
"authKey": "CAMBIAR_AUTH_KEY",
"privKey": "CAMBIAR_PRIV_KEY"
```

por las credenciales reales del usuario SNMP **de sólo lectura** de sus equipos. Guarde y reinicie el agente.

Puntos importantes:

- El nombre del perfil debe coincidir **exactamente** con el que el administrador configuró en el servidor. Si no coincide, verá una alerta que dice "perfil SNMP no encontrado".
- Los perfiles `SIMULADOR-WIFI` y `SIMULADOR-SWITCH` son de prueba: generan datos falsos y **no consultan nada en la red**. Sirven para verificar que la pantalla funciona, no para monitorear de verdad.
- **Sólo se admite SNMPv3.** Si sus equipos únicamente tienen v2c habilitado, avise al administrador antes de seguir.
- Este archivo contiene contraseñas. No lo copie a carpetas compartidas ni lo envíe por correo.

---

## 8. Revisar que todo esté bien

| Qué revisar | Dónde |
|---|---|
| Mensajes en vivo | La ventana de `INICIAR-AGENTE.bat` |
| Historial | `logs\probe.log` |
| Estado visto desde el centro | Pestaña `Agentes / Admin` del sistema web |

En la tabla de agentes del sistema, la columna **buffer** es la más útil: si el número crece y no baja, el agente está midiendo pero no logra entregar los resultados al servidor central. Casi siempre es red o token.

---

## 9. Problemas frecuentes

**`Node.js no está instalado` o `Se recomienda Node.js 24 LTS o superior`**
Instale o actualice Node.js desde https://nodejs.org y vuelva a ejecutar `INSTALAR-AGENTE.bat`.

**`Falta AGENT_TOKEN en agent.env/config.env`**
El token no se guardó. Vuelva a ejecutar `INSTALAR-AGENTE.bat` y péguelo de nuevo.

**`Servidor central no disponible; resultado en buffer (N pendientes)`**
El agente está midiendo bien, pero no alcanza al servidor. Revise, en este orden:
1. ¿Hay internet o enlace hacia la oficina central desde este equipo?
2. Abra un navegador aquí y entre a la dirección de `API_URL` quitándole `/api`. ¿Carga la página del sistema?
3. ¿El firewall permite la salida al puerto del servidor?

No pierde datos: en cuanto se restablezca la conexión, todo lo pendiente se envía solo.

**`401` o `Token de Agente de Sitio inválido o revocado`**
El token no es correcto, o el administrador generó uno nuevo. Pida el token actual y ejecute `INSTALAR-AGENTE.bat` para actualizarlo.

**`Este equipo no pertenece al Agente de Sitio autenticado`**
El equipo que se intenta medir está asignado a otro agente, o su sede tiene varios agentes y falta asignarlo explícitamente. Lo resuelve el administrador desde el sistema web.

**El agente aparece EN LÍNEA pero no mide nada**
Mire la ventana: si dice `Configuración: 0 dispositivos asignados`, falta que el administrador registre los equipos de esta sede y los asigne a este agente.

**Todos los equipos aparecen caídos de golpe, pero funcionan**
Compruebe que desde este equipo se puede hacer ping normal a alguno de ellos (`ping 10.20.1.5` en una ventana de comandos). Si el ping manual funciona y el agente los ve caídos, revise el firewall de Windows de este equipo.

**El reloj del equipo está desfasado**
Sincronícelo con NTP. Con un desfase grande, las mediciones llegan con fecha inválida y en el panel los equipos aparecen como "sin datos".

---

## 10. Lista de verificación final

- [ ] Node.js 24 o superior instalado
- [ ] `INSTALAR-AGENTE.bat` terminó con `Agente instalado.` en verde
- [ ] `INICIAR-AGENTE.bat` muestra mediciones en pantalla
- [ ] El administrador confirma que el agente aparece **EN LÍNEA**
- [ ] Credenciales SNMP configuradas (si esta sede monitorea switches o APs)
- [ ] Inicio automático registrado
- [ ] **El equipo se reinició y el agente volvió solo**
- [ ] La suspensión del equipo está desactivada
- [ ] El token se guardó en lugar seguro y no quedó en notas ni correos

---

## 11. A quién avisar

Anote aquí los datos de contacto antes de terminar la instalación:

```
Administrador del sistema: ______________________________

Teléfono / correo:         ______________________________

Nombre de esta sede:       ______________________________

Nombre de este agente:     ______________________________

Equipo donde está instalado (nombre y ubicación):

___________________________________________________________
```
