# Guía de registro del inventario

**Gestión de Infraestructura de Red V0.4.1**

Esta guía explica qué registrar, en qué orden y con qué criterio, para que el inventario sirva tanto de mapa de red como de control patrimonial.

---

## 1. Cómo está organizada la información

El sistema tiene tres niveles. Entenderlos ahorra la mayor parte de las dudas:

```
SEDE  (el edificio)
 └── EQUIPO  (el aparato: un switch, una copiadora, un teléfono)
      └── INTERFAZ  (cada boca de red del aparato: su MAC, su IP, su VLAN,
                     y a qué puerto de qué switch está conectada)
```

La distinción clave:

- **El equipo tiene un solo "host de monitoreo"**: la dirección que el agente usa para comprobar si responde.
- **Las interfaces son cuantas necesite**: un servidor con dos tarjetas más iLO son tres interfaces. Un multifuncional con cable y Wi-Fi son dos.

Si un equipo tiene una sola boca de red, puede vivir solo con los campos del equipo. Las interfaces se vuelven imprescindibles cuando quiere **mapear el cableado**: qué está conectado a qué puerto de qué switch, por qué roseta y por qué patch panel.

---

## 2. ¿Qué puedo registrar? Sí: teléfonos, copiadoras e impresoras

**Cualquier cosa con dirección IP**, y también cosas sin ella si sólo quiere inventariarlas.

El catálogo de tipos incluye:

| Grupo | Tipos disponibles |
|---|---|
| Red | Router/gateway, Enlace a Internet/WAN, Firewall, Switch, Access point Wi-Fi, Controladora Wi-Fi, Servidor DNS |
| Cómputo | Servidor, Equipo de cómputo, Almacenamiento/NAS, UPS/No-break |
| Periféricos y oficina | Impresora, **Copiadora/multifuncional**, Escáner de red, **Teléfono IP**, Conmutador/PBX, Proyector |
| Seguridad y control | Cámara IP, Grabador NVR/DVR, Control de acceso/biométrico, Reloj checador |
| Otros | Genérico |

Si algo no encaja, use **Genérico** y precise en **Categoría** y **Subcategoría**, que son texto libre. El tipo sirve para filtrar y para que el diagnóstico automático sea más certero; la categoría sirve para su clasificación propia.

### Casos que conviene resolver con criterio

**Teléfonos IP.** Registrarlos uno a uno sólo vale la pena si son de directivos o de áreas críticas, o si tiene que responder por su número de inventario. Cien teléfonos de escritorio monitoreados cada 60 segundos generan mucho ruido y poco valor: si el switch de ese piso cae, se caen los cien a la vez. Alternativa recomendada: monitoree el **conmutador/PBX** y los switches, y registre los teléfonos con **Monitoreo habilitado desactivado** — quedan inventariados, con su MAC, su puerto y su VLAN de voz documentados, pero no se sondean.

**Copiadoras y multifuncionales.** Estas sí conviene monitorearlas: suelen tener IP fija, son caras, tienen contrato de mantenimiento y cuando fallan alguien se queja rápido. Use `tcp` al puerto 9100 en lugar de `ping`: comprueba que el servicio de impresión responde, no sólo que el aparato está encendido. Documente el **Proveedor**, el **Contrato/referencia** y el **Fin de garantía**, que es donde estos equipos dan más problemas administrativos.

**Impresoras.** Igual que las copiadoras. Si son de escritorio compartidas por USB, regístrelas sin monitoreo, sólo como inventario.

**Equipos de escritorio.** Por lo general no se monitorean: se apagan cada tarde y generarían una falsa alarma diaria. Regístrelos con el monitoreo desactivado, o no los registre aquí.

> **Regla práctica:** monitoree lo que debe estar encendido siempre y cuya caída le obliga a actuar. Inventaríe todo lo demás sin monitoreo.

---

## 3. Registrar un equipo, paso a paso

`Configuración → 3 · Inventario → Nuevo equipo`

### Sección 1 · Identificación y clasificación

