# ADR-000: Arquitectura distribuida para exámenes conjuntos en línea

- **Estado:** Propuesto
- **Fecha:** 2026-09-22
- **Responsables:** Grupo 7

## Contexto

La universidad necesita aplicar el mismo examen en línea a entre 3.000 y 5.000 estudiantes de forma simultánea, durante una ventana estricta de 90 minutos. La apertura ocurre a una hora fija y hasta 5.000 estudiantes pueden solicitar su primera pregunta en el mismo instante. El sistema actual, basado en un módulo genérico del campus virtual, presenta degradación de rendimiento y ya provocó pérdida de respuestas.

La arquitectura debe resolver tres problemas relacionados, pero con características diferentes:

1. **Pico de acceso:** entregar el examen y sus recursos sin que una carga puntual derribe el sistema.
2. **Conservación de respuestas:** guardar cada respuesta y permitir reanudar el intento exacto después de una desconexión, un cierre del navegador o un reinicio del equipo.
3. **Integridad con proporcionalidad:** dificultar la copia mediante aleatorización y reunir evidencia de eventos relevantes, sin exigir software de vigilancia ni convertir una señal técnica en una sanción automática.

La ventana de aplicación es inamovible. Una interrupción de diez minutos puede invalidar el examen completo. Fuera de las aplicaciones, la demanda es baja, por lo que la capacidad debe poder escalar temporalmente para el evento sin mantenerse sobredimensionada durante todo el semestre.

## Decisión

Se adopta una **arquitectura distribuida, modular y orientada a servicios**, desplegada con capacidad horizontal y redundancia en varias zonas de disponibilidad. Los servicios se separan por responsabilidad y por perfil de carga. La ruta crítica de la evaluación queda reducida a autenticación, entrega del intento, lectura de preguntas y persistencia durable de respuestas.

La decisión principal es:

- usar un CDN y una capa de entrada escalable para absorber conexiones y contenido estático;
- generar el intento aleatorizado de forma determinista a partir de una semilla por estudiante, preparada o precalculada antes de la apertura;
- persistir las respuestas mediante operaciones idempotentes y durables, con confirmación al navegador solo después de que la escritura haya sido aceptada por el almacenamiento principal;
- usar una cola para telemetría, auditoría derivada, calificación y reportes, pero nunca como única garantía de guardado de una respuesta;
- mantener el tiempo oficial y el estado del intento en el servidor;
- conservar eventos sospechosos como evidencia para revisión humana, sin sanciones automáticas.

## Servicios y responsabilidades

### 1. CDN y distribución de contenido

Sirve los archivos estáticos de la aplicación, imágenes y recursos de las preguntas que no sean confidenciales. Reduce la carga sobre los servicios de aplicación y permite que la primera carga se distribuya desde puntos cercanos a los estudiantes. El contenido específico del intento y las respuestas no se publica de forma cacheable en el CDN.

### 2. API Gateway / balanceador de entrada

Es el único punto público de entrada a las APIs. Termina TLS, aplica límites de tasa, valida tokens, enruta hacia los servicios internos y distribuye tráfico entre instancias saludables. También debe soportar conexiones persistentes o solicitudes frecuentes de autoguardado sin que una instancia individual se convierta en cuello de botella.

### 3. Servicio de identidad y acceso

Autentica a estudiantes, docentes y coordinación mediante la identidad institucional. Emite tokens de corta duración con roles y alcance. Valida que el estudiante esté inscrito y que solo pueda consultar o modificar su propio intento. La autorización para crear, abrir, cerrar o extender un examen queda separada de la autenticación.

### 4. Servicio de cursos y matrícula

Mantiene cursos, comisiones, períodos e inscripción de estudiantes, o sincroniza esa información desde el sistema académico. Publica una versión de la lista de inscritos para cada aplicación, de modo que una consulta al sistema académico no sea necesaria en cada solicitud durante el pico.

### 5. Servicio de banco de preguntas

