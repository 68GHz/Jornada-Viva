// Qué notificaciones del servidor todavía no se han mostrado como aviso del dispositivo.
//
// Con la API, las notificaciones las crea el servidor; la app solo las muestra como aviso local
// (banner del sistema) cuando llegan. `yaAvisadas` son los ID ya mostrados en este dispositivo:
//  - null (sesión nueva: al cerrar sesión se borran los datos locales): se avisan las no leídas
//    de las últimas 24 h, para que un cambio ocurrido con la sesión cerrada se vea al volver
//  - después: se avisan las no leídas que no estaban, de la más antigua a la más reciente
const MAXIMO_RECORDADAS = 300;
export const VENTANA_PRIMERA_VEZ_MS = 24 * 60 * 60 * 1000;

export function seleccionarParaAvisar(lista, yaAvisadas, ahora = Date.now()) {
  const sinHistorial = yaAvisadas === null || yaAvisadas === undefined;
  const conocidas = new Set(sinHistorial ? [] : yaAvisadas);
  const nuevas = lista
    .filter((n) => !n.leida && !conocidas.has(n.id))
    .filter((n) => !sinHistorial || (n.creadaEn || 0) >= ahora - VENTANA_PRIMERA_VEZ_MS)
    .sort((a, b) => (a.creadaEn || 0) - (b.creadaEn || 0));
  // Quedan registradas todas las que existen: así no se avisan más tarde
  const ids = sinHistorial ? lista.map((n) => n.id) : [...yaAvisadas, ...nuevas.map((n) => n.id)];
  return { nuevas, avisadas: ids.slice(-MAXIMO_RECORDADAS) };
}
