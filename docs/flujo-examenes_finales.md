# Flujo principal de presentación de un examen

## Alcance del flujo

Este flujo describe la ruta crítica que sigue un estudiante desde que intenta iniciar un examen hasta que sus respuestas quedan conservadas y los eventos de la sesión son registrados. Se elige este flujo porque concentra las principales tensiones del caso: 5.000 estudiantes iniciando simultáneamente, una ventana estricta de 90 minutos, conexiones domésticas inestables y necesidad de conservar cada respuesta.

La configuración del banco de preguntas, la preparación de la matrícula y la publicación final de notas son procesos relacionados, pero no forman parte de este flujo principal. Se ejecutan antes o después de la aplicación y se describen en la visión y en el ADR-000.

## Paso 1. Escribir el flujo

1. El estudiante se autentica y solicita iniciar el examen; el sistema valida su inscripción y la ventana de aplicación.
2. El sistema crea o recupera el intento individual y obtiene la asignación determinista de preguntas y opciones aleatorizadas.
3. El sistema entrega la primera pregunta, las opciones y el tiempo restante calculado con el reloj del servidor.
4. El estudiante marca una respuesta y el sistema la persiste de forma durable antes de confirmar que fue guardada.
5. Durante la sesión, el sistema registra eventos como desconexiones, reconexiones, cambios de pestaña y patrones de tiempo para auditoría, sin bloquear la presentación.

El flujo se repite para cada respuesta y cada pregunta. Si el estudiante se desconecta, vuelve al paso 1 o al paso 2 según conserve su sesión, y el sistema recupera el mismo intento dentro del tiempo restante. La entrega o el vencimiento del examen inicia posteriormente el cierre y la calificación, que no forman parte de estos cinco pasos de la ruta interactiva.

## Paso 2. Decidir paso por paso

| Paso | Quién | Síncrono o por evento | ¿Qué pasa si falla? | Compensación | ¿Qué pasa si se repite? / Idempotencia |
| --- | --- | --- | --- | --- | --- |
| 1. Autenticar, validar inscripción y abrir el intento | Estudiante y servicio de identidad / aplicación de examen | **Síncrono.** El estudiante necesita saber inmediatamente si puede iniciar el examen y cuál es su estado de acceso. | Si falla la autenticación, la autorización o la lectura de la matrícula congelada, no se inicia el intento. Se informa el error y se permite reintentar. Una caída del sistema académico no debe bloquear el flujo si la matrícula ya fue sincronizada. | No hay cambios de negocio que compensar si la validación falla antes de abrir el intento. Si se creó un intento de forma parcial, debe quedar en estado `pendiente` y poder recuperarse o expirar sin crear otro. | La solicitud debe incluir `examId`, `studentId` y `attemptId` cuando ya exista. La creación usa una clave de idempotencia basada en `examId + studentId`; repetir la solicitud devuelve el mismo intento en lugar de crear dos. |
| 2. Crear o recuperar el examen individual aleatorizado | Servicio de intentos y servicio de asignación / aleatorización | **Síncrono para la primera carga.** El estudiante necesita recibir el examen para continuar. La preparación de asignaciones para los 5.000 estudiantes puede ejecutarse antes de la ventana como proceso asíncrono. | Si la asignación no está disponible, se reintenta o se recupera desde el almacenamiento durable. No se entrega un examen incompleto ni se genera una asignación diferente. El intento permanece `pendiente` o `activo` según su estado confirmado. | No se revierte una asignación ya confirmada: se conserva y se vuelve a consultar. Si una preparación anticipada falla, se reprograma esa asignación antes de abrir o se genera bajo demanda de forma controlada. | La clave es `examId + studentId + attemptId`. La semilla queda asociada al intento y no cambia. Repetir la solicitud devuelve exactamente las mismas preguntas, el mismo orden y las mismas opciones. |
| 3. Entregar la pregunta, opciones y tiempo restante | Servicio de aplicación de examen | **Síncrono.** El estudiante necesita la respuesta para poder leer y contestar. | Si la lectura falla, el cliente reintenta la solicitud y conserva en pantalla el último estado confirmado. Si no hay conexión, informa que el contenido no pudo actualizarse; no modifica el tiempo oficial ni marca una respuesta como guardada. | No hay compensación de negocio: es una operación de lectura. Si se entregó una pregunta repetida, la asignación determinista permite devolver el mismo contenido sin crear otro intento. | La consulta es idempotente mediante `attemptId + questionId + version`. Repetirla no modifica respuestas, tiempo ni asignación. El tiempo se calcula en el servidor para evitar que el reloj del cliente lo altere. |
| 4. Persistir y confirmar una respuesta | Estudiante y servicio de respuestas / almacenamiento durable | **Síncrono.** El estudiante necesita saber si la respuesta fue aceptada. La confirmación solo se muestra después de la escritura durable. | Si la red o el servicio falla antes de confirmar, el navegador conserva temporalmente la operación pendiente y la reintenta con backoff. La interfaz muestra que la respuesta está pendiente y no afirma que fue guardada. Al reconectar, el servidor devuelve la última respuesta confirmada y procesa las pendientes. | No se compensa borrando una respuesta confirmada. Si llega una respuesta posterior, se conserva la de mayor número de secuencia válida. Si el intento ya cerró, se rechaza la modificación y se informa el cierre. | Cada operación lleva `operationId`, `attemptId`, `questionId` y `sequence`. `operationId` evita duplicados por reintentos; `sequence` evita que una respuesta vieja sobrescriba una más reciente. Repetir la misma operación produce un único efecto lógico. |
| 5. Registrar eventos de sesión para auditoría | Navegador, servicio de sesión y servicio de eventos / auditoría | **Por evento.** Cambios de pestaña, desconexiones, reconexiones y patrones de tiempo no deben bloquear la entrega ni el autoguardado. | El evento se coloca en una cola con reintentos. Si el consumidor de auditoría está caído, el mensaje permanece pendiente y se procesa posteriormente. La caída de telemetría no interrumpe el examen ni invalida respuestas confirmadas. | No se revierte una acción del estudiante ni se sanciona automáticamente por la pérdida o demora de un evento. Se registra la indisponibilidad de auditoría y se conserva el contexto disponible para revisión. | Cada evento lleva `eventId`, `attemptId`, tipo, instante del servidor y secuencia de sesión. El consumidor descarta duplicados por `eventId`. Los eventos son indicadores con contexto y nunca generan automáticamente una sanción. |

