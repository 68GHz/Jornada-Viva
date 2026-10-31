import { normalizarJornada, jornadaYaPaso } from "./jornadaFecha.js";
import { jornadaTerminada } from "./duracion.js";
import { ESTADOS_JORNADA, estadoJornada } from "./estadoJornada.js";
import { TIPOS, accionActiva, efectoEnCupos, esAccionDeInscripcion } from "./sincronizacion.js";

// Una jornada solo cuenta como activa si `activa` es exactamente true
// (mismo criterio que usaba la consulta del listado).
export const estaActiva = (jornada) => jornada?.activa === true;

// Visible para el público: activa y aún no empezada (una vez que empieza ya no admite inscripciones)
export const jornadaDisponible = (jornada, ahora = Date.now()) =>
  estaActiva(jornada) && !jornadaYaPaso(jornada.fecha, ahora);

// Activa en Firestore pero que ya terminó (inicio + duración): hay que desactivarla. Mientras
// está en curso sigue activa. Sin fecha no se desactiva (no se puede asegurar que haya terminado).
export const jornadaVencidaActiva = (jornada, ahora = Date.now()) =>
  estaActiva(jornada) && jornada.fecha != null && jornadaTerminada(jornada, ahora);

// Jornadas del usuario a partir de sus inscripciones y las jornadas en vivo.
// - Jornada eliminada: se conserva con los datos guardados en la inscripción
//   y se marca `noDisponible`.
// - Jornada desactivada que aún no vence: se oculta.
// - Jornada que ya terminó (aunque ya esté desactivada): se conserva como `finalizada`
//   para mantener el historial. Una cancelada cuya fecha de inicio ya llegó cuenta como finalizada.
// - Jornada que ya empezó y no ha terminado: `enCurso` (cuenta entre las próximas).
// Orden: próximas y en curso primero (más cercanas arriba), luego las finalizadas.
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
    // Con la jornada en vivo el estado sale de `activa`, el inicio y la duración; si fue eliminada
    // solo queda lo guardado en la inscripción (título y fecha): termina al pasar su duración
    // por defecto.
    const estado = jornada ? estadoJornada(base, ahora) : null;
    // Sin fecha (dato incompleto) siempre se trató como finalizada: se mantiene
    const finalizada =
      base.fecha == null ||
      (jornada ? estado === ESTADOS_JORNADA.FINALIZADA : jornadaTerminada(base, ahora));
    const enCurso = estado === ESTADOS_JORNADA.EN_CURSO;

    if (jornada && !estaActiva(jornada) && !finalizada) continue;
    resultado.push({
      ...base,
      finalizada,
      enCurso,
      // Dato de la inscripción (se guarda en el dispositivo): permite distinguir «inscrito» de «asistió»
      asistio: !!inscripcion.asistio,
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
    // Solo cuentan las acciones sobre la inscripción: otras (p. ej. la asistencia) no cambian ni los
    // cupos ni el estado de inscripción de la jornada
    if (!accionActiva(accion) || !esAccionDeInscripcion(accion.tipo)) continue;
    const previo = mapa.get(accion.jornadaId);
    const delta = efectoEnCupos(accion.tipo);
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

// Jornadas en las que el estudiante guardó su asistencia (escaneo del QR) y aún no se envió
export function jornadasConAsistenciaPendiente(cola) {
  const ids = new Set();
  for (const accion of cola) {
    if (accion.tipo === TIPOS.REGISTRAR_ASISTENCIA && accionActiva(accion)) ids.add(accion.jornadaId);
  }
  return ids;
}

// ---- Historial de participación ---------------------------------------------------------------
// «Inscrita» y «asistió» son cosas distintas: estar inscrito reserva el lugar; asistir queda
// registrado cuando el estudiante o el gestor marcan la asistencia.
export const MODOS_HISTORIAL = { INSCRITAS: "inscritas", ASISTIDAS: "asistidas" };

// Texto y tipo del distintivo de una jornada de «Mis jornadas» (prioridad de arriba hacia abajo).
// `tipo` lo traduce la pantalla a un color.
export function distintivoHistorial(item) {
  if (item.pendiente) {
    return {
      tipo: "pendiente",
      texto: item.pendiente === TIPOS.CANCELAR ? "Cancelación pendiente" : "Pendiente por sincronizar",
    };
  }
  if (item.noDisponible) return { tipo: "noDisponible", texto: "No disponible" };
  if (item.asistio) return { tipo: "asistio", texto: "Asistió" };
  if (item.asistenciaPendiente) return { tipo: "pendiente", texto: "Asistencia pendiente" };
  if (item.finalizada) return { tipo: "noAsistio", texto: "No asistió" };
  if (item.enCurso) return { tipo: "enCurso", texto: "En curso" };
  return { tipo: "inscrito", texto: "Inscrito" };
}

// Las que ve el usuario en cada pestaña: todas sus inscripciones, o solo aquellas a las que asistió
export function filtrarHistorial(jornadas, modo) {
  return modo === MODOS_HISTORIAL.ASISTIDAS ? jornadas.filter((j) => j.asistio === true) : jornadas;
}

// Conteos del historial. Una inscripción cuya cancelación está pendiente ya no cuenta como inscrita.
export function contarHistorial(jornadas) {
  const vigentes = jornadas.filter((j) => j.pendiente !== TIPOS.CANCELAR);
  return { inscritas: vigentes.length, asistidas: vigentes.filter((j) => j.asistio === true).length };
}
