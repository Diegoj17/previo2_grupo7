// Puerto de salida AlmacenRespuestas: lo que el caso de uso necesita del almacenamiento durable,
// en palabras del dominio. Cualquier adaptador (una base real o el simulado de la prueba) debe cumplirlo.
/**
 * @typedef {{ operationId: string, attemptId: string, questionId: string, sequence: number, opcion: string }} Operacion
 * @typedef {object} AlmacenRespuestas
 * @property {(op: Operacion) => Promise<{ estado: 'guardada' | 'duplicada' }>} guardarIdempotente
 *   escribe de forma durable SOLO si el operationId no se procesó antes; si ya se procesó, no escribe y
 *   responde 'duplicada'. La comprobación y la escritura son atómicas (ADR-003).
 * @property {(attemptId: string, questionId: string) => Promise<Operacion | undefined>} leer  respuesta vigente
 * @property {() => Operacion[]} registros  registro de respuestas escritas (auditoría)
 */
export const METODOS_ALMACEN = ['guardarIdempotente', 'leer', 'registros'];

export function exigirPuerto(adaptador) {
  for (const metodo of METODOS_ALMACEN) {
    if (typeof adaptador?.[metodo] !== 'function') {
      throw new Error(`El adaptador no cumple el puerto AlmacenRespuestas: falta ${metodo}()`);
    }
  }
  return adaptador;
}
