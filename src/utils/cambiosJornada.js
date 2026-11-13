// Detección de los cambios de una jornada que se avisan al estudiante inscrito.
// Lógica pura (sin Firebase): la usa el servicio de notificaciones y la prueban los tests.

// Timestamp de Firestore, milisegundos o segundos -> milisegundos (null si no hay)
function aMillis(fecha) {
  if (fecha == null) return null;
  if (typeof fecha.toMillis === "function") return fecha.toMillis();
  if (typeof fecha.seconds === "number") return fecha.seconds * 1000;
  return typeof fecha === "number" ? fecha : null;
}

/**
 * Normaliza y compara los datos de una jornada para determinar si hubo cambios importantes:
 * - Cancelación: 'activa' cambia a false
 * - Reactivación: 'activa' vuelve a true
 * - Reprogramación: 'fecha' cambia
 * - Actualización: 'descripcion', 'lugar', 'titulo', 'responsable', 'entidad' cambian
 *
 * @param {Object} anterior - Datos guardados previamente
 * @param {Object} actual - Datos actuales recibidos de Firestore
 * @param {number} ahora - Instante actual (para distinguir un vencimiento de una cancelación)
 * @returns {Object|null} - Objeto con tipo, titulo y mensaje si hubo cambio relevante, null si no
 */
export function detectarCambioJornada(anterior, actual, ahora = Date.now()) {
  if (!anterior || !actual) return null;

  // 1. Cancelación (una jornada desactivada por haber vencido no es una cancelación)
  if (anterior.activa === true && actual.activa === false) {
    const fechaMs = aMillis(actual.fecha);
    if (fechaMs != null && fechaMs <= ahora) return null;
    return {
      tipo: "cancelacion",
      titulo: `Jornada cancelada: ${actual.titulo || "Jornada"}`,
      mensaje: `La jornada "${actual.titulo}" ha sido cancelada por el organizador.`,
    };
  }

  // 1b. Reactivación
  if (anterior.activa === false && actual.activa === true) {
    return {
      tipo: "reactivacion",
      titulo: `Jornada reactivada: ${actual.titulo || "Jornada"}`,
      mensaje: `La jornada "${actual.titulo}" volvió a estar disponible. Revisa los detalles en la app.`,
    };
  }

  // 2. Reprogramación (cambio de fecha)
  const fechaAnt = anterior.fecha?.seconds || anterior.fecha || null;
  const fechaAct = actual.fecha?.seconds || actual.fecha || null;
  if (fechaAnt && fechaAct && fechaAnt !== fechaAct) {
    return {
      tipo: "reprogramacion",
      titulo: `Jornada reprogramada: ${actual.titulo || "Jornada"}`,
      mensaje: `La fecha y/o hora de "${actual.titulo}" han sido modificadas. Revisa los nuevos datos.`,
    };
  }

  // 3. Actualización general relevante
  const camposRevisar = [
    { campo: "lugar", etiqueta: "el lugar" },
    { campo: "descripcion", etiqueta: "la descripción" },
    { campo: "responsable", etiqueta: "el responsable" },
    { campo: "titulo", etiqueta: "el título" },
    { campo: "entidad", etiqueta: "la entidad" },
  ];

  const cambios = [];
  for (const { campo, etiqueta } of camposRevisar) {
    if (anterior[campo] !== undefined && actual[campo] !== undefined) {
      if (String(anterior[campo]).trim() !== String(actual[campo]).trim()) {
        cambios.push(etiqueta);
      }
    }
  }

  if (cambios.length > 0) {
    return {
      tipo: "actualizacion",
      titulo: `Jornada actualizada: ${actual.titulo || "Jornada"}`,
      mensaje: `Se ha modificado ${cambios.join(", ")} en la jornada "${actual.titulo}".`,
    };
  }

  // Si solo cambiaron cupos u otros datos internos, no notificar
  return null;
}

/**
 * Aviso por una jornada que el organizador eliminó. Se detecta porque la jornada
 * desaparece y el estudiante la tenía registrada como vista.
 */
export function detectarEliminacion(anterior) {
  if (!anterior) return null;
  const titulo = anterior.titulo || "Jornada";
  return {
    tipo: "eliminacion",
    titulo: `Jornada eliminada: ${titulo}`,
    mensaje: `La jornada "${titulo}" fue eliminada por el organizador y ya no está disponible.`,
  };
}
