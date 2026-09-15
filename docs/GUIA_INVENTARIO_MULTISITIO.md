# Guía de captura de inventario multisitio

## Sede

Capture primero la sede y su domicilio estructurado. Evite colocar toda la dirección en un solo campo. Use municipio, localidad, colonia, CP, calle y números de forma separada.

## Identidad del equipo

Siempre que aplique registre:

- número de inventario y/o activo;
- nombre funcional;
- fabricante, modelo y serie;
- part number / service tag;
- tipo, categoría y subcategoría;
- criticidad.

## Red

El campo `Host / IP de monitoreo` identifica el destino principal para las pruebas. La MAC principal puede registrarse en el equipo, pero cuando existan varias interfaces deben documentarse en **Interfaces**.

Por interfaz pueden capturarse MAC, IPv4, IPv6, VLAN, velocidad, switch, ifIndex, roseta, patch panel y puerto de patch panel.

## Ubicación física

Use la combinación más específica posible:

```text
Sede > Edificio/sección > Piso > Área > Cuarto/SITE > Rack > Unidad U
```

Para AP, cámaras o impresoras utilice también `Ubicación física detallada`, por ejemplo `Techo frente a recepción`.

## Ciclo de vida

- `Activo`: instalado y en operación.
- `Mantenimiento`: temporalmente fuera de servicio.
- `Reserva`: disponible pero no instalado.
- `Sustituido`: reemplazado por otro activo.
- `Baja`: retirado definitivamente.

Para conservar trazabilidad, use `Baja` en lugar del botón **Eliminar**. Eliminar borra el registro y sus históricos relacionados.

## Conexión física de interfaces
Cada interfaz puede documentar el switch, `ifIndex` SNMP, nombre físico del puerto (por ejemplo `Gi1/0/24`), roseta/nodo, patch panel y puerto de patch panel. El nombre físico permite documentar conexiones aun cuando SNMP no esté disponible.
