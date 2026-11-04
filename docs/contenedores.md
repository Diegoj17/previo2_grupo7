# Vista de contenedores C4: Sistema de Exámenes en Línea

Versión del segundo previo. Cambios frente a la versión anterior ([contenedores.dsl](contenedores.dsl), imagen anterior en [img/contenedores-v1.png](img/contenedores-v1.png)):

- Se agrega el **Asistente de políticas** y su **Índice de políticas** ([ADR-002](adr/ADR-002-asistente-de-politicas-rag.md)).
- Se agrega el **Proveedor del modelo de lenguaje** como **sistema externo**, igual que el sistema académico o el proveedor de notificaciones.
- Se marca en **rojo y grueso** el **camino del escenario** probado en el [ADR-003](adr/ADR-003-idempotencia-y-secuencia-en-autoguardado.md): Estudiante → API de exámenes → Almacenamiento durable.

Línea continua: el que llama espera la respuesta. Línea punteada: nadie espera; el mensaje queda en el broker.

```mermaid
flowchart LR
    estudiante(["Estudiante<br/>[Persona]"])
    docente(["Docente<br/>[Persona]"])
    coordinacion(["Coordinación académica<br/>[Persona]"])

    subgraph sistema["Sistema de Exámenes en Línea"]
        api["API de exámenes<br/>[Node.js, hexagonal]<br/>entrega preguntas, guarda respuestas,<br/>cierra intentos"]
        db[("Almacenamiento durable<br/>[BD transaccional]<br/>intentos, respuestas,<br/>claves de idempotencia")]
        broker[["Broker de eventos<br/>[cola de mensajes]"]]
        calificador["Calificador y registrador de notas<br/>[worker]"]
        auditoria["Auditoría y reportes<br/>[worker]"]
        notificador["Notificador<br/>[worker]"]
        integrador["Integrador académico<br/>[worker]"]
        asistente["Asistente de políticas<br/>[Node.js, RAG + guardrails]<br/>apagado durante los 90 min"]
        indice[("Índice de políticas<br/>[fragmentos por evento y versión]")]
    end

    academico["Sistema académico<br/>[sistema externo]"]
    proveedorNotif["Proveedor de notificaciones<br/>[sistema externo]"]
    llm["Proveedor del modelo de lenguaje<br/>[sistema externo]"]

    estudiante -->|"Marca y guarda respuestas<br/>HTTPS, síncrono"| api
    api -->|"Escritura condicional e idempotente<br/>SQL, síncrono, durable"| db
    docente -->|"Configura exámenes y políticas<br/>HTTPS, síncrono"| api
    coordinacion -->|"Programa, monitorea, autoriza prórrogas<br/>HTTPS, síncrono"| api
    api -.->|"Publica IntentoCerrado y eventos de sesión<br/>mensajería, asíncrono"| broker
    broker -.->|"IntentoCerrado<br/>al menos una vez"| calificador
    broker -.->|"Eventos de sesión<br/>al menos una vez"| auditoria
    broker -.->|"ResultadoPublicado<br/>al menos una vez"| notificador
    broker -.->|"NotaLista<br/>al menos una vez"| integrador
    calificador -.->|"Publica NotaLista y ResultadoPublicado<br/>asíncrono"| broker
    calificador -->|"Calificación idempotente<br/>SQL, síncrono"| db
    auditoria -->|"Incidencias y reportes<br/>SQL, síncrono"| db
    notificador -.->|"Aviso de resultados<br/>HTTPS, asíncrono"| proveedorNotif
    academico -->|"Inscritos<br/>HTTPS, síncrono antes del examen"| integrador
    integrador -.->|"Notas finales<br/>HTTPS, asíncrono con reintentos"| academico
    api -.->|"Política versionada al publicar el examen<br/>asíncrono"| indice
    estudiante -->|"Pregunta por la política del evento<br/>HTTPS, síncrono, antes de abrir y después de cerrar"| asistente
    asistente -->|"Fragmentos del evento y versión vigente<br/>síncrono, máx. 2"| indice
    asistente -->|"Pregunta + fragmentos, sin datos personales<br/>HTTPS, síncrono, timeout 3 s"| llm

    classDef camino fill:#fde2e2,stroke:#d62728,stroke-width:3px,color:#000
    classDef externo fill:#e8e8e8,stroke:#777,color:#000
    class estudiante,api,db camino
    class academico,proveedorNotif,llm externo
    linkStyle 0,1 stroke:#d62728,stroke-width:4px
```

## Relaciones nuevas o con decisión explícita

| Origen → destino | Protocolo | Síncrono / asíncrono | Tiempo máximo de espera | Si falla |
| --- | --- | --- | --- | --- |
| Asistente → Proveedor del modelo | HTTPS (API del proveedor) | Síncrono | **3 s** (timeout) | Plan B sin modelo: texto literal de la política + camino a coordinación |
| Asistente → Índice de políticas | Consulta interna | Síncrono | 500 ms | Plan B: página estática de la política |
| Estudiante → Asistente | HTTPS | Síncrono; solo antes de la apertura y después del cierre | 3,5 s (timeout del modelo + recuperación) | El examen no se afecta: el asistente no está en la ruta crítica |
| **Estudiante → API de exámenes** (escenario) | HTTPS | Síncrono | Confirmación solo tras escritura durable | El navegador conserva la operación y la reintenta con el mismo `operationId` |
| **API → Almacenamiento durable** (escenario) | SQL / driver | Síncrono, durable | Lo que tarde la escritura confirmada | Sin confirmación al estudiante; la respuesta queda "pendiente" |

## Camino del escenario (Parte B)

El escenario "ninguna respuesta se pierde aunque la red repita y desordene los autoguardados" solo toca tres elementos de esta vista:

1. **Estudiante (navegador)**: envía cada autoguardado con `operationId`, `attemptId`, `questionId` y `sequence`, y lo reintenta si no recibe confirmación.
2. **API de exámenes**: adaptador de entrada → caso de uso `guardarRespuesta` → puerto `AlmacenRespuestas`.
3. **Almacenamiento durable**: en la prueba es un adaptador simulado en memoria con latencia.

No intervienen autenticación, banco de preguntas, broker ni workers, así que no se implementan. El código está en [`src/`](../src) y la prueba en [`test/escenario.test.js`](../test/escenario.test.js).
