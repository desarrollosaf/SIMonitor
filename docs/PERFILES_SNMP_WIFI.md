# Guía de perfiles SNMPv3 para Wi-Fi - V0.2

## 1. Objetivo
La sonda mantiene localmente las credenciales y los OIDs necesarios para consultar AP. MySQL sólo conoce el nombre lógico del perfil. Esto evita guardar claves SNMP en la base central.

## 2. Archivo
Durante `01-preparar.ps1` se crea, si no existe:

`probe\config\snmp-profiles.json`

A partir de:

`probe\config\snmp-profiles.example.json`

El archivo real está excluido de Git mediante `.gitignore`.

## 3. Perfil de simulación
`SIMULADOR-WIFI` genera métricas sintéticas y no realiza ninguna consulta de red. Úselo para validar el módulo Wi-Fi antes de habilitar SNMP.

## 4. Perfil SNMPv3
Ejemplo:

```json
{
  "profiles": {
    "AP-MODELO-X": {
      "mode": "snmpv3",
      "port": 161,
      "timeoutMs": 1800,
      "retries": 1,
      "user": "monitor_readonly",
      "securityLevel": "authPriv",
      "authProtocol": "sha",
      "authKey": "REEMPLAZAR",
      "privProtocol": "aes",
      "privKey": "REEMPLAZAR",
      "apMetrics": {
        "uptime_ticks": "1.3.6.1.2.1.1.3.0",
        "client_count": "OID_DEL_FABRICANTE"
      },
      "radios": [
        {
          "name": "radio-5g",
          "band": "5 GHz",
          "oids": {
            "status": "OID_DEL_FABRICANTE",
            "channel": "OID_DEL_FABRICANTE",
            "channel_width_mhz": "OID_DEL_FABRICANTE",
            "client_count": "OID_DEL_FABRICANTE",
            "utilization_pct": "OID_DEL_FABRICANTE",
            "noise_dbm": "OID_DEL_FABRICANTE",
            "tx_power_dbm": "OID_DEL_FABRICANTE"
          }
        }
      ],
      "ssids": [
        {
          "ssid": "INSTITUCIONAL",
          "band": "5 GHz",
          "oids": {
            "status": "OID_DEL_FABRICANTE",
            "client_count": "OID_DEL_FABRICANTE"
          }
        }
      ]
    }
  }
}
```

## 5. Escalado
Un OID puede ser una cadena o un objeto con escala/offset. Ejemplo si el fabricante reporta potencia en décimas de watt:

```json
"poe_watts": { "oid": "1.2.3.4.5", "scale": 0.1 }
```

## 6. Métricas reconocidas
AP: `client_count`, `uptime_ticks` o `uptime_sec`, `poe_watts`, `uplink_mbps`, `cpu_pct`, `memory_pct`.

Radio: `status`, `channel`, `channel_width_mhz`, `client_count`, `utilization_pct`, `noise_dbm`, `tx_power_dbm`.

SSID: `status`, `client_count`.

## 7. Reglas de seguridad
- Crear un usuario SNMPv3 exclusivo de monitoreo y sólo lectura.
- Preferir `authPriv` con autenticación y privacidad.
- No usar cuentas administrativas del controlador/AP.
- Limitar por ACL el origen SNMP a la IP de la sonda si el equipo lo permite.
- No exponer UDP/161 a Internet.
- Proteger `snmp-profiles.json` con permisos NTFS restringidos a la cuenta de servicio.
- No subir el archivo real a repositorios ni compartirlo por correo/chat.

## 8. OIDs por fabricante
Los OIDs de radio, clientes y SSID no son uniformes entre fabricantes. Deben obtenerse de la MIB/documentación del modelo o del controlador. No utilice OIDs de otra familia de equipo sin validarlos en laboratorio.
