// Asistente de políticas del evento (ADR-002): RAG + guardrails, con plan B sin modelo.
// El modelo solo PROPONE un texto con citas; este código decide si sale al estudiante.
import { EVENTOS } from './politicas.js';

export const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const VACIAS = new Set(['puedo', 'puede', 'para', 'como', 'cual', 'cuando', 'esta', 'este', 'tengo']);
const palabras = (t) => (normalizar(t).match(/[a-z]{4,}/g) ?? []).filter((p) => !VACIAS.has(p));
const numeros = (t) => t.match(/\d+(?:[.,:]\d+)?/g) ?? [];
const UMBRAL = 0.25; // fracción mínima de palabras de la pregunta presentes en el fragmento
const PROMESAS = /queda autorizad|te (concedo|otorgo|doy)|se te (concede|otorga|dan)/;

// 1. Primera alternativa: un if. Lo que está en la configuración del examen no necesita modelo.
const INTENCIONES = [
  [/cuanto dura|duracion|cuantos minutos/, (ev) => `El examen dura ${ev.duracionMin} minutos.`],
  [/a que hora|hora (empieza|inicia|abre)/, (ev) => `El examen abre a las ${ev.apertura}.`],
  [/volver|regresar|anterior/, (ev) => (ev.navegacion === 'libre'
    ? 'Sí, puedes volver a preguntas anteriores mientras el tiempo no termine.'
    : 'No, la navegación es secuencial: no puedes volver a preguntas anteriores.')],
];

// 2. Recuperación. Guardrail de entrada: solo fragmentos del evento y de la versión vigente.
function recuperar(ev, pregunta, conFiltro) {
  const q = palabras(pregunta);
  return ev.fragmentos
    .filter((f) => !conFiltro || f.version === ev.versionPolitica)
    .map((f) => ({ ...f, puntaje: q.filter((p) => normalizar(f.texto).includes(p)).length / (q.length || 1) }))
    .filter((f) => f.puntaje >= UMBRAL)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 2);
}

// 3. Guardrail de salida: lo que el modelo quiere decir pasa por el código antes de salir.
export function validarSalida(p, fragmentos) {
  if (!p || typeof p.texto !== 'string' || !Array.isArray(p.citas)) return 'formato inválido';
  const ids = new Set(fragmentos.map((f) => f.id));
  if (p.citas.length === 0 || p.citas.some((c) => !ids.has(c))) return 'sin citas o con citas que no se le entregaron';
  const respaldo = new Set(fragmentos.filter((f) => p.citas.includes(f.id)).flatMap((f) => numeros(f.texto)));
  const inventados = numeros(p.texto).filter((n) => !respaldo.has(n));
  if (inventados.length > 0) return `números sin respaldo en la política: ${inventados.join(', ')}`;
  if (PROMESAS.test(normalizar(p.texto))) return 'promete una acción que solo decide coordinación';
  return null;
}

function planB(ev, fragmentos, motivo) {
  const literal = fragmentos.map((f) => `«${f.texto}» (${f.id})`).join(' ');
  const texto = fragmentos.length > 0
    ? `No pude generar una respuesta verificada. Esto dice la política de ${ev.nombre}: ${literal} Si tu caso no está cubierto, escribe a la coordinación académica.`
    : `No encontré ese tema en la política de ${ev.nombre}. Escribe a la coordinación académica con el botón "Reportar incidencia".`;
  return { tipo: 'plan-b', motivo, texto };
}

const conTimeout = (promesa, ms) => {
  let t;
  const limite = new Promise((_, rechazar) => { t = setTimeout(() => rechazar(new Error(`el modelo no respondió en ${ms} ms`)), ms); });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(t));
};

export async function responder({ eventoId, pregunta }, { modelo, timeoutMs = 3000, guardrails = true, traza = () => {} }) {
  const ev = EVENTOS[eventoId];
  if (!ev) return { tipo: 'error', texto: 'Evento no encontrado.' };
  for (const [patron, sinModelo] of INTENCIONES) {
    if (patron.test(normalizar(pregunta))) return { tipo: 'sin-modelo', texto: sinModelo(ev) };
  }
  const fragmentos = recuperar(ev, pregunta, guardrails);
  if (fragmentos.length === 0) return planB(ev, [], 'ningún fragmento supera el umbral');
  let propuesta;
  try {
    propuesta = await conTimeout(modelo.responder({ pregunta, fragmentos }), timeoutMs);
  } catch (error) {
    traza({ eventoId, decision: 'plan-b', motivo: error.message });
    return planB(ev, fragmentos, error.message);
  }
  const motivo = guardrails ? validarSalida(propuesta, fragmentos) : null;
  traza({ eventoId, citas: propuesta?.citas, decision: motivo ? 'bloqueada' : 'respondida', motivo });
  if (motivo) return planB(ev, fragmentos, motivo);
  const fuente = fragmentos.filter((f) => propuesta.citas.includes(f.id)).map((f) => f.texto);
  return { tipo: 'respuesta', texto: propuesta.texto, citas: propuesta.citas, fuente };
}
