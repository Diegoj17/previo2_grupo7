// Adaptador simulado del proveedor del modelo de lenguaje (ADR-002).
// Devuelve respuestas predefinidas por pregunta. 'NO_RESPONDE' simula un proveedor que nunca contesta.
// Un adaptador real llamaría al proveedor por HTTPS con el mismo contrato: { texto, citas }.
export function crearModeloSimulado(guion) {
  return {
    async responder({ pregunta }) {
      const propuesta = guion.get(pregunta);
      if (propuesta === 'NO_RESPONDE') return new Promise(() => {});
      await new Promise((listo) => setTimeout(listo, 20)); // latencia simulada del proveedor
      return propuesta ?? { texto: 'No tengo información sobre eso.', citas: [] };
    },
  };
}
