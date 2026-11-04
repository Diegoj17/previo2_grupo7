# ADR-003: El autoguardado se escribe de forma idempotente por `operationId` para que un reintento tardío no reemplace una respuesta confirmada

**Estado:** aceptado
**Fecha:** 2026-11-04
**Responsables:** Grupo 7
**Atributo:** disponibilidad y persistencia (consistencia de la respuesta guardada)
**Táctica:** prevenir · idempotencia (catálogo de Bass, Clements y Kazman)

## Contexto

### El escenario elegido y por qué manda

| Escenario de la visión | Prioridad (negocio / dificultad) | Por qué no se eligió, o por qué sí |
| --- | --- | --- |
| **§7.2 Ninguna respuesta se pierde** (disponibilidad, persistencia) | **Alta / alta** | **Elegido.** Es el incidente que originó el proyecto: el sistema actual "ya perdió respuestas de estudiantes dos veces, con el escándalo correspondiente". Una respuesta perdida **no se puede reconstruir**: la ventana de 90 minutos es inamovible y no hay segunda aplicación. La falla se reproduce a voluntad con un adaptador de red. |
| §7.1 Primera pregunta a 5.000 estudiantes en ≤ 5 s (rendimiento) | Alta / alta | Igual de importante. Un inicio lento sí tiene una salida institucional (prórroga autorizada por coordinación, RF-03); una respuesta perdida no. Además, su medida depende de infraestructura (CDN, balanceador, escalado) que una prueba en un solo proceso de Node no representa con honestidad. |
| §7.3 Eventos sin latencia perceptible ni sanción automática (integridad) | Media / media | La medida decía "sin latencia perceptible", sin número. Su falla (el consumidor de auditoría caído) ya está aislada por el broker del ADR-001. |

### La medida, corregida

La visión decía: *"el 100 % de las respuestas confirmadas… debe conservarse. Reintentar una operación no debe duplicar su efecto"*. Tiene número, pero no dice cuándo se mide ni con qué estímulo. Corregida:

| Parte | Escenario |
| --- | --- |
| Fuente | 5.000 estudiantes en casa con conexión doméstica inestable; el navegador reintenta el autoguardado que no ve confirmado |
| Estímulo | El **20 %** de los autoguardados llega **dos veces**: la copia es un reintento cuyo original sí llegó, y aparece **5 a 60 ms tarde**, cuando el estudiante ya pudo cambiar su respuesta |
| Artefacto | API de exámenes (caso de uso `guardarRespuesta`) y almacenamiento durable |
| Entorno | Examen en curso; todos los autoguardados de una aplicación (5.000 × 10 preguntas, el 30 % con cambio de opinión ≈ 65.000 operaciones) |
| Respuesta | Al reanudar, cada pregunta tiene la **última** respuesta que el estudiante vio confirmada; el registro de respuestas no tiene operaciones repetidas |
| **Medida** | **0 respuestas confirmadas perdidas** (reemplazadas por una más vieja) y **0 registros duplicados**, contados sobre **todos los autoguardados de la ventana de 90 minutos** de una aplicación |
| **Origen del número** | Caso 7, "Ninguna respuesta se pierde": *la respuesta marcada a las 8:47 debe sobrevivir a que el portátil muera a las 8:48*. RF-04, RF-05 y visión §7.2 (100 %). Es cero porque cada respuesta es parte de la nota y "ninguna es descartable". |

El 20 % y los 5 a 60 ms son la **intensidad del estímulo**, no la medida. Se pueden cambiar (`--prob=0.5`) y la medida sigue siendo 0.

### Qué pasaba sin la táctica

El caso de uso confirmaba después de escribir, como pide el ADR-001, pero el almacenamiento aplicaba **"la última escritura gana"**. La secuencia que pierde una respuesta:

1. El estudiante marca **B** en P3 (`operationId …-P3-1`). La red la entrega y además programa una copia tardía.
2. El estudiante ve "guardada" y cambia a **C** (`…-P3-2`). Se guarda C.
3. Llega la copia tardía de **B** y **la última escritura gana**: P3 vuelve a B.
4. El estudiante vio "C guardada", pero al reanudar o al calificar aparece **B**. La respuesta confirmada se perdió y nadie recibió un error.

Resultado medido (5 corridas, commit `a581201`, [mediciones/antes.txt](../mediciones/antes.txt)): **1.674 a 1.780 respuestas perdidas y unas 13.100 duplicadas por corrida.** La prueba falla.

## Decisión

La escritura del autoguardado es **idempotente por `operationId`**. El almacenamiento guarda la clave de cada operación procesada **en la misma transacción** que la respuesta. Si la clave ya existe, no escribe nada y responde `duplicada`. El caso de uso trata `duplicada` como confirmación, porque el servidor ya tiene esa operación.

- Puerto: `AlmacenRespuestas.guardarIdempotente(op)` en [`src/puertos/almacenRespuestas.js`](../../src/puertos/almacenRespuestas.js).
- Adaptador: [`src/adaptadores/almacenSimulado.js`](../../src/adaptadores/almacenSimulado.js). En una base real sería un índice único en `operation_id` + `INSERT … ON CONFLICT (operation_id) DO NOTHING`, dentro de la transacción de la respuesta.
- Mecanismo de falla: [`src/adaptadores/redInestable.js`](../../src/adaptadores/redInestable.js) (`--falla=red-inestable` / `--falla=ninguna`).

