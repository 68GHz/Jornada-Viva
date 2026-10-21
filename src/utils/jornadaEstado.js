import { normalizarJornada, jornadaYaPaso } from "./jornadaFecha";
import { TIPOS, accionActiva } from "./sincronizacion";

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
    resultado.push({
      ...base,
      finalizada,
      ...(inscripcion.pendiente ? { pendiente: inscripcion.pendiente } : {}),
    });
  }

  return resultado.sort((a, b) => {
    if (a.finalizada !== b.finalizada) return a.finalizada ? 1 : -1;
    const diff = (a.fecha || 0) - (b.fecha || 0);
    return a.finalizada ? -diff : diff;
  });
}

// Acciones sin sincronizar por jornada: { tipo: la última, delta: efecto neto en cupos }
export function mapaPendientes(cola) {
  const mapa = new Map();
  for (const accion of cola) {
    if (!accionActiva(accion)) continue;
    const previo = mapa.get(accion.jornadaId);
    const delta = accion.tipo === TIPOS.INSCRIBIR ? 1 : -1;
    mapa.set(accion.jornadaId, {
      tipo: accion.tipo,
      delta: (previo?.delta || 0) + delta,
      accion,
    });
  }
  return mapa;
}

// Cupos que ve el usuario: los del servidor más el efecto de sus acciones pendientes
export function ajustarCupos(jornadas, pendientes) {
  if (pendientes.size === 0) return jornadas;
  return jornadas.map((jornada) => {
    const pendiente = pendientes.get(jornada.id);
    if (!pendiente || !pendiente.delta) return jornada;
    return {
      ...jornada,
      cuposOcupados: Math.max(0, (jornada.cuposOcupados || 0) + pendiente.delta),
    };
  });
}

// Inscripciones que ve el usuario: las del servidor más/menos sus acciones pendientes.
// Las canceladas sin sincronizar se conservan marcadas (`pendiente: "CANCELAR"`).
export function aplicarPendientesAInscripciones(inscripciones, pendientes) {
  if (pendientes.size === 0) return inscripciones;

  const resultado = inscripciones.map((inscripcion) => {
    const pendiente = pendientes.get(inscripcion.jornadaId);
    return pendiente?.tipo === TIPOS.CANCELAR
      ? { ...inscripcion, pendiente: TIPOS.CANCELAR }
      : inscripcion;
  });

  const conServidor = new Set(inscripciones.map((i) => i.jornadaId));
  for (const [jornadaId, pendiente] of pendientes) {
    if (pendiente.tipo !== TIPOS.INSCRIBIR || conServidor.has(jornadaId)) continue;
    resultado.push({
      id: `pendiente-${pendiente.accion.id}`,
      jornadaId,
      tituloJornada: pendiente.accion.tituloJornada,
      fechaJornada: pendiente.accion.fechaJornada,
      pendiente: TIPOS.INSCRIBIR,
    });
  }
  return resultado;
}
