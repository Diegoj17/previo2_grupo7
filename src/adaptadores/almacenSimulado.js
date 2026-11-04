// Adaptador simulado del almacenamiento durable: vive en memoria y tarda lo que tarda una escritura real.
// Cumple el puerto AlmacenRespuestas. Lo que pasa dentro de una llamada es atómico, como una transacción.
export function crearAlmacenSimulado({ latenciaMs = [2, 8], azar = Math.random } = {}) {
  const vigentes = new Map(); // `${attemptId}|${questionId}` -> operación vigente
  const log = []; // registro de respuestas escritas (auditoría)
  const clave = (attemptId, questionId) => `${attemptId}|${questionId}`;
  const [min, max] = latenciaMs;
  const ida = () => new Promise((listo) => setTimeout(listo, min + azar() * (max - min)));

  return {
    async guardar(op) {
      await ida();
      // La última escritura gana, sin importar si es más vieja que la que ya estaba.
      log.push(op);
      vigentes.set(clave(op.attemptId, op.questionId), op);
      return { estado: 'guardada' };
    },
    async leer(attemptId, questionId) {
      await ida();
      return vigentes.get(clave(attemptId, questionId));
    },
    registros: () => log,
  };
}
