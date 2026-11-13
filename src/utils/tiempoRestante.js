// Tiempo que falta, en palabras cortas y legibles (en vez de "36707 min"):
//   0 → "menos de 1 min" · 45 → "45 min" · 60 → "1 h" · 135 → "2 h 15 min"
//   1500 → "1 d 1 h" · 36707 → "25 d 11 h"
// Con días se muestran días y horas (los minutos ya no importan); con horas, horas y minutos.
export function formatearTiempoRestante(minutos) {
  const total = Math.floor(Number(minutos));
  if (!Number.isFinite(total) || total < 1) return "menos de 1 min";

  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const min = total % 60;

  if (dias > 0) return horas > 0 ? `${dias} d ${horas} h` : `${dias} d`;
  if (horas > 0) return min > 0 ? `${horas} h ${min} min` : `${horas} h`;
  return `${min} min`;
}
