# Guía para interpretar errores de puerto — Monitor de Red V0.3.0

Esta guía convierte las alertas del sistema en una secuencia de revisión para el técnico. El monitor **no cambia configuraciones automáticamente**: detecta, prioriza y aporta evidencia para decidir.

## 1. Antes de tocar el puerto

1. Confirme el switch, `ifIndex`, nombre funcional y sede.
2. Revise si el puerto está marcado **crítico** o **uplink**.
3. Revise LLDP: puede indicar qué equipo/puerto está conectado.
4. Observe la gráfica de 24 h: determine si el evento es aislado, recurrente o sostenido.
5. Correlacione con otros puertos del mismo switch. Muchos errores simultáneos pueden tener una causa común.

## 2. CRC/FCS crecientes

**Qué significa:** la trama llegó dañada y el receptor la descartó. El contador debe analizarse por incremento, no por su valor total acumulado.

**Causas frecuentes:**
- cable UTP deteriorado, mal terminado o con radio de curvatura excesivo;
- conector RJ-45 o jack/patch panel defectuoso;
- SFP/transceptor/fibra con problema físico;
- interferencia o problema eléctrico en cobre;
- NIC o puerto físico con falla.

**Qué revisar:**
1. Identifique si los CRC crecen sólo en un puerto o en ambos extremos del enlace.
2. Reasiente o sustituya patch cord.
3. Pruebe el enlace permanente con certificador si el problema continúa.
4. En fibra, revise potencia/limpieza/conectores y el transceptor.
5. No borre la evidencia antes de confirmar si el contador sigue creciendo.

## 3. Colisiones tardías

En Ethernet conmutado full-duplex moderno deberían ser prácticamente inexistentes.

**Sospeche:**
- discrepancia de dúplex;
- enlace forzado de un lado y automático del otro;
- problemas físicos importantes;
- equipos antiguos o convertidores intermedios.

Revise auto-negociación en ambos extremos antes de forzar velocidad/dúplex.

## 4. Half-duplex

Si un puerto que debería ser Ethernet conmutado normal aparece en half-duplex, el sistema genera advertencia.

**Procedimiento:**
1. Confirme capacidades de ambos extremos.
2. Verifique que ambos estén en auto-negociación, salvo diseño documentado distinto.
3. Revise cableado si además cayó la velocidad.
4. Valide nuevamente después del cambio; evite forzar parámetros sólo para ocultar la alerta.

## 5. Antes estaba a 1 Gbps y ahora negocia a 100/10 Mbps

El monitor conserva `max_speed_seen_mbps` y también permite fijar `expected_speed_mbps` manualmente.

Una caída de velocidad suele apuntar a:
- uno o más pares de cobre dañados o mal terminados;
- patch cord de baja calidad;
- negociación fallida;
- NIC/puerto limitado o configurado manualmente;
- transceptor incorrecto.

Para un enlace que debe ser 1 Gbps, revise primero la capa física antes de forzar 1 Gbps.

## 6. Uplink por encima del 80 % durante 10 minutos

El umbral y el tiempo son editables por switch. La utilización se calcula con la mayor de las dos direcciones (RX/TX) respecto de la velocidad negociada.

**No significa automáticamente una falla.** Significa que el enlace merece revisión de capacidad.

Revise:
- si el patrón coincide con respaldos, video, replicaciones o ventanas conocidas;
- si existen descartes asociados;
- si la saturación se repite diariamente;
- si debe redistribuirse tráfico o ampliarse capacidad.

## 7. Descartes en muchos puertos a la vez

Una sola interfaz con descartes puede ser congestión local. Varias interfaces incrementando descartes en el mismo intervalo elevan la sospecha de un evento común.

Investigue:
- STP/RSTP/MSTP y cambios de topología;
- bucles de capa 2;
- tormenta broadcast/multicast/unknown-unicast;
- uplinks congestionados;
- colas/QoS y buffers;
- equipos conectados recientemente.

No desconecte uplinks a ciegas: primero identifique topología y redundancia.

## 8. Puerto crítico sin enlace

Un puerto marcado como **crítico** genera alarma roja cuando `operStatus` deja de estar `up`.

Úselo para:
- uplinks/troncales;
- enlaces a firewall/router;
- servidores esenciales;
- AP o equipos cuya caída deba atenderse inmediatamente.

Para puertos de usuario normales, dejar `crítico` desactivado evita ruido innecesario.

## 9. LLDP

Cuando el switch reporta LLDP, la vista muestra vecino y puerto remoto. Esto ayuda a distinguir, por ejemplo:

`Gi1/0/24 → SW-Rack-Piso2 / Gi1/0/48`

LLDP es información auxiliar. Algunos fabricantes lo deshabilitan o usan índices distintos; una ausencia de vecino **no significa** que el enlace esté vacío.

## 10. AP con utilización de canal alta

La alerta Wi-Fi no equivale a utilización Ethernet del puerto.

Revise:
- interferencia y co-canal;
- ancho de canal;
- número de clientes;
- distribución física de AP;
- potencia y roaming;
- datos del controlador/fabricante.

No cambie canal o potencia automáticamente basándose sólo en una muestra.

## 11. Cómo leer la gráfica de 24 horas

- **RX/TX Mbps:** tasa calculada por la sonda entre dos contadores consecutivos.
- **CRC/FCS por intervalo:** incremento desde la muestra anterior.
- **Descartes por intervalo:** incremento de descartes RX + TX.
- Tras reiniciar la sonda, la primera muestra puede no tener tasa porque todavía no existe un contador anterior con el cual calcularla.

## 12. Orden sugerido de atención

1. Alertas críticas de puertos marcados críticos.
2. Tormenta/descartes simultáneos en varios puertos.
3. CRC/FCS o colisiones tardías que continúan creciendo.
4. Uplink sostenido por encima del umbral.
5. Pérdida de velocidad / half-duplex.
6. Alertas aisladas que ya se resolvieron, para análisis de recurrencia.

Documente la acción tomada y compare la gráfica posterior: el objetivo es verificar que el contador deje de crecer o que el enlace vuelva a su negociación esperada.
