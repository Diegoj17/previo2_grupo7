# ADR-001: Guardar y cerrar son síncronos; calificar, registrar la nota y notificar van por evento

**Estado:** aceptado (versión final; reemplaza el borrador de la semana 5)
**Fecha:** 2026-11-04
**Responsables:** Grupo 7

## Contexto

El flujo elegido es **entregar un examen**: guardar respuestas, calificar automáticamente, registrar la nota y notificar (ver [flujo-examenes_finales.md](../flujo-examenes_finales.md)).

Las fuerzas del caso que obligan a decidir:

- Hasta **5.000 estudiantes** presentan el mismo examen en una ventana **inamovible de 90 minutos**. A las 8:00:00 entran todos y a las 8:00:05 todos deben tener su primera pregunta.
- **Ninguna respuesta se pierde.** El sistema actual ya perdió respuestas dos veces. La respuesta marcada a las 8:47 debe sobrevivir a que el portátil muera a las 8:48.
- Cada clic genera un autoguardado. Con 5.000 estudiantes es una tormenta de escrituras pequeñas, y ninguna es descartable.
- El **sistema académico** y el **proveedor de notificaciones** son externos y pueden estar caídos durante la ventana. Además, las notas solo se envían después del proceso de reclamos.
- La calificación y la nota no le sirven al estudiante para continuar: los resultados tienen **publicación diferida** (RF-07).

La pregunta que se usó en cada paso: *¿el estudiante necesita que este paso haya terminado para saber que su acción funcionó?*

## Decisión

1. **Guardar una respuesta es síncrono.** La API responde "guardada" solo después de que la escritura queda en el almacenamiento durable. Una cola o la memoria del navegador no cuentan como confirmación.
2. **Cerrar el intento es síncrono.** El estudiante necesita saber que su examen quedó entregado.
3. Al cerrar, la API publica el evento **`IntentoCerrado`** en un broker. La **calificación automática**, el **registro de la nota** (que más tarde alimenta el sistema académico) y la **notificación** al estudiante y al docente se hacen después, consumiendo eventos (`IntentoCerrado` → `NotaLista` → `ResultadoPublicado`).

Estos pasos van por evento porque no son necesarios para seguir presentando el examen. Una falla en la calificación, en el sistema académico o en el notificador no debe bloquear el guardado ni el cierre de los 5.000 intentos.

### Estructura interna de la API: puertos y adaptadores

La API de exámenes se organiza como **arquitectura hexagonal**. El caso de uso (guardar respuesta, cerrar intento) solo conoce **puertos** escritos en el lenguaje del dominio: `AlmacenRespuestas` y `PublicadorEventos`. La base de datos, el broker y, en el ADR-002, el proveedor del modelo de lenguaje quedan en **adaptadores**. Así se puede:

- cambiar de motor de base de datos o de broker sin tocar el dominio (decisión pendiente del ADR-000);
- reemplazar un adaptador real por uno **simulado** que reproduce fallas (base lenta, entregas repetidas, modelo que no responde). Esto es lo que usa la prueba del escenario del [ADR-003](ADR-003-idempotencia-en-autoguardado.md).

## Alternativas descartadas

### Hacer todo síncrono

Habríamos tenido una sola secuencia, sin broker, y la certeza de que la calificación, el registro de la nota y la notificación terminaron antes de responder al estudiante.

A cambio, cada entrega esperaría a todos esos servicios. Con cuatro dependencias síncronas al 99 % de disponibilidad, la entrega quedaría disponible el 0,99⁴ ≈ 96 % del tiempo. Una caída del sistema académico o del notificador impediría cerrar el examen dentro de la ventana de 90 minutos, que es justamente lo que el caso no tolera. Además, los 5.000 cierres simultáneos de las 9:30 cargarían la calificación en el mismo minuto.

### Mandar también las respuestas por la cola

Absorbería el pico de autoguardados. Se descarta para las respuestas: si el broker se cae antes de que el consumidor escriba, no sabemos qué recibió realmente el sistema, y el estudiante ya habría visto "guardada". Esto ya está descartado en el ADR-000. La cola sirve para el trabajo posterior, no para confirmar respuestas.

## Consecuencias

**Mejora:**

- La entrega no depende de la calificación, del sistema académico ni del notificador.
- El pico de cierres se procesa al ritmo de los consumidores. Se pueden agregar consumidores sin tocar la API.

**Empeora (lo que cobra la decisión):**

- **Una pieza más que operar:** el broker, con retención, reintentos y bandeja de mensajes fallidos.
- **Consistencia eventual:** la nota y la notificación pueden quedar *pendientes* un tiempo después del cierre. La interfaz debe mostrar "entregado, en calificación" y no "calificado".
- **Idempotencia que hay que persistir:** el broker entrega **al menos una vez**. Por eso:
  - la calificación recuerda el `attemptId` ya calificado;
  - el registro de la nota usa una clave idempotente ante el sistema académico;
  - la notificación recuerda el tipo y la versión de publicación.
- **El mismo problema existe en el camino síncrono:** el navegador reintenta el autoguardado cuando la red falla, así que la API también recibe operaciones repetidas y desordenadas. Ese escenario se prueba y se resuelve en el [ADR-003](ADR-003-idempotencia-en-autoguardado.md).
- **Una capa más:** la estructura hexagonal agrega puertos y adaptadores. Con un solo proveedor para siempre sobraría; aquí se justifica porque la base, el broker y el modelo de lenguaje todavía no están decididos y porque permite probar las fallas.
