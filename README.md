# Grupo 7 · Exámenes en línea · Segundo previo

**Video de sustentación (YouTube, oculto):** _PENDIENTE: pegar aquí el enlace_

## Escenario elegido

**Ninguna respuesta confirmada se pierde, aunque la red repita y desordene los autoguardados** (disponibilidad y persistencia, visión §7.2).

- **Por qué este:** es el incidente que originó el proyecto (el sistema actual "ya perdió respuestas dos veces"), y una respuesta perdida no se recupera dentro de una ventana inamovible de 90 minutos.
- **Medida:** 0 respuestas confirmadas perdidas y 0 registros duplicados sobre todos los autoguardados de una aplicación (5.000 estudiantes × 10 preguntas), con el 20 % de los autoguardados llegando dos veces y a destiempo.
- **Táctica:** escritura idempotente por `operationId`. Antes: unas 1.700 respuestas perdidas por corrida. Después: 0.

Detalle, alternativas y costo en el [ADR-003](docs/adr/ADR-003-idempotencia-en-autoguardado.md).

## Cómo ejecutar (Node.js 20 o superior, sin dependencias)

```bash
npm run escenario
```

```bash
npm run escenario:sin-falla
```

El primero corre la prueba **con la falla** (red inestable) y el segundo **sin ella**. `npm test` corre todo. Para ver la prueba fallar, se vuelve al commit anterior a la táctica (`git checkout prueba-fallando`) y se corre `npm run escenario`. Para regresar: `git checkout main`.

Asistente del ADR-002 (modelo simulado): `npm run eval:asistente` (20 casos, mínimo 18 aciertos y 0 daños) y `npm run eval:asistente:sin-guardrails` (muestra los 4 daños que los guardrails evitan).

## Contenido

| Archivo | Qué es |
| --- | --- |
| [ADR-001](docs/adr/ADR-001-calificacion-por-evento.md) | Patrón clásico (final): guardar y cerrar síncronos; calificar, nota y notificación por evento; API hexagonal |
| [ADR-002](docs/adr/ADR-002-asistente-de-politicas-rag.md) | Asistente de políticas con RAG + guardrails; diagrama Mermaid de la falla |
| [ADR-003](docs/adr/ADR-003-idempotencia-en-autoguardado.md) | La táctica aplicada y su costo medido |
| [contenedores.md](docs/contenedores.md) / [.dsl](docs/contenedores.dsl) | Vista de contenedores con el proveedor del modelo y el camino del escenario |
| `src/`, `test/` | Código del escenario (puerto, adaptadores, caso de uso) y del asistente; pruebas |
| [mediciones/](docs/mediciones) | 5 corridas antes y 5 después de la táctica |

## Quién hizo qué

_PENDIENTE: confirmar con el grupo. Cada integrante explica en el video la parte que trabajó y hace sus propios commits._

| Integrante | Código | Aporte | Parte del video |
| --- | --- | --- | --- |
| Diego Alejandro Jaimes Torrado | 1152284 | | 1. El escenario |
| David Santiago Peñaranda Parada | 1151943 | | 2. El ADR-002 |
| Luis Alejandro Fonseca Cadena | 1151825 | | 3. La prueba fallando |
| Rober Esteban Moreno Moreno | 1152187 | | 4. La táctica |
| Pedro Alejandro Molina Ortiz | 1151714 | | 5. El costo |
| Edwin Andres Duarte Rodriguez | 1152055 | | 6. Qué queda pendiente |

Se usaron agentes de IA como apoyo. Las decisiones de los ADR las explica y defiende el grupo.
