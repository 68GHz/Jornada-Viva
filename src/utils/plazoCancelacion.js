// Plazo para cancelar una inscripción. Lógica pura: la misma copia valida en la app (antes de
// enviar) y en la API (la que decide), y una prueba comprueba que ambas son idénticas.
//
// Regla: se puede cancelar hasta DIAS_LIMITE_CANCELACION días ANTES de la jornada, contando días
// calendario en la zona de negocio (UTC-5): con la jornada el día 20, se puede cancelar hasta el
// día 18 inclusive (a cualquier hora) y no desde el 19.
//
// Política de reloj (la hora del teléfono no es confiable):
//  - cancelación hecha CON conexión: el servidor usa su propia hora (el cliente no envía nada).
//  - cancelación hecha SIN conexión y sincronizada después: el cliente envía la hora en que el
//    usuario cancelló (`canceladaEn`). El servidor usa la MENOR entre esa hora y la suya (una hora
//    adelantada no sirve de nada) y rechaza cancelaciones más antiguas que ANTIGUEDAD_MAX (así
//    atrasar el reloj del teléfono solo gana, como mucho, ese margen y solo estando sin conexión).
import { OFFSET_NEGOCIO_MIN } from "./zonaNegocio.js";

export const DIAS_LIMITE_CANCELACION = 2;

// Antigüedad máxima de una cancelación diferida. La API la puede cambiar con
// CANCELACION_ANTIGUEDAD_MAX_HORAS.
export const ANTIGUEDAD_MAX_CANCELACION_MS = 7 * 24 * 60 * 60 * 1000;

export const MENSAJE_PLAZO_VENCIDO = `Solo puedes cancelar hasta ${DIAS_LIMITE_CANCELACION} días antes de la jornada.`;
export const MENSAJE_CANCELACION_ANTIGUA =
  "Esta cancelación se registró hace demasiado tiempo para poder validarla. Descártala y vuelve a solicitarla si aún estás dentro del plazo.";

const DIA_MS = 24 * 60 * 60 * 1000;

// Número del día calendario (de negocio) al que pertenece un instante
const diaDeNegocio = (ms) => Math.floor((ms + OFFSET_NEGOCIO_MIN * 60000) / DIA_MS);

// ¿Se puede cancelar, a las `instanteMs`, una jornada que empieza en `fechaJornadaMs`?
export function puedeCancelarEn(fechaJornadaMs, instanteMs) {
  if (!Number.isFinite(fechaJornadaMs) || !Number.isFinite(instanteMs)) return false;
  return diaDeNegocio(fechaJornadaMs) - diaDeNegocio(instanteMs) >= DIAS_LIMITE_CANCELACION;
}

// Decide si una cancelación es válida.
//   fechaJornada     inicio de la jornada (ms); null si no se conoce (no se puede evaluar: se acepta)
//   canceladaEn      hora (ms) en que el usuario canceló SIN conexión; undefined/null = hora del servidor
//   ahora            hora del servidor (ms)
//   antiguedadMaxMs  máximo de antigüedad de `canceladaEn`
// Devuelve { ok: true, instante } o { ok: false, codigo, mensaje }.
export function evaluarCancelacion({
  fechaJornada,
  canceladaEn,
  ahora,
  antiguedadMaxMs = ANTIGUEDAD_MAX_CANCELACION_MS,
}) {
  let instante = ahora;
  if (canceladaEn != null) {
    if (ahora - canceladaEn > antiguedadMaxMs) {
      return { ok: false, codigo: "ACCION_DEMASIADO_ANTIGUA", mensaje: MENSAJE_CANCELACION_ANTIGUA };
    }
    instante = Math.min(canceladaEn, ahora);
  }
  if (fechaJornada == null) return { ok: true, instante };
  if (!puedeCancelarEn(fechaJornada, instante)) {
    return { ok: false, codigo: "PLAZO_VENCIDO", mensaje: MENSAJE_PLAZO_VENCIDO };
  }
  return { ok: true, instante };
}
