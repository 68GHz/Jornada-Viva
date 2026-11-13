// Duración de una jornada. Es la que decide cuándo termina: una jornada está "en curso" desde
// su hora de inicio hasta `fecha + duración`, y recién entonces pasa a finalizada.
//
// Las jornadas creadas antes de existir este campo no lo tienen: para ellas se usa
// DURACION_POR_DEFECTO (el script `node scripts/admin.js migrar --aplicar` lo guarda en cada una).
export const DURACION_POR_DEFECTO = 60;

// Límites en minutos; también los valida firestore.rules
export const LIMITES_DURACION = { minimo: 10, maximo: 1440 };

const MINUTO_MS = 60 * 1000;

export const esDuracionValida = (valor) =>
  Number.isSafeInteger(valor) && valor >= LIMITES_DURACION.minimo && valor <= LIMITES_DURACION.maximo;

// Minutos que dura la jornada (la guardada o, si no tiene o no es válida, la de por defecto)
export const duracionJornadaMin = (jornada) =>
  esDuracionValida(jornada?.duracionMin) ? jornada.duracionMin : DURACION_POR_DEFECTO;

// Instante (ms) en que termina la jornada; null si no tiene fecha
export const finJornadaMs = (jornada) =>
  jornada?.fecha == null ? null : jornada.fecha + duracionJornadaMin(jornada) * MINUTO_MS;

// Ya terminó: pasó la hora de inicio más la duración
export const jornadaTerminada = (jornada, ahora = Date.now()) => {
  const fin = finJornadaMs(jornada);
  return fin != null && fin <= ahora;
};

// 45 -> "45 min", 60 -> "1 h", 90 -> "1 h 30 min"
export function formatearDuracion(minutos) {
  const total = Number(minutos);
  if (!Number.isFinite(total) || total <= 0) return "";
  const horas = Math.floor(total / 60);
  const resto = Math.round(total % 60);
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
