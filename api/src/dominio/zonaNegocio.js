// Zona horaria de negocio de las jornadas: UTC-5 (-300 min).
// Los Timestamp de Firestore son instantes absolutos; esta constante define cómo se
// interpretan y se muestran, sin depender de la zona del dispositivo.
export const OFFSET_NEGOCIO_MIN = -300;

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// "YYYY-MM-DD" + "HH:mm" (hora de negocio) -> milisegundos epoch, o null si no son válidos
export function combinarFechaHora(dia, hora) {
  const d = DIA.exec(String(dia || ""));
  const h = HORA.exec(String(hora || "").trim());
  if (!d || !h) return null;
  const [anio, mes, diaMes] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, diaMes));
  // Rechaza fechas inexistentes (31 de febrero, etc.)
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== diaMes
  ) {
    return null;
  }
  return Date.UTC(anio, mes - 1, diaMes, Number(h[1]), Number(h[2])) - OFFSET_NEGOCIO_MIN * 60000;
}

const dos = (n) => String(n).padStart(2, "0");

// Milisegundos epoch -> { dia: "YYYY-MM-DD", hora: "HH:mm" } en la zona de negocio
export function descomponerFecha(millis) {
  if (millis == null || !Number.isFinite(millis)) return { dia: "", hora: "" };
  const f = new Date(millis + OFFSET_NEGOCIO_MIN * 60000);
  return {
    dia: `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`,
    hora: `${dos(f.getUTCHours())}:${dos(f.getUTCMinutes())}`,
  };
}

// "DD/MM/YYYY HH:mm" en la zona de negocio (para la planilla)
export function formatearFechaHoraNegocio(millis) {
  if (millis == null || !Number.isFinite(millis)) return "";
  const { dia, hora } = descomponerFecha(millis);
  const [anio, mes, diaMes] = dia.split("-");
  return `${diaMes}/${mes}/${anio} ${hora}`;
}