Permite al docente crear y versionar preguntas, opciones, categorías, dificultad, respuestas correctas y metadatos. Una versión publicada queda inmutable para que una modificación posterior no cambie un examen ya iniciado. El servicio valida que el banco tenga suficientes preguntas para las reglas de selección.

### 6. Servicio de armado y configuración del examen

Permite definir duración, ventana de apertura y cierre, reglas de selección por categoría, cantidad de preguntas, política de navegación, prórrogas autorizadas y fecha de publicación de resultados. Al publicar el examen, congela las versiones de preguntas y genera una configuración identificada por versión.

### 7. Servicio de asignación y aleatorización

Construye la versión individual del examen. Para cada intento usa una semilla aleatoria criptográficamente segura, asociada al identificador del estudiante y al examen, pero no expuesta al navegador. Con esa semilla determina el subconjunto de preguntas, el orden de preguntas y el orden de opciones.

La asignación se prepara durante la etapa de precarga del evento o se calcula de forma determinista en la primera solicitud y se almacena. Así, repetir una solicitud no cambia el examen del estudiante y no es necesario generar 5.000 estructuras completas en una única operación al abrir la ventana. El estudiante recibe solo la información de las preguntas que le corresponden, nunca la respuesta correcta ni el banco completo.

### 8. Servicio de aplicación de examen / intentos

Es el dueño del ciclo de vida del intento: `pendiente`, `activo`, `desconectado`, `enviado` o `cerrado`. Valida que el estudiante tenga derecho a presentar el examen, entrega la configuración individual, calcula el tiempo restante usando el reloj del servidor y aplica la ventana global, las prórrogas y el cierre.

El navegador puede conservar temporalmente un estado local para tolerar una desconexión breve, pero el servidor es la autoridad para el tiempo, el estado del intento y la versión de las preguntas. Al reconectar, el servicio devuelve el último estado durable conocido y recibe las respuestas pendientes con sus identificadores de operación.

### 9. Servicio de respuestas y persistencia durable

Es el componente más crítico. Cada cambio de respuesta se envía con:

- identificador del intento;
- identificador de la pregunta;
- número de versión o secuencia de la respuesta;
- identificador único de operación;
- marca de tiempo del cliente y del servidor.

El servicio procesa la operación de forma idempotente: reintentarla no duplica ni altera indebidamente una respuesta posterior. La respuesta se registra en un almacenamiento transaccional durable y se actualiza una proyección del estado actual del intento. La confirmación al cliente se emite después de que la escritura principal haya sido confirmada.

La base se particiona por examen o por período de aplicación y se dimensiona para el pico de escrituras. Las réplicas de lectura, cachés y colas no reemplazan la escritura durable. Para recuperabilidad, se mantienen registros de auditoría de respuestas, backups automáticos, replicación entre zonas y pruebas de restauración.

### 10. Servicio de sesión y presencia

Mantiene el estado de conexión, última actividad, versión del cliente y sincronización del intento. Una desconexión no finaliza el examen ni borra respuestas. Registra la desconexión y permite reanudar mientras el tiempo oficial no haya expirado. Puede usar un canal de eventos en tiempo real para informar cambios de estado, pero el examen debe seguir funcionando con solicitudes HTTP reintentables si ese canal falla.

### 11. Servicio de eventos y auditoría

Recibe eventos técnicos y de interacción, por ejemplo: desconexiones, reconexiones, cambios de pestaña cuando el navegador los informa, múltiples sesiones, secuencias de navegación inusuales y patrones de tiempo anómalos. Los eventos se envían a una cola o bus para no bloquear el guardado de respuestas.

Los eventos son evidencia contextual, no una sentencia. Se conservan con integridad, control de acceso y política de retención definida por la universidad. El sistema no captura audio, video, teclas fuera de la aplicación ni el contenido de otras aplicaciones del equipo personal.

### 12. Servicio de calificación

