// Adaptador de entrada: traduce la petición del navegador (POST /intentos/:id/respuestas) al caso de uso.
// La capa HTTP real (rutas, autenticación) no interviene en el escenario y no se implementa.
export function crearControladorRespuestas(guardarRespuesta) {
  return async function manejar(peticion) {
    try {
      const resultado = await guardarRespuesta(peticion.body);
      return { status: 200, body: resultado };
    } catch (error) {
      if (error.name === 'ErrorValidacion') return { status: 400, body: { error: error.message } };
      // Sin escritura durable no hay confirmación: el navegador conserva la operación y la reintenta.
      return { status: 503, body: { estado: 'pendiente', error: error.message } };
    }
  };
}