Es una sola táctica. Corresponde al modo de falla: el problema es una **misma operación entregada más de una vez** ("al menos una vez", semana 5), y la idempotencia es lo que convierte "al menos una vez" en "un solo efecto".

## Alternativas descartadas

| Alternativa | Razón |
| --- | --- |
| **Escritura condicional por `sequence`** (no aceptar una respuesta con secuencia menor que la vigente) | Se implementó primero, junto con la idempotencia. La prueba mostró que en este modo de falla **ninguna** copia se rechazó por secuencia: las 13.108 se rechazaron por `operationId`. Una táctica que la prueba no ejercita es código sin evidencia, así que se retiró. Queda como la táctica para otro modo de falla (ver "Qué queda pendiente"). |
| **Pasar el autoguardado por una cola** | No toca la causa: el broker también entrega al menos una vez, así que el duplicado seguiría llegando. Además, el ADR-000 y el ADR-001 ya descartaron confirmar respuestas desde una cola. |
| **Deduplicar en el navegador** | El problema es que el navegador *no sabe* si el original llegó; por eso reintenta. Solo el servidor ve las dos copias. |
| **"Gana la de marca de tiempo más reciente" con el reloj del cliente** | El reloj del estudiante no es confiable (la visión exige reloj del servidor para el tiempo oficial) y dos operaciones del mismo segundo empatan. |
| **Bloqueo por (intento, pregunta) mientras se guarda** | Serializa las escrituras, pero la copia tardía llega *después* de liberado el bloqueo y vuelve a escribir. Además agrega espera en la tormenta de 5.000 autoguardados. |

## Ventaja

- La medida se cumple: **0 respuestas perdidas y 0 duplicados en 5 de 5 corridas** ([mediciones/despues.txt](../mediciones/despues.txt)). Las ≈ 13.100 copias tardías por corrida se responden `duplicada` sin escribir.
- El navegador puede reintentar sin miedo, que es lo que el flujo de desconexión (ADR-000, visión §8.3) necesita.

## Costo (medido)

| Qué | Antes (último gana) | Después (idempotente) | Fuente |
| --- | --- | --- | --- |
| Respuestas perdidas por corrida | 1.674 a 1.780 | **0** | 5 corridas con falla |
| Registros duplicados por corrida | ≈ 13.100 | **0** | 5 corridas con falla |
| p50 de guardar, con falla (mediana de 5) | 131,9 ms | 125,8 ms | idem |
| p95 de guardar, con falla (mediana de 5) | 223,2 ms | 233,2 ms | idem |
| p50 / p95 sin falla (mediana de 5) | 98,6 / 220,2 ms | 102,1 / 217,4 ms | 5 corridas sin falla |
| Líneas de código | — | **+18 / −5** (src +14 −5, prueba +4) | `git diff a581201 ba87e38 --stat` |
| Claves de idempotencia guardadas | 0 | **≈ 65.000 por aplicación** (una por autoguardado) | contador del adaptador |

**Cómo leer la latencia.** La diferencia de +10 ms en el p95 con falla y −3 ms sin falla está **dentro de la variación entre corridas** (p95 entre 204 y 264 ms en ambas versiones). En la simulación, la táctica no tiene un costo de latencia medible. Los ≈ 100 a 230 ms son la saturación del proceso que simula 5.000 navegadores al mismo tiempo, no el tiempo de una base real. En una base real, la comprobación es el mismo `INSERT` con índice único: no agrega un viaje de red, pero sí un índice que mantener en cada una de las ≈ 65.000 escrituras.

**Fallas nuevas que aparecen con la táctica:**

1. **Un estado nuevo, `duplicada`**, que el navegador debe tratar como confirmación. Un cliente que lo trate como error volvería a reintentar en bucle.
2. **La clave tiene que ser durable y vivir en la misma transacción que la respuesta.** Si se guarda en otro lugar (una caché en memoria, otra base), un reinicio entre las dos escrituras deja la respuesta sin clave, o la clave sin respuesta, y vuelven los duplicados o se pierde la operación.
3. **Retención de claves.** ≈ 65.000 por aplicación que deben durar al menos lo que pueden tardar los reintentos: la ventana de 90 minutos más la cola local del navegador. Se purgan al cerrar el periodo de reclamos.
4. **Misma clave, contenido distinto.** Si un cliente con error reutiliza un `operationId` para otra respuesta, la segunda se descarta en silencio como `duplicada`. Mitigación pendiente: guardar un hash del contenido y responder 409 si no coincide.

## Cómo se verifica que funciona

- `npm run escenario`: con la falla (red inestable). Condición de éxito = la medida: `respuestas perdidas = 0` y `registros duplicados = 0`. **Pasa.** En el commit `a581201` (antes de la táctica), el mismo comando **falla**.
- `npm run escenario:sin-falla`: sin duplicados; pasa antes y después y sirve de control.
- `npm test`: corre el escenario y la evaluación del asistente (ADR-002). Se corre en cada cambio, así que funciona como fitness function: si alguien vuelve a "último gana", el build se pone rojo.