Al cerrar o entregar un intento, califica automáticamente las preguntas cerradas usando la versión congelada del examen. La calificación se ejecuta de forma asíncrona y es idempotente. Las preguntas que requieran revisión docente quedan pendientes. Los resultados permanecen ocultos hasta que finalice la política institucional de reclamos y publicación.

### 13. Servicio de reportes y monitoreo académico

Construye los reportes de presentados, ausentes, incidencias, respuestas, tiempos y distribución de notas a partir de datos consolidados. No debe consultar tablas operativas de respuestas de forma intensiva durante el examen; consume proyecciones, réplicas o datos generados después de la aplicación.

### 14. Servicio de integración académica

Sincroniza matrícula y cursos desde el sistema académico y, después del cierre del proceso de reclamos, publica las notas finales. La integración usa mensajes o APIs idempotentes, con reintentos y bandeja de errores. Una indisponibilidad temporal del sistema académico no debe impedir presentar ni guardar respuestas.

### 15. Observabilidad y operación del evento

Centraliza métricas, logs estructurados, trazas y alertas. Debe mostrar como mínimo: latencia de primera pregunta, tasa de errores, respuestas por segundo, respuestas pendientes, edad de la cola, conexiones activas, desconexiones, uso de CPU y base de datos, y estudiantes sin confirmación reciente.

## Flujos críticos

### Preparación

1. El docente versiona y publica el banco de preguntas.
2. Configura el examen y sus reglas de selección.
3. Coordinación sincroniza la matrícula y congela la lista de inscritos.
4. El sistema valida capacidad, precarga configuraciones y semillas, calienta cachés y verifica backups.
5. Se realiza una prueba de carga con al menos 5.000 sesiones y una prueba de restauración.

### Inicio del examen

1. El estudiante se autentica antes o durante la ventana.
2. El servicio de intentos valida inscripción y ventana horaria.
3. Se obtiene o crea la asignación determinista del estudiante.
4. Se entrega la primera pregunta y el tiempo oficial restante.
5. El estudiante puede comenzar aunque el sistema académico de origen no esté disponible, siempre que la matrícula congelada ya haya sido cargada.

### Autoguardado

1. El navegador actualiza su estado local y genera un identificador único de operación.
2. Envía la respuesta al servicio de respuestas.
3. Si no hay conectividad, mantiene la operación en una cola local del navegador y reintenta con backoff.
4. El servidor valida intento, pregunta, versión, autorización y tiempo.
5. Persiste de forma durable e idempotente.
6. Devuelve una confirmación que permite retirar la operación de la cola local.

Una desconexión posterior a la confirmación no pierde la respuesta. Una desconexión anterior a la confirmación puede provocar un reintento, pero no una duplicación. Si el almacenamiento local del navegador se elimina, la última versión confirmada por el servidor sigue siendo recuperable.

### Reanudación

Al reconectar, el navegador solicita el estado del intento y envía las operaciones pendientes. El servidor conserva la última respuesta válida por pregunta, resuelve reintentos por identificador de operación y devuelve el tiempo restante calculado con el reloj del servidor. La reanudación no reinicia el examen ni concede tiempo adicional, salvo una prórroga explícita autorizada.

### Cierre y publicación

Al vencer la ventana, el servicio de intentos deja de aceptar nuevas modificaciones, completa el cierre idempotente y envía el intento a calificación. Las incidencias y eventos quedan disponibles para revisión. La publicación de resultados y la exportación al sistema académico ocurren después del cierre del período de reclamos.

## Garantías de calidad y criterios de aceptación

- **Rendimiento:** con 5.000 estudiantes iniciando simultáneamente, al menos el 99 % debe recibir su primera pregunta en un máximo de 5 segundos, bajo una prueba equivalente al evento real.

- **Disponibilidad:** el fallo de una instancia o de una zona no debe finalizar los intentos ni impedir la recuperación de respuestas confirmadas.

- **Durabilidad:** cada respuesta confirmada debe poder reconstruirse después de reiniciar servicios y después de restaurar una copia de seguridad.

