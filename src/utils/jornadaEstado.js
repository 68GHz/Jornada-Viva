import { normalizarJornada, jornadaYaPaso } from "./jornadaFecha";

// Una jornada solo cuenta como activa si `activa` es exactamente true
// (mismo criterio que usaba la consulta del listado).
export const estaActiva = (jornada) => jornada?.activa === true;

// Visible para el público: activa y aún no vencida
export const jornadaDisponible = (jornada, ahora = Date.now()) =>
  estaActiva(jornada) && !jornadaYaPaso(jornada.fecha, ahora);

// Activa en Firestore pero con fecha ya pasada: hay que desactivarla.
// Sin fecha no se desactiva (no se puede asegurar que haya vencido).
export const jornadaVencidaActiva = (jornada, ahora = Date.now()) =>
  estaActiva(jornada) && jornada.fecha != null && jornadaYaPaso(jornada.fecha, ahora);

// Jornadas del usuario a partir de sus inscripciones y las jornadas en vivo.
// - Jornada eliminada: se conserva con los datos guardados en la inscripción
//   y se marca `noDisponible`.
// - Jornada desactivada que aún no vence: se oculta.
// - Jornada vencida (aunque ya esté desactivada): se conserva como `finalizada`
//   para mantener el historial.
// Orden: próximas primero (más cercanas arriba), luego las finalizadas.
export function construirMisJornadas(inscripciones, jornadasPorId, ahora = Date.now()) {
  // Una inscripción por jornada (se ignoran duplicados)
  const porJornada = new Map(inscripciones.map((i) => [i.jornadaId, i]));
  const resultado = [];

  for (const [jornadaId, inscripcion] of porJornada) {
    const jornada = jornadasPorId.get(jornadaId);
    const base =
      jornada ?? {
        ...normalizarJornada(jornadaId, {
          titulo: inscripcion.tituloJornada,
          fecha: inscripcion.fechaJornada,
        }),
        noDisponible: true,
      };
    const finalizada = jornadaYaPaso(base.fecha, ahora);

    if (jornada && !estaActiva(jornada) && !finalizada) continue;
    resultado.push({ ...base, finalizada });
  }

  return resultado.sort((a, b) => {
    if (a.finalizada !== b.finalizada) return a.finalizada ? 1 : -1;
    const diff = (a.fecha || 0) - (b.fecha || 0);
    return a.finalizada ? -diff : diff;
  });
}
