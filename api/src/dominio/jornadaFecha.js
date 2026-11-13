import dayjs from "dayjs";
import { duracionJornadaMin } from "./duracion.js";
import { OFFSET_NEGOCIO_MIN } from "./zonaNegocio.js";

// Convierte lo que venga de Firestore a milisegundos epoch. Acepta:
//  - Timestamp de Firestore (formato actual)
//  - Date o número (ya convertidos)
//  - cadena de fecha + `hora` "HH:mm" (formato anterior, interpretado en UTC-5)
// Devuelve null si el valor falta o es inválido. (Mismo comportamiento que la app móvil.)
export function fechaAMillis(fecha, horaLegado) {
  if (fecha == null) return null;

  if (typeof fecha.toMillis === "function") {
    const ms = fecha.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (fecha instanceof Date) {
    const ms = fecha.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof fecha === "number") {
    return Number.isFinite(fecha) ? fecha : null;
  }

  // Formato anterior: `fecha` sin hora y `hora` aparte
  const dia = dayjs(fecha);
  if (!dia.isValid()) return null;
  const coincidencia = /^(\d{1,2}):(\d{2})/.exec(horaLegado || "");
  const horas = coincidencia ? parseInt(coincidencia[1], 10) : 23;
  const minutos = coincidencia ? parseInt(coincidencia[2], 10) : 59;
  return (
    Date.UTC(dia.year(), dia.month(), dia.date(), horas, minutos) -
    OFFSET_NEGOCIO_MIN * 60000
  );
}

export function jornadaYaPaso(millis, ahora = Date.now()) {
  return millis == null || millis <= ahora;
}

// Documento de Firestore -> jornada de la API (`fecha` en ms, sin `hora`). Las jornadas que
// todavía no tienen `duracionMin` salen con la duración por defecto.
export function normalizarJornada(id, datos) {
  const { hora, fecha, ...resto } = datos;
  return { id, ...resto, fecha: fechaAMillis(fecha, hora), duracionMin: duracionJornadaMin(datos) };
}
