# Bienvenidos al Grupo 7: Exámenes Finales

Repositorio de trabajo del **Grupo 7** para el diseño de arquitectura de software del sistema de exámenes conjuntos en línea.

## Integrantes

| Código | Nombre |
| --- | --- |
| 1152284 | Diego Alejandro Jaimes Torrado |
| 1151943 | David Santiago Peñaranda Parada |
| 1151825 | Luis Alejandro Fonseca Cadena |
| 1152187 | Rober Esteban Moreno Moreno |
| 1151714 | Pedro Alejandro Molina Ortiz |
| 1152055 | Edwin Andres Duarte Rodriguez |

## ¿Qué se ha hecho?

Se documentó una propuesta arquitectónica para una plataforma capaz de aplicar exámenes en línea a entre 3.000 y 5.000 estudiantes simultáneamente, durante una ventana estricta de 90 minutos.

Los principales entregables son:

- **Visión del sistema:** definición del problema, objetivos, alcance, actores, funciones esenciales, contexto C4, escenarios de calidad, requisitos no funcionales y decisiones entre operaciones síncronas y asíncronas.
- **ADR-000:** decisión de utilizar una arquitectura distribuida y modular, con servicios separados para identidad, matrícula, banco de preguntas, aleatorización, intentos, respuestas, auditoría, calificación, reportes e integración académica.
- **ADR-001:** decisión de guardar respuestas y cerrar intentos de forma síncrona, mientras la calificación, el registro de notas y las notificaciones se procesan mediante eventos.
- **Vista de contenedores C4:** representación de la API, almacenamiento durable, broker, workers de calificación, auditoría, notificaciones e integración académica, junto con los actores y sistemas externos.
- **Flujo de exámenes:** definición de la ruta crítica de cinco pasos, incluyendo responsables, operaciones síncronas o por evento, manejo de fallos, compensaciones e idempotencia.

## Problema abordado

La universidad necesita evitar la pérdida de respuestas y soportar el pico de estudiantes que ingresan simultáneamente a un examen conjunto. La solución prioriza:

- rendimiento y escalabilidad durante el pico de aplicación;
- disponibilidad, persistencia durable y recuperación de respuestas;
- aleatorización de preguntas y opciones;
- registro de eventos relevantes sin vigilancia invasiva;
- revisión humana de incidencias, sin sanciones automáticas;
- integración posterior con el sistema académico institucional.

## Documentación

- [Visión del sistema](docs/vision.md)
- [ADR-000: Arquitectura distribuida](docs/adr/ADR-000.md)
- [ADR-001: Calificación, notas y notificaciones por evento](docs/adr/ADR-001-BORRADOR.MD)
- [Vista de contenedores C4](docs/contenedores.dsl)
- [Flujo de exámenes y decisiones](docs/flujo-examenes_finales.md)

## Estado del proyecto

La documentación de visión, contexto, flujo, arquitectura distribuida, vista de contenedores y procesamiento por eventos se encuentra elaborada y alineada. La vista de contenedores fue ajustada para mostrar los protocolos, la sincronía y la asincronía de cada comunicación. Las decisiones técnicas pendientes, como la tecnología concreta de almacenamiento, la estrategia de despliegue y los procedimientos de contingencia, quedan identificadas para ADR posteriores.