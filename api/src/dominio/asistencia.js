import { DURACION_POR_DEFECTO, duracionJornadaMin } from "./duracion.js";

// Ventana en la que el estudiante puede registrar su propia asistencia con el QR: los primeros
// 20 minutos de la jornada, o toda la jornada si dura menos. El gestor y el administrador no
// tienen este límite: pueden marcar o corregir la asistencia en cualquier momento desde que
// empieza.
export const VENTANA_ASISTENCIA_MINUTOS = 20;
export const VENTANA_ASISTENCIA_MS = VENTANA_ASISTENCIA_MINUTOS * 60 * 1000;

// El código del QR lo firma el servidor y caduca pronto: la pantalla del gestor lo renueva
// antes de que venza, así una captura del QR no sirve a quien no está en la jornada.
export const CODIGO_QR_VIGENCIA_MS = 60 * 1000;
export const CODIGO_QR_RENOVAR_MS = 30 * 1000;

// Minutos que dura la ventana de asistencia de una jornada
export const ventanaAsistenciaMin = (duracionMin = DURACION_POR_DEFECTO) =>
  Math.min(VENTANA_ASISTENCIA_MINUTOS, duracionJornadaMin({ duracionMin }));

/**
 * Evalúa el estado de la ventana de asistencia para una jornada.
 * @param {number} fechaJornadaMs - Fecha/hora de inicio de la jornada en epoch ms.
 * @param {number} ahoraMs - Hora actual (opcional, por defecto Date.now()).
 * @param {number} duracionMin - Duración de la jornada en minutos (por defecto, la estándar).
 * @returns {{
 *   disponible: boolean,
 *   estado: 'ANTES' | 'EN_CURSO' | 'EXPIRADA',
 *   minutosRestantes: number,
 *   segundosRestantes: number,
 *   mensaje: string
 * }}
 */
export function estadoVentanaAsistencia(fechaJornadaMs, ahoraMs = Date.now(), duracionMin = DURACION_POR_DEFECTO) {
  if (!fechaJornadaMs) {
    return {
      disponible: false,
      estado: "ANTES",
      minutosRestantes: 0,
      segundosRestantes: 0,
      mensaje: "Fecha de jornada no definida.",
    };
  }

  const minutosVentana = ventanaAsistenciaMin(duracionMin);
  const finVentanaMs = fechaJornadaMs + minutosVentana * 60 * 1000;

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
      mensaje: `La ventana de ${minutosVentana} minutos para tomar asistencia ha finalizado.`,
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
 * Genera el contenido del código QR: la jornada y el código firmado por el servidor.
 */
export function generarPayloadQrAsistencia(jornada, codigo) {
  return JSON.stringify({
    tipo: "ASISTENCIA_JORNADA",
    jornadaId: jornada.id,
    titulo: jornada.titulo,
    codigo,
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
    if (typeof datos.codigo !== "string" || !datos.codigo) {
      return {
        valido: false,
        error: "Este código QR es antiguo o está incompleto. Pide al gestor que muestre el código actual.",
      };
    }
    return { valido: true, datos };
  } catch (_e) {
    return { valido: false, error: "Formato de código QR inválido." };
  }
}