| Campo | Obligatorio | Qué poner |
|---|---|---|
| **Sede** | Sí | El edificio donde está físicamente |
| **Agente de Sitio** | No | Déjelo en *Heredar agente de la sede*. Sólo asígnelo a mano si la sede tiene dos o más agentes |
| **Equipo padre** | No | De qué depende para tener red. Explicado abajo |
| **Nombre** | Sí | Como lo llaman en la operación: `SW-Piso2-Norte`, `Copiadora-Recepción` |
| **Tipo** | — | Del catálogo |
| Núm. inventario / Núm. activo | No | Sus identificadores patrimoniales. **Deben ser únicos** |
| Fabricante / Modelo / Serie | No | Lo que aparece en la etiqueta del equipo |
| Estado (ciclo de vida) | — | Activo, Mantenimiento, Reserva, Sustituido, Baja |
| Criticidad | — | Cuánto duele que se caiga |
| Monitoreo habilitado | — | Desmárquelo para inventariar sin sondear |

**El equipo padre es el campo más rentable de todo el formulario.** Si marca que los equipos de un piso dependen de su switch, cuando ese switch caiga el sistema le dirá *"el equipo padre también está sin comunicación, revise primero ahí"* en lugar de abrirle veinte incidentes sueltos que parecen veinte problemas distintos. Un orden típico:

```
Enlace a Internet
 └── Firewall
      └── Switch principal
           ├── Switch de piso 1 ──── APs, copiadora, teléfonos del piso
           └── Switch de piso 2 ──── cámaras, impresora
```

El padre debe estar **en la misma sede**; el sistema lo verifica y no le dejará guardar una dependencia entre edificios.

> **Sobre el número de inventario y el de serie:** desde la versión 0.4.1 son únicos en la base. Si al arrancar el servidor vio un aviso de "no se pudo crear el índice único", es que ya tenía duplicados; depúrelos para que la protección quede activa.

### Sección 2 · Red y prueba de monitoreo

| Campo | Qué poner |
|---|---|
| **Host / IP de monitoreo** | La dirección que el agente va a sondear. Obligatorio |
| Hostname / FQDN | El nombre de red, si lo tiene |
| MAC principal | Se normaliza sola a `AA:BB:CC:DD:EE:FF`. Acepta cualquier formato de entrada |
| VLAN de gestión | El número de VLAN donde vive su IP de administración |
| Máscara / Gateway / DNS | Documentación del direccionamiento |
| Direccionamiento | Estático, DHCP u otro |
| **Prueba** | Cómo se comprueba que está vivo |
| Intervalo | Cada cuántos segundos. 60 está bien para casi todo; 300 para equipos poco críticos |
| Warning / Crítico ms | Umbrales de latencia. El crítico debe ser mayor que el de advertencia |

Elección del tipo de prueba:

| Tipo | Cuándo usarlo | Campos que usa |
|---|---|---|
| **PING** | La mayoría de los equipos | Host |
| **TCP** | Cuando importa que el *servicio* responda, no sólo el aparato. Impresión 9100, RDP 3389, SSH 22, web 80 | Host + Puerto |
| **DNS** | Verificar que un servidor DNS resuelve de verdad | Host = el servidor DNS; Ruta = el nombre a resolver |
| **HTTPS** | Portales y consolas web con certificado válido | Host + Ruta |

> **Cuidado con HTTPS:** el sistema **valida el certificado**. Un switch, un AP, una UPS o una copiadora con certificado autofirmado —es decir, casi todos— aparecerá permanentemente como caído. Para esos equipos use PING o TCP.

El resto del formulario (hardware, ubicación física, responsable, garantía) es documentación. **Puede dejarlo en blanco ahora y completarlo después con Editar, sin perder el histórico de monitoreo.** Es preferible tener cien equipos con lo mínimo que diez perfectos y noventa sin registrar.

---

## 4. Interfaces: aquí se construye el mapa de la red

`Inventario → botón Interfaces` en la fila del equipo.

Una interfaz documenta **una boca de red**. Registre una por cada conexión física del equipo.

| Campo | Para qué sirve |
|---|---|
| Nombre | `Ethernet`, `WAN`, `iLO`, `Wi-Fi` |
| MAC / IPv4 / IPv6 | Identificación en la red |
| **VLAN** | El número de VLAN de esa boca |
| Tipo | `ethernet`, `wifi`, `management` |
| **Switch** | A qué switch registrado está conectada |
| **ifIndex SNMP** | El índice del puerto según SNMP |
| **Puerto físico** | Cómo lo llama el humano: `Gi1/0/24` |
| Roseta / nodo | La placa de pared |
| Patch panel / Puerto patch | El panel y el puerto en el site |
| Interfaz principal | Márquela en la boca por la que se monitorea el equipo |

