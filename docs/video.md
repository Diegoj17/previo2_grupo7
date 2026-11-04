# Qué mostrar en cada parte del video (máximo 10 minutos)

No es un guion para leer. Es la lista de lo que debe verse en pantalla, para que cada integrante lo explique con sus palabras mientras muestra el código y la terminal. Cada integrante pone su **nombre en pantalla** y usa **su propia voz**.

| # | Parte | Tiempo | Qué abrir / ejecutar | Qué debe quedar claro |
| --- | --- | --- | --- | --- |
| 1 | El escenario | 1 min | `docs/adr/ADR-003…md`, secciones "El escenario elegido y por qué manda" y "La medida, corregida" | Por qué manda sobre §7.1 y §7.3. El dato del caso: ya se perdieron respuestas dos veces y la ventana es inamovible. La medida: 0 perdidas y 0 duplicados; de dónde sale el número y cuál es la ventana |
| 2 | El ADR-002 | 2 min | `docs/adr/ADR-002…md` (diagrama Mermaid en GitHub), `src/asistente/asistente.js` (`validarSalida`), `npm run eval:asistente:sin-guardrails` y luego `npm run eval:asistente` | Dónde va el modelo (antes de abrir y después de cerrar, no durante). Qué hace el `if` (6 de 20 sin modelo). El momento del error ("15 minutos"), qué lo detecta (números sin respaldo, citas, timeout de 3 s) y cómo termina (plan B + coordinación). La medida: 18/20 y 0 daños |
| 3 | La prueba fallando | 2 min | `git checkout prueba-fallando`, `npm run escenario`; `src/adaptadores/redInestable.js` y `almacenSimulado.js` (`guardar`, "último gana") | Cómo se reproduce la falla (la copia tardía). La secuencia B → C → copia de B. Las ≈ 1.700 respuestas perdidas y ≈ 13.000 duplicados. Que la condición de la prueba es la medida, no un `console.log` |
| 4 | La táctica | 2 min | `git checkout main`, `git diff prueba-fallando tactica-aplicada -- src`, `npm run escenario` | Qué cambió (`guardarIdempotente`, la clave en la misma transacción). Por qué idempotencia y no una cola, ni deduplicar en el navegador, ni la secuencia (que la prueba nunca ejercitó). La prueba pasa: 0 y 0 |
| 5 | El costo | 2 min | `docs/mediciones/antes.txt` y `despues.txt`, tabla de costo del ADR-003 | p50/p95 antes y después (sin diferencia medible, y por qué). +18/−5 líneas. 65.000 claves por aplicación. Las fallas nuevas: estado `duplicada`, clave en la misma transacción, retención, misma clave con otro contenido |
| 6 | Qué queda pendiente | 1 min | ADR-003, "Qué queda pendiente" | Doble clic o dos pestañas: operaciones *distintas* desordenadas que la idempotencia no detiene (táctica: escritura condicional por `sequence`). Base lenta o caída: timeout + "pendiente". La prueba de carga de §7.1 |

Antes de grabar: `npm test` debe pasar en el computador de quien graba (Node 20 o superior).