- **Reanudación:** una desconexión de dos minutos debe permitir continuar con el mismo examen, las respuestas confirmadas y el tiempo restante correcto.

- **Integridad:** dos solicitudes repetidas con el mismo identificador de operación deben producir un único efecto lógico.

- **Privacidad:** solo se registran eventos definidos y proporcionales; el acceso a respuestas, eventos y reportes queda auditado por rol.

- **Operabilidad:** coordinación debe observar salud, latencia, errores, cola de respuestas y estudiantes afectados sin consultar manualmente cada servicio.

## Seguridad y privacidad

Todo tráfico usa TLS. Los tokens tienen expiración y alcance limitado; las APIs aplican autorización por rol y por propietario del intento. Las respuestas y los eventos se cifran en tránsito y en reposo. Los secretos se administran fuera del código y las acciones administrativas se auditan.

La aleatorización reduce el valor de compartir capturas, pero no garantiza por sí sola que no exista colaboración. Los eventos sospechosos se presentan como indicadores con contexto, umbral y trazabilidad. Solo docentes o autoridades autorizadas pueden revisarlos y ninguna sanción se genera automáticamente.

## Trade-offs y consecuencias

### Beneficios

- El pico de estudiantes se absorbe escalando servicios sin escalar todo el sistema por igual.
- La ruta de respuestas queda aislada de reportes, integración y telemetría.
- Los reintentos son seguros y la recuperación no depende de una conexión continua.
- La generación determinista evita inconsistencias y permite precarga.
- La evidencia de integridad es revisable y compatible con el debido proceso.

### Costos y riesgos aceptados

- Aumentan la complejidad operativa, la observabilidad requerida y el costo de una aplicación distribuida.
- Existen problemas de consistencia eventual en reportes, eventos y calificaciones, aunque la respuesta confirmada y el reloj del intento tienen prioridad.
- El navegador puede perder su cola local por políticas del dispositivo; por eso esa cola es un mecanismo de tolerancia, no la fuente de verdad.
- El registro de cambios de pestaña y patrones de tiempo puede tener falsos positivos y depende de las capacidades del navegador.
- Una base durable y redundante puede ser más costosa que una escritura directa en el módulo actual, pero el costo se justifica por el riesgo académico de perder respuestas.

## Alternativas consideradas

### Mantener el módulo genérico del campus virtual

Se descarta porque ya mostró problemas bajo el pico requerido y no separa la persistencia de respuestas de las funciones menos críticas.

### Escribir todas las respuestas únicamente en una cola

Se descarta como garantía principal: una cola puede absorber el pico, pero una caída o demora antes del consumo deja incertidumbre sobre qué recibió realmente el sistema. Puede usarse para eventos y procesamiento derivado, no para confirmar respuestas sin una política de durabilidad equivalente.

### Guardar respuestas únicamente en el navegador

Se descarta porque el usuario puede perder el dispositivo, limpiar los datos o tener un fallo del navegador. Se conserva una cola local como respaldo temporal y mecanismo de reintento.

### Crear un examen completo distinto para cada estudiante al abrir la ventana

Se descarta la generación masiva en el segundo cero por el pico de CPU y lecturas. Se usa asignación determinista con precarga o creación bajo demanda y cacheada.

### Exigir una aplicación de vigilancia instalada

Se descarta por privacidad, soporte y exclusión de estudiantes que usan equipos no administrados. La solución se limita a controles del navegador, aleatorización y eventos proporcionales.

## Decisiones pendientes

Estas decisiones se detallarán en ADR posteriores:

- tecnología concreta de base de datos, particionamiento y estrategia de replicación;
- proveedor de nube, topología de zonas y política de escalado automático;
- formato exacto del evento de respuesta y política de resolución de conflictos;
- retención, anonimización y acceso a eventos sospechosos;
- umbrales de alertas y procedimiento de contingencia para una caída durante la ventana;
- estrategia de pruebas de carga, caos y restauración;
- política para extensiones individuales y casos de reclamo.