Rellenar Switch + ifIndex es lo que conecta el inventario con el monitoreo real de puertos: a partir de ahí, cuando ese puerto acumule errores CRC, el sistema puede decirle **qué equipo está del otro lado**.

Orden recomendado para levantar el mapa de una sede:

1. Registre primero los **switches**.
2. Actíveles el monitoreo SNMP de puertos, si aplica (`Configuración → 4 · Monitoreo SNMP`).
3. Registre los demás equipos.
4. Documente sus interfaces apuntando al switch y al puerto.

Con los switches ya reportando, la columna de puertos le muestra los nombres reales y el vecino LLDP, así que documentar la interfaz se vuelve cuestión de copiar lo que ya ve en pantalla.

---

## 5. VLANs y subredes

`Configuración → VLANs`

Declare qué significa cada VLAN en cada edificio, en lugar de guardar números sueltos. El caso típico: **la telefonía trabaja en su propia VLAN**, y conviene que el sistema lo sepa.

### Declarar el catálogo de una sede

| Campo | Ejemplo | Para qué |
|---|---|---|
| Sede | Santander | El catálogo es por edificio |
| Número de VLAN | `20` | 1 a 4094 |
| Nombre | `Voz` | Como la llaman en la operación |
| Propósito | Voz (telefonía IP) | Clasificación: datos, voz, gestión, cámaras, impresión, servidores, control de acceso, invitados |
| Subred (CIDR) | `10.20.20.0/24` | Habilita la validación de direcciones |
| Gateway | `10.20.20.1` | Documentación |
| Rango DHCP | `10.20.20.100-10.20.20.200` | Documentación |

Un esquema típico para una sede con telefonía IP:

```
VLAN 10  Gestión      10.20.10.0/24   switches, APs, UPS
VLAN 20  Voz          10.20.20.0/24   teléfonos IP y conmutador
VLAN 30  Datos        10.20.30.0/24   equipos de usuario
VLAN 40  Cámaras      10.20.40.0/24   cámaras y NVR
VLAN 50  Impresión    10.20.50.0/24   impresoras y copiadoras
VLAN 99  Invitados    10.20.99.0/24   Wi-Fi de visitantes
```

### Qué cambia al declararlas

**El catálogo es opcional y funciona por sede.** Mientras una sede no declare ninguna VLAN, todo sigue igual: la VLAN se escribe como número libre. En cuanto declara la primera, para esa sede:

- Los campos de VLAN (la de gestión del equipo y la de cada interfaz) **pasan a ser desplegables** con nombre y número, en vez de una caja de texto.
- El sistema **rechaza cualquier VLAN que no esté en el catálogo**, con un mensaje que lista las disponibles. Se acabó el teclear 200 donde iba 20.
- Si la VLAN tiene subred declarada, **verifica que la IP de la interfaz caiga dentro**. Poner `10.20.30.45` en la VLAN de voz `10.20.20.0/24` devuelve un error explícito.

### Protecciones

- No se puede eliminar una VLAN que tenga interfaces usándola.
- No se puede renumerar una VLAN en uso: primero hay que reasignar las interfaces.
- El número de VLAN es único dentro de cada sede.
- El catálogo muestra cuántas interfaces usan cada VLAN y cuántos equipos la tienen como VLAN de gestión.

### Caso completo: telefonía

1. Declare en la sede: VLAN `20`, nombre `Voz`, propósito *Voz (telefonía IP)*, subred `10.20.20.0/24`, gateway `10.20.20.1`.
2. Registre el **conmutador/PBX** como equipo, con monitoreo activo y VLAN de gestión la que corresponda.
3. Registre los **teléfonos** con el monitoreo desactivado, y a cada uno una interfaz con su MAC, su IP dentro de `10.20.20.0/24` y VLAN 20 seleccionada del desplegable.
4. En los switches, marque los puertos de voz con un nombre funcional reconocible desde `Puertos`.

A partir de ahí, la consulta "qué hay en la VLAN de voz de esta sede" tiene respuesta, las IP están verificadas contra la subred correcta y el cableado de cada teléfono queda documentado.

### Lo que todavía no hace

