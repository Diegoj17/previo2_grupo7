// ESCENARIO (ADR-003): ninguna respuesta confirmada se pierde, aunque la red repita y desordene los autoguardados.
//
// Fuente:    5.000 estudiantes con conexión doméstica inestable (el navegador reintenta).
// Estímulo:  el 20 % de los autoguardados llega dos veces; la copia llega 5-60 ms tarde, cuando el
//            estudiante ya pudo cambiar su respuesta.
// Artefacto: API de exámenes (caso de uso guardarRespuesta) + almacenamiento durable.
// Entorno:   examen en curso: todos los autoguardados de una aplicación (5.000 × 10 preguntas).
// Respuesta: se conserva la última respuesta que el estudiante vio confirmada; los reintentos no duplican.
// MEDIDA:    0 respuestas confirmadas perdidas (reemplazadas por una más vieja) y 0 registros duplicados,
//            contados sobre todos los autoguardados de la ventana de 90 minutos de una aplicación.
// ORIGEN:    caso 7 "Ninguna respuesta se pierde": la respuesta de las 8:47 sobrevive al portátil que muere
//            a las 8:48; el sistema actual ya perdió respuestas dos veces. RF-04, RF-05 y visión §7.2 (100 %).
//
// npm run escenario             -> con la falla (red inestable)
// npm run escenario:sin-falla   -> sin la falla
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenSimulado } from '../src/adaptadores/almacenSimulado.js';
import { crearRed } from '../src/adaptadores/redInestable.js';
import { crearGuardarRespuesta } from '../src/dominio/guardarRespuesta.js';
import { crearControladorRespuestas } from '../src/api/controladorRespuestas.js';

const arg = (nombre, defecto) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1] ?? process.env[nombre.toUpperCase()] ?? defecto;
const FALLA = arg('falla', 'red-inestable');
const ESTUDIANTES = Number(arg('estudiantes', 5000));
const PREGUNTAS = 10;
const PROB_DUPLICADO = Number(arg('prob', 0.2));

// Azar con semilla, para que cada corrida reproduzca la misma tormenta de autoguardados.
function azarConSemilla(semilla) {
  return () => {
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// El navegador de un estudiante: marca cada pregunta y en el 30 % cambia de opinión una vez.
async function presentarExamen(e, red, azar, confirmadas) {
  const attemptId = `INT-${e}`;
  for (let q = 1; q <= PREGUNTAS; q++) {
    const questionId = `P${q}`;
    const marcas = azar() < 0.3 ? 2 : 1;
    let opcion = Math.floor(azar() * 4);
    for (let sequence = 1; sequence <= marcas; sequence++) {
      opcion = (opcion + sequence) % 4; // si cambia, elige otra opción
      const op = { operationId: `${attemptId}-${questionId}-${sequence}`, attemptId, questionId, sequence, opcion: 'ABCD'[opcion] };
      const r = await red.enviar({ body: op });
      assert.equal(r.status, 200, `autoguardado no confirmado: ${JSON.stringify(r.body)}`);
      confirmadas.set(`${attemptId}|${questionId}`, op); // lo último que el estudiante vio como "guardada"
    }
  }
}

const percentil = (valores, p) => [...valores].sort((a, b) => a - b)[Math.ceil((p / 100) * valores.length) - 1];

test(`escenario: ${ESTUDIANTES} estudiantes × ${PREGUNTAS} preguntas, falla = ${FALLA}`, async () => {
  const azar = azarConSemilla(7);
  const almacen = crearAlmacenSimulado({ azar });
  const controlador = crearControladorRespuestas(crearGuardarRespuesta(almacen));
  const latencias = [];
  const medirApi = async (peticion) => {
    const t0 = performance.now();
    const r = await controlador(peticion);
    latencias.push(performance.now() - t0);
    return r;
  };
  const red = crearRed(medirApi, { falla: FALLA, prob: PROB_DUPLICADO, azar });
  const confirmadas = new Map();

  const inicio = performance.now();
  await Promise.all(Array.from({ length: ESTUDIANTES }, (_, e) => presentarExamen(e, red, azar, confirmadas)));
  await red.esperarCopias(); // dejar que lleguen todos los reintentos tardíos
  const duracion = performance.now() - inicio;

  // Lo que el estudiante encontraría al reanudar: la respuesta vigente de cada pregunta.
  const vigentes = await Promise.all([...confirmadas.values()].map((op) => almacen.leer(op.attemptId, op.questionId)));
  const perdidas = [...confirmadas.values()].filter((esperada, i) => vigentes[i]?.operationId !== esperada.operationId).length;
  const log = almacen.registros();
  const duplicados = log.length - new Set(log.map((op) => op.operationId)).size;

  console.table({
    falla: FALLA,
    autoguardados: latencias.length - red.copiasEnviadas(),
    'copias tardías': red.copiasEnviadas(),
    'respuestas perdidas': perdidas,
    'registros duplicados': duplicados,
    'p50 guardar (ms)': percentil(latencias, 50).toFixed(1),
    'p95 guardar (ms)': percentil(latencias, 95).toFixed(1),
    'p99 guardar (ms)': percentil(latencias, 99).toFixed(1),
    'duración total (ms)': duracion.toFixed(0),
  });

  assert.equal(perdidas, 0, `${perdidas} respuestas confirmadas fueron reemplazadas por una más vieja (medida: 0)`);
  assert.equal(duplicados, 0, `${duplicados} registros duplicados en el registro de respuestas (medida: 0)`);
});
