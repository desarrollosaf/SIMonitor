# Monitoreo de puertos SNMP — V0.3.0

## OID estándar usados por defecto

La sonda utiliza IF-MIB, IF-X-MIB, EtherLike-MIB y LLDP-MIB. Los OID pueden sustituirse en `switchOids` dentro del perfil del fabricante.

| Dato | OID base |
|---|---|
| ifName | 1.3.6.1.2.1.31.1.1.1.1 |
| ifDescr | 1.3.6.1.2.1.2.2.1.2 |
| ifAlias | 1.3.6.1.2.1.31.1.1.1.18 |
| ifType | 1.3.6.1.2.1.2.2.1.3 |
| ifAdminStatus | 1.3.6.1.2.1.2.2.1.7 |
| ifOperStatus | 1.3.6.1.2.1.2.2.1.8 |
| ifHighSpeed | 1.3.6.1.2.1.31.1.1.1.15 |
| ifHCInOctets | 1.3.6.1.2.1.31.1.1.1.6 |
| ifHCOutOctets | 1.3.6.1.2.1.31.1.1.1.10 |
| ifIn/OutErrors | 1.3.6.1.2.1.2.2.1.14 / .20 |
| ifIn/OutDiscards | 1.3.6.1.2.1.2.2.1.13 / .19 |
| dot3StatsFCSErrors | 1.3.6.1.2.1.10.7.2.1.3 |
| dot3StatsLateCollisions | 1.3.6.1.2.1.10.7.2.1.8 |
| dot3StatsDuplexStatus | 1.3.6.1.2.1.10.7.2.1.19 |

Se intenta LLDP para vecino/puerto remoto. Si no existe, se continúa sin LLDP. IF-X-MIB y EtherLike-MIB se consideran capacidades opcionales: si el switch no expone una de ellas, la sonda conserva las métricas que sí estén disponibles.

Para enlaces de 1 Gbps o más se recomienda que el equipo exponga `ifHCInOctets/ifHCOutOctets` (64 bits). La sonda puede recurrir a contadores de 32 bits cuando no existen los HC, pero en enlaces rápidos éstos pueden desbordarse varias veces dentro de un intervalo largo y perder precisión; en ese caso reduzca el intervalo o defina OID de fabricante adecuados.

## Perfil mínimo

```json
"SWITCH-LECTURA": {
  "mode": "snmpv3",
  "user": "monitor_readonly",
  "securityLevel": "authPriv",
  "authProtocol": "sha",
  "authKey": "CAMBIAR",
  "privProtocol": "aes",
  "privKey": "CAMBIAR"
}
```

Las credenciales se guardan únicamente en la sonda.

## Comportamiento de almacenamiento

- `switch_port_state`: una fila por switch/ifIndex; se actualiza y no crece con el tiempo.
- `switch_port_metrics`: histórico sólo cuando `operStatus=up`.
- `port_alerts`: una alerta abierta por condición; se actualiza hasta que se resuelve.
- Retención: `RETENTION_DAYS`, 30 días por defecto.
