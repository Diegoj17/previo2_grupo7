# ADR-001: La calificación, el registro de nota y la notificación van por evento

**Estado:** borrador

## Decisión

El sistema responde al estudiante cuando su respuesta queda persistida de forma durable. El cierre del intento también se confirma de forma síncrona para asegurar que el examen terminó correctamente.

Después de cerrar el intento, el sistema publica el evento `IntentoCerrado` en un broker. La calificación automática, el registro de la nota y la notificación al estudiante y al docente se hacen después, consumiendo ese evento.

Estos pasos van por evento porque no son necesarios para que el estudiante continúe presentando el examen. Además, una falla en la calificación, en el sistema académico o en el servicio de notificaciones no debe bloquear el guardado de respuestas ni impedir el cierre del examen de los hasta 5.000 estudiantes.

## Alternativa descartada

Hacer todo síncrono. Habríamos tenido una sola secuencia y la certeza de que la calificación, el registro de la nota y la notificación terminaron antes de responder al estudiante.

A cambio, cada entrega tendría que esperar a todos esos servicios. Una caída del sistema académico o del notificador podría impedir cerrar el examen, y el pico de 5.000 estudiantes generaría una carga adicional durante la ventana crítica de 90 minutos. También se acoplaría la ruta crítica de guardar respuestas con procesos posteriores que no son necesarios para continuar el examen.

## Consecuencias

Una pieza más que operar: el broker o cola de eventos. La nota y la notificación pueden quedar pendientes durante un tiempo después de cerrar el examen, por lo que existe consistencia eventual.

Los consumidores deben ser idempotentes porque el broker puede entregar `IntentoCerrado` más de una vez. La calificación debe recordar el `attemptId`, el registro de la nota debe usar una clave idempotente para el sistema académico y la notificación debe recordar el tipo y la versión de publicación para no duplicarse.
