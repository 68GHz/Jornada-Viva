import dayjs from "dayjs";

export function combinarFechaHora(fecha, hora) {
  const base = dayjs(fecha);
  if (!base.isValid()) return null;

  const coincidencia = /^(\d{1,2}):(\d{2})/.exec(hora || "");
  if (!coincidencia) return base.endOf("day");

  const horas = parseInt(coincidencia[1], 10);
  const minutos = parseInt(coincidencia[2], 10);
  return base.hour(horas).minute(minutos).second(0).millisecond(0);
}

export function formatearDiasFaltan(fechaHora) {
  const dias = fechaHora.startOf("day").diff(dayjs().startOf("day"), "day");
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}
