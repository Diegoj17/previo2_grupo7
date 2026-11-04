// Adaptador simulado del almacenamiento durable: vive en memoria y tarda lo que tarda una escritura real.
// Cumple el puerto AlmacenRespuestas. Lo que pasa dentro de una llamada es atómico, como una transacción.
export function crearAlmacenSimulado({ latenciaMs = [2, 8], azar = Math.random } = {}) {
  const vigentes = new Map(); // `${attemptId}|${questionId}` -> operación vigente
  const log = []; // registro de respuestas escritas (auditoría)
  const procesadas = new Set(); // TÁCTICA: claves de idempotencia (operationId), persistidas con la respuesta
  const clave = (attemptId, questionId) => `${attemptId}|${questionId}`;
  const [min, max] = latenciaMs;
  const ida = () => new Promise((listo) => setTimeout(listo, min + azar() * (max - min)));

  return {
    // TÁCTICA (ADR-003): escritura idempotente. La clave se guarda en la misma transacción que la respuesta.
    // En una base real: índice único en operation_id + INSERT ... ON CONFLICT (operation_id) DO NOTHING.
    async guardarIdempotente(op) {
      await ida();
      if (procesadas.has(op.operationId)) return { estado: 'duplicada' };
      procesadas.add(op.operationId);
      log.push(op);
      vigentes.set(clave(op.attemptId, op.questionId), op);
      return { estado: 'guardada' };
    },
    async leer(attemptId, questionId) {
      await ida();
      return vigentes.get(clave(attemptId, questionId));
    },
    registros: () => log,
    clavesIdempotencia: () => procesadas.size,
  };
}
