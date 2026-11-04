// Políticas publicadas por evento (datos de ejemplo para el ADR-002).
// Los campos estructurados (duración, apertura, navegación) salen de la configuración del examen
// y se responden sin modelo. Los fragmentos son el texto libre que escribe el docente: eso es lo que busca el RAG.
export const EVENTOS = {
  'CALC1-2026-II': {
    nombre: 'Parcial conjunto de Cálculo I',
    apertura: '08:00',
    duracionMin: 90,
    navegacion: 'libre',
    versionPolitica: 3,
    fragmentos: [
      { id: 'CALC-00', version: 2, texto: 'Se permite calculadora científica no programable.' }, // versión anterior, ya no vigente
      { id: 'CALC-01', version: 3, texto: 'No se permite el uso de calculadora de ningún tipo durante el parcial de Cálculo I. Las operaciones se pueden hacer a mano.' },
      { id: 'CALC-02', version: 3, texto: 'Se permite una hoja de fórmulas tamaño carta, escrita a mano por el estudiante.' },
      { id: 'CALC-03', version: 3, texto: 'Si se pierde la conexión o la energía, el intento se conserva y se reanuda con las respuestas confirmadas. El tiempo oficial no se detiene. Las prórrogas solo las autoriza la coordinación académica, previa solicitud con evidencia.' },
      { id: 'CALC-04', version: 3, texto: 'Los resultados se publican después del cierre del periodo de reclamos, que dura 3 días hábiles contados desde la aplicación.' },
    ],
  },
  'FIS1-2026-II': {
    nombre: 'Parcial conjunto de Física I',
    apertura: '10:00',
    duracionMin: 90,
    navegacion: 'secuencial',
    versionPolitica: 1,
    fragmentos: [
      { id: 'FIS-01', version: 1, texto: 'Se permite calculadora científica no programable. No se permiten celulares ni calculadoras gráficas.' },
      { id: 'FIS-02', version: 1, texto: 'Si se pierde la conexión a internet o la energía, el intento del examen se conserva con las respuestas confirmadas y se reanuda dentro del tiempo restante. Las prórrogas solo las autoriza la coordinación académica.' },
      { id: 'FIS-03', version: 1, texto: 'No se permite hoja de fórmulas; las constantes físicas necesarias aparecen en cada pregunta.' },
    ],
  },
};
