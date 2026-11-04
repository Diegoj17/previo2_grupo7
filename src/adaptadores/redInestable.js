// Mecanismo para reproducir la falla: la red entre el navegador del estudiante y la API.
//   falla = 'ninguna'        cada autoguardado llega una vez y en orden.
//   falla = 'red-inestable'  con probabilidad `prob`, el autoguardado llega DOS veces: la copia es el
//                            reintento del navegador cuyo original sí llegó, y aparece `retrasoMs` después,
//                            cuando el estudiante ya pudo cambiar su respuesta (conexión doméstica inestable).
export function crearRed(enviarAApi, { falla = 'ninguna', prob = 0.2, retrasoMs = [5, 60], azar = Math.random } = {}) {
  if (!['ninguna', 'red-inestable'].includes(falla)) throw new Error(`falla desconocida: ${falla}`);
  const tardias = [];
  const [min, max] = retrasoMs;

  return {
    async enviar(peticion) {
      if (falla === 'red-inestable' && azar() < prob) {
        const copia = structuredClone(peticion);
        const espera = min + azar() * (max - min);
        tardias.push(new Promise((listo) => setTimeout(listo, espera)).then(() => enviarAApi(copia)));
      }
      return enviarAApi(peticion);
    },
    copiasEnviadas: () => tardias.length,
    esperarCopias: () => Promise.all(tardias),
  };
}
