// Caso de uso: guardar la respuesta que el estudiante acaba de marcar (paso 4 del flujo).
// Solo conoce el puerto AlmacenRespuestas; no sabe qué base de datos hay detrás.
import { exigirPuerto } from '../puertos/almacenRespuestas.js';

export class ErrorValidacion extends Error {
  name = 'ErrorValidacion';
}

function validar(op) {
  for (const campo of ['operationId', 'attemptId', 'questionId', 'opcion']) {
    if (typeof op?.[campo] !== 'string' || op[campo] === '') throw new ErrorValidacion(`falta ${campo}`);
  }
  if (!Number.isInteger(op.sequence) || op.sequence < 1) throw new ErrorValidacion('sequence debe ser un entero >= 1');
}

export function crearGuardarRespuesta(almacen) {
  exigirPuerto(almacen);
  return async function guardarRespuesta(op) {
    validar(op);
    // Se confirma solo después de la escritura durable (ADR-001).
    return almacen.guardar(op);
  };
}