- La VLAN configurada en el puerto del switch **no se lee por SNMP**: el catálogo es declarativo, no descubierto. Si alguien cambia la VLAN de un puerto en el switch, el sistema no se entera.
- **No hay asignación automática de IP libre** dentro de una subred.
- El filtro del inventario todavía no incluye VLAN; para listados por VLAN, la pestaña VLANs muestra el conteo de uso, y para el detalle sirve esta consulta:

```sql
SELECT s.name sede, d.name equipo, d.device_type, i.name interfaz,
       i.vlan_id, i.ipv4_address, sw.name switch, i.switch_port_name puerto
  FROM device_interfaces i
  JOIN devices d  ON d.id = i.device_id
  JOIN sites   s  ON s.id = d.site_id
  LEFT JOIN devices sw ON sw.id = i.switch_device_id
 WHERE i.vlan_id = 20
 ORDER BY s.name, d.name;
```

---

## 6. Corregir, dar de baja y eliminar

| Situación | Qué hacer |
|---|---|
| Un dato mal capturado | `Editar`. No se pierde nada del histórico |
| El equipo se retiró o se sustituyó | `Editar` → Estado = **Baja** o **Sustituido**. Deja de sondearse, sale de los conteos y **conserva su histórico** |
| El equipo se registró por error | `Eliminar`. Borra el equipo **y todas sus mediciones e incidentes**. No tiene vuelta atrás |
| Se movió a otra sede | `Editar` → cambie la sede. Sus interfaces conectadas a switches de la sede anterior se desvinculan solas, para no dejar un cableado imposible |

**Prefiera siempre Estado = Baja sobre Eliminar.** El histórico de un equipo que dio problemas es justamente lo que necesita para justificar su reemplazo.

Todos los cambios quedan registrados con usuario, fecha y valores anteriores y posteriores en la bitácora `inventory_audit`. (Se guarda en la base; la pantalla para consultarla todavía no está construida.)

---

## 7. Limitaciones que conviene conocer antes de empezar en grande

- **No hay importación desde CSV o Excel.** Todo se captura equipo por equipo. Para un parque grande esto es el cuello de botella real; está en el plan de mejoras.
- **No hay paginación** en la tabla de inventario: se cargan todos los equipos de golpe. A partir de unos 500 registros la pantalla se vuelve pesada.
- **No hay descubrimiento automático.** El agente ya está dentro de la red y podría barrer la subred para proponerle equipos, pero esa función no existe todavía.
- **No hay validación de formato de IP** ni aviso de IP duplicada dentro de una sede.
- **La MAC de interfaz no es única**, así que puede registrar la misma MAC dos veces sin aviso.

---

## 8. Ejemplo completo: dar de alta un piso

Supongamos el segundo piso de la sede Santander: un switch, un AP, una copiadora, una impresora y ocho teléfonos.

**1. El switch, primero.**
Tipo `Switch` · Nombre `SW-Santander-P2` · Host `10.20.2.10` · Prueba `PING` · Intervalo 60 · Padre: el switch principal de la sede · Criticidad Alta. Después, en `4 · Monitoreo SNMP`, habilite la lectura de puertos con su perfil SNMPv3.

**2. El access point.**
Tipo `Access point Wi-Fi` · Host `10.20.2.20` · Padre `SW-Santander-P2`. Interfaz: MAC, VLAN 10, switch `SW-Santander-P2`, puerto `Gi1/0/24`.

**3. La copiadora.**
Tipo `Copiadora / multifuncional` · Host `10.20.50.15` · Prueba `TCP` puerto `9100` · Intervalo 120 · Padre `SW-Santander-P2`. Complete Proveedor, Contrato y Fin de garantía. Interfaz con VLAN 50 y su puerto de switch.

**4. La impresora.** Igual que la copiadora, con su propia IP.

**5. Los ocho teléfonos.**
Tipo `Teléfono IP` · **Monitoreo habilitado desmarcado** · Padre `SW-Santander-P2`. Para cada uno, una interfaz con su MAC, su IP, VLAN 20 y el puerto de switch y la roseta. Quedan inventariados y mapeados sin generar ochos alarmas cada vez que se reinicia el switch.

Resultado: si el switch del piso cae, recibe **una** incidencia crítica del switch y el diagnóstico de los equipos que dependen de él le señala la causa, en lugar de doce alarmas simultáneas sin jerarquía.
