workspace "Sistema de Exámenes en Línea" {

    !identifiers hierarchical

    model {
        estudiante = person "Estudiante" "Presenta el examen desde un navegador, responde preguntas y puede reconectarse durante la ventana de aplicación."
        docente = person "Docente" "Administra el banco de preguntas, configura exámenes, revisa resultados y atiende reclamos."
        coordinacion = person "Coordinación académica" "Programa las ventanas, monitorea la aplicación y autoriza prórrogas."

        sistemaAcademico = softwareSystem "Sistema académico" "Sistema institucional externo que proporciona cursos e inscritos y recibe las notas finales." "Sistema externo"
        proveedorNotificaciones = softwareSystem "Proveedor de notificaciones" "Servicio externo para enviar avisos cuando los resultados sean publicados." "Sistema externo"
        proveedorModelo = softwareSystem "Proveedor del modelo de lenguaje" "Servicio externo que genera la respuesta a partir de la pregunta y los fragmentos de la política (ADR-002)." "Sistema externo"

        sistemaExamenes = softwareSystem "Sistema de Exámenes en Línea" "Permite configurar, aplicar, guardar, recuperar, calificar y reportar exámenes conjuntos para hasta 5.000 estudiantes simultáneos." {
            apiExamenes = container "API de exámenes" "Autentica usuarios, valida intentos, entrega preguntas, controla el tiempo, guarda respuestas y cierra el examen. Organizada en puertos y adaptadores." "API HTTP / Node.js" "Camino escenario"
            almacenamiento = container "Almacenamiento durable" "Conserva intentos, asignaciones, respuestas confirmadas, notas y claves de idempotencia." "Base de datos transaccional" "Camino escenario"
            asistente = container "Asistente de políticas" "Responde preguntas sobre la política del evento con RAG y guardrails; plan B sin modelo. Apagado durante la ventana de 90 minutos." "Node.js"
            indicePoliticas = container "Índice de políticas" "Fragmentos de la política de cada evento, por versión." "Índice de búsqueda"
            broker = container "Broker de eventos" "Conserva eventos hasta que los consumidores los procesen y permite desacoplar la ruta crítica." "Cola o broker de mensajes"
            calificador = container "Calificador y registrador de notas" "Consume el cierre del intento, califica preguntas cerradas y registra la nota para publicación posterior." "Worker de eventos"
            auditoria = container "Auditoría y reportes" "Consume eventos de sesión y construye incidencias, métricas y reportes para revisión humana." "Worker de eventos"
            notificador = container "Notificador" "Consume la publicación de resultados y envía avisos al estudiante y al docente." "Worker de eventos"
            integrador = container "Integrador académico" "Sincroniza la matrícula y envía las notas finales al sistema académico después de los reclamos." "Worker de eventos"
        }

        estudiante -> sistemaExamenes.apiExamenes "Presenta el examen y envía respuestas" "HTTPS, síncrono" "Camino escenario"
        estudiante -> sistemaExamenes.asistente "Pregunta por la política del evento (antes de abrir y después de cerrar)" "HTTPS, síncrono"
        sistemaExamenes.asistente -> sistemaExamenes.indicePoliticas "Busca fragmentos del evento y versión vigente" "Síncrono, máx. 2 fragmentos"
        sistemaExamenes.asistente -> proveedorModelo "Envía pregunta + fragmentos, sin datos personales" "HTTPS, síncrono, timeout 3 s"
        sistemaExamenes.apiExamenes -> sistemaExamenes.indicePoliticas "Indexa la política versionada al publicar el examen" "Asíncrono"
        docente -> sistemaExamenes.apiExamenes "Configura preguntas y revisa resultados" "HTTPS, síncrono"
        coordinacion -> sistemaExamenes.apiExamenes "Programa y monitorea la aplicación" "HTTPS, síncrono"

        sistemaAcademico -> sistemaExamenes.integrador "Entrega inscritos" "HTTPS, síncrono antes del examen"
        sistemaExamenes.integrador -> sistemaAcademico "Envía notas finales" "HTTPS, asíncrono, con reintentos"

        sistemaExamenes.apiExamenes -> sistemaExamenes.almacenamiento "Guarda respuestas confirmadas con escritura idempotente por operationId (ADR-003)" "Base de datos, síncrono y durable" "Camino escenario"
        sistemaExamenes.apiExamenes -> sistemaExamenes.broker "Publica IntentoCerrado y eventos" "Mensajería, asíncrono"

        sistemaExamenes.broker -> sistemaExamenes.calificador "Entrega IntentoCerrado" "Mensajería, al menos una vez"
        sistemaExamenes.broker -> sistemaExamenes.auditoria "Entrega eventos de sesión" "Mensajería, al menos una vez"
        sistemaExamenes.broker -> sistemaExamenes.notificador "Entrega ResultadoPublicado" "Mensajería, al menos una vez"
        sistemaExamenes.broker -> sistemaExamenes.integrador "Entrega NotaLista" "Mensajería, al menos una vez"

        sistemaExamenes.calificador -> sistemaExamenes.broker "Publica ResultadoPublicado" "Mensajería, asíncrono"
        sistemaExamenes.calificador -> sistemaExamenes.broker "Publica NotaLista" "Mensajería, asíncrono"
        sistemaExamenes.calificador -> sistemaExamenes.almacenamiento "Persiste calificación idempotente" "Base de datos, síncrono"
        sistemaExamenes.auditoria -> sistemaExamenes.almacenamiento "Persiste incidencias y reportes" "Base de datos, síncrono"
        sistemaExamenes.notificador -> proveedorNotificaciones "Envía aviso de resultados" "HTTPS, asíncrono"
        sistemaExamenes.integrador -> sistemaExamenes.almacenamiento "Registra estado de la nota" "Base de datos, síncrono"
    }

    views {
        container sistemaExamenes "Contenedores" {
            include estudiante
            include docente
            include coordinacion
            include sistemaAcademico
            include proveedorNotificaciones
            include proveedorModelo
            include *

            autolayout lr
            title "Sistema de Exámenes en Línea - Vista de Contenedores C4"
            description "Contenedores, sistemas externos y flujos síncronos o asíncronos del caso de exámenes finales."
        }

        styles {
            element "Person" {
                background #1168bd
                color #ffffff
                shape person
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "Software System" {
                background #999999
                color #ffffff
            }
            element "System_Ext" {
                background #999999
                color #ffffff
            }
            element "Element" {
                color #ffffff
            }
            element "Camino escenario" {
                stroke #d62728
                strokeWidth 6
            }
            relationship "Camino escenario" {
                color #d62728
                thickness 5
            }
            relationship "Relationship" {
                color #555555
                routing orthogonal
            }
        }
    }
}
