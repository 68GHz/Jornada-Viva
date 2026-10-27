export const VENTANA_ASISTENCIA_MINUTOS = 20;
export const VENTANA_ASISTENCIA_MS = VENTANA_ASISTENCIA_MINUTOS * 60 * 1000;

/**
 * Evalúa el estado de la ventana de asistencia para una jornada.
 * @param {number} fechaJornadaMs - Fecha/hora de inicio de la jornada en epoch ms.
 * @param {number} ahoraMs - Hora actual (opcional, por defecto Date.now()).
 * @returns {{
 *   disponible: boolean,
 *   estado: 'ANTES' | 'EN_CURSO' | 'EXPIRADA',
 *   minutosRestantes: number,
 *   segundosRestantes: number,
 *   mensaje: string
 * }}
 */
export function estadoVentanaAsistencia(fechaJornadaMs, ahoraMs = Date.now()) {
  if (!fechaJornadaMs) {
    return {
      disponible: false,
      estado: "ANTES",
      minutosRestantes: 0,
      segundosRestantes: 0,
      mensaje: "Fecha de jornada no definida.",
    };
  }

  const finVentanaMs = fechaJornadaMs + VENTANA_ASISTENCIA_MS;

  if (ahoraMs < fechaJornadaMs) {
    const minutosFaltantes = Math.ceil((fechaJornadaMs - ahoraMs) / 60000);
    return {
      disponible: false,
      estado: "ANTES",
      minutosRestantes: minutosFaltantes,
      segundosRestantes: Math.ceil((fechaJornadaMs - ahoraMs) / 1000),
      mensaje: `La toma de asistencia iniciará a la hora programada (en aprox. ${minutosFaltantes} min).`,
    };
  }

  if (ahoraMs > finVentanaMs) {
    return {
      disponible: false,
      estado: "EXPIRADA",
      minutosRestantes: 0,
      segundosRestantes: 0,
      mensaje: "La ventana de 20 minutos para tomar asistencia ha finalizado.",
    };
  }

  const msRestantes = finVentanaMs - ahoraMs;
  const minutosRestantes = Math.floor(msRestantes / 60000);
  const segundosRestantes = Math.floor((msRestantes % 60000) / 1000);

  return {
    disponible: true,
    estado: "EN_CURSO",
    minutosRestantes,
    segundosRestantes,
    mensaje: `Ventana de asistencia abierta: quedan ${minutosRestantes}m ${segundosRestantes}s.`,
  };
}

/**
 * Genera el payload de datos que se incrusta en el código QR.
 */
export function generarPayloadQrAsistencia(jornada) {
  return JSON.stringify({
    tipo: "ASISTENCIA_JORNADA",
    jornadaId: jornada.id,
    titulo: jornada.titulo,
    fecha: jornada.fecha,
    creadoEn: Date.now(),
  });
}

/**
 * Decodifica y valida el contenido de un QR escaneado.
 */
export function parsearPayloadQrAsistencia(datosQr) {
  try {
    const datos = typeof datosQr === "string" ? JSON.parse(datosQr) : datosQr;
    if (datos?.tipo !== "ASISTENCIA_JORNADA" || !datos?.jornadaId) {
      return { valido: false, error: "El código QR no corresponde a una asistencia válida de Jornada Viva." };
    }
    return { valido: true, datos };
  } catch (_e) {
    return { valido: false, error: "Formato de código QR inválido." };
  }
}
