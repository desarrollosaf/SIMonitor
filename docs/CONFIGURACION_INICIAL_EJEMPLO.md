# Configuración inicial sugerida

Para la primera prueba no cargue toda la red. Use 4 a 6 objetivos conocidos y autorizados.

| Orden | Nombre sugerido | Tipo | Prueba | Objetivo |
|---|---|---|---|---|
| 1 | GW-PRINCIPAL | gateway | ping | IP del gateway local |
| 2 | SW-CORE-01 | switch | ping | IP de administración del core |
| 3 | WAN-PRUEBA | internet | ping/https | Destino externo autorizado |
| 4 | DNS-RESOLUCION | dns | dns | Dominio institucional o de prueba |
| 5 | SERVICIO-WEB | server | https | Portal administrado por la institución |

Para validar alarmas sin tocar producción, puede usar temporalmente 192.0.2.1 como objetivo de prueba no enrutable. Elimine esa entrada después de validar el incidente.