## Detalle de decisiones

### Por qué los pasos 1 a 4 son síncronos

El estudiante necesita una respuesta inmediata para tomar la siguiente acción:

- En el paso 1 necesita saber si tiene permiso para presentar.
- En el paso 2 necesita conocer su versión individual del examen.
- En el paso 3 necesita recibir la pregunta y el tiempo restante.
- En el paso 4 necesita saber si el sistema confirmó su respuesta.

La asincronía en cualquiera de esos puntos no debe ocultar un fallo. En particular, no se debe mostrar una respuesta como guardada solo porque quedó en memoria del navegador, en una caché o en una cola sin confirmación del almacenamiento durable.

### Por qué el paso 5 es asíncrono

Los eventos de sesión aportan evidencia para auditoría, pero no son necesarios para que el estudiante continúe con la siguiente pregunta. Procesarlos en segundo plano evita que una demora o una caída del componente de auditoría agregue latencia perceptible a la ruta crítica.

La asincronía no significa perder eventos silenciosamente. La cola debe tener retención, reintentos, monitoreo de antigüedad y una bandeja de mensajes fallidos. Los eventos deben conservar contexto suficiente para una revisión humana y estar protegidos por controles de acceso.

## Reglas de idempotencia

La idempotencia es necesaria porque las conexiones inestables pueden provocar reintentos, duplicación de solicitudes o reenvíos después de un tiempo de espera. Las claves utilizadas son:

- **Inicio del intento:** `examId + studentId`.
- **Asignación del examen:** `examId + studentId + attemptId`.
- **Respuesta:** `operationId`, junto con `attemptId`, `questionId` y `sequence`.
- **Evento:** `eventId` y secuencia de sesión.

Una solicitud repetida no debe crear un segundo intento, entregar una asignación distinta, guardar dos veces una respuesta, sobrescribir una respuesta más reciente con una antigua ni duplicar un evento de auditoría.

## Flujo ante una desconexión

1. El navegador detecta la pérdida de conectividad y conserva localmente las respuestas todavía no confirmadas.
2. El intento no se elimina ni se reinicia; el reloj oficial continúa según la política de la aplicación.
3. El navegador intenta enviar las operaciones pendientes cuando recupera la conexión.
4. El servidor identifica duplicados por `operationId` y conserva la respuesta válida más reciente por `sequence`.
5. El servicio devuelve el intento, las respuestas confirmadas y el tiempo restante calculado en el servidor.
6. El estudiante continúa con la misma asignación de preguntas y opciones.

Una respuesta confirmada antes de la desconexión debe conservarse siempre. Una respuesta que no alcanzó confirmación puede recuperarse si quedó en la cola local, pero no se presenta como garantizada hasta que el servidor la confirme.

## Operaciones posteriores al flujo

Cuando el estudiante entrega el intento o vence la ventana, el servicio de intentos cierra las modificaciones de forma idempotente. Luego se ejecutan como procesos posteriores:

1. Calificación automática de preguntas cerradas.
2. Revisión docente de preguntas abiertas y reclamos.
3. Generación de reportes de presentados, ausentes, incidencias y notas.
4. Publicación diferida de resultados.
5. Envío idempotente de notas finales al sistema académico.

Estas operaciones pueden ser asíncronas porque no deben bloquear el guardado durante la aplicación y ocurren después del cierre del intento.

## Correspondencia con la arquitectura

| Elemento del flujo | Servicio del ADR-000 | Actor o sistema relacionado |
| --- | --- | --- |
| Autenticación y validación | Servicio de identidad y acceso; servicio de cursos y matrícula | Estudiante; sistema académico |
| Intento individual | Servicio de aplicación de examen / intentos; servicio de asignación y aleatorización | Estudiante |
| Entrega de preguntas | CDN y distribución de contenido; servicio de aplicación de examen / intentos | Estudiante |
| Guardado durable | Servicio de respuestas y persistencia durable | Estudiante |
| Eventos de sesión | Servicio de sesión y presencia; servicio de eventos y auditoría | Estudiante; coordinación académica |
| Procesamiento posterior | Servicio de calificación; reportes; integración académica | Docente; coordinación; sistema académico |

La ruta crítica mantiene separadas las respuestas de la telemetría: una falla en eventos, reportes o integración no debe provocar la pérdida de una respuesta confirmada ni impedir que el estudiante continúe presentando el examen.
