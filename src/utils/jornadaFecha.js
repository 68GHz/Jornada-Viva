import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/es";
// Zona horaria de negocio de las jornadas (UTC-5): definida en zonaNegocio.js
import { OFFSET_NEGOCIO_MIN } from "./zonaNegocio";

dayjs.extend(utc);

export { OFFSET_NEGOCIO_MIN };

// Convierte lo que venga de Firestore a milisegundos epoch (serializable en
// los params de navegación). Acepta:
//  - Timestamp de Firestore (formato actual)
//  - Date o número (ya convertidos)
//  - cadena de fecha + `hora` "HH:mm" (formato anterior, interpretado en UTC-5)
// Devuelve null si el valor falta o es inválido.
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

// Documento de Firestore -> jornada para la UI (`fecha` en ms, sin `hora`)
export function normalizarJornada(id, datos) {
  const { hora, fecha, ...resto } = datos;
  return { id, ...resto, fecha: fechaAMillis(fecha, hora) };
}

// Instante (ms) -> dayjs en la zona de negocio. null si no es válido.
export function aDayjsNegocio(millis) {
  if (millis == null) return null;
  const d = dayjs.utc(millis).utcOffset(OFFSET_NEGOCIO_MIN);
  return d.isValid() ? d : null;
}

export function formatearFecha(millis, formato) {
  const d = aDayjsNegocio(millis);
  return d ? d.locale("es").format(formato) : "Fecha por confirmar";
}

export function formatearHora(millis) {
  const d = aDayjsNegocio(millis);
  return d ? d.locale("es").format("h:mm A") : "Hora por confirmar";
}

export function jornadaYaPaso(millis, ahora = Date.now()) {
  return millis == null || millis <= ahora;
}

const hoyNegocio = () => aDayjsNegocio(Date.now()).startOf("day");

export const DIAS_LIMITE_CANCELACION = 2;

// Se puede cancelar hasta DIAS_LIMITE_CANCELACION días antes de la jornada
export function puedeCancelarInscripcion(millis) {
  const d = aDayjsNegocio(millis);
  if (!d) return false;
  return d.startOf("day").diff(hoyNegocio(), "day") >= DIAS_LIMITE_CANCELACION;
}

// Filtro de fecha usado en las listas:
// "todas" | "hoy" | "semana" | "mes" | "rango" (desde/hasta: "YYYY-MM-DD")
export function coincideFiltroFecha(millis, filtro, desde, hasta) {
  if (filtro === "todas") return true;
  const d = aDayjsNegocio(millis);
  if (!d) return false;
  if (filtro === "rango") {
    if (!desde) return true;
    const dia = d.format("YYYY-MM-DD");
    return dia >= desde && dia <= (hasta || desde);
  }
  const hoy = hoyNegocio();
  const dia = d.startOf("day");
  if (filtro === "hoy") return dia.isSame(hoy, "day");
  if (filtro === "semana") {
    const dias = dia.diff(hoy, "day");
    return dias >= 0 && dias <= 7;
  }
  if (filtro === "mes") return dia.isSame(hoy, "month");
  return true;
}

export function formatearDiasFaltan(millis) {
  const d = aDayjsNegocio(millis);
  if (!d) return "Fecha por confirmar";
  const dias = d.startOf("day").diff(hoyNegocio(), "day");
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}
