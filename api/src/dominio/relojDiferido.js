// Política de reloj de las acciones hechas SIN conexión y enviadas después (asistencia, D5).
//
// La hora del teléfono no es confiable. Una acción diferida lleva la hora en que ocurrió
// (`escaneadoEn`, `marcadaEn`); el servidor:
//  - usa la MENOR entre esa hora y la suya (una hora adelantada no sirve de nada),
//  - rechaza las acciones más antiguas que un máximo (24 h por defecto): atrasar el reloj del
//    teléfono solo gana, como mucho, ese margen y solo estando sin conexión.
// Sin hora de origen (acción hecha con conexión) se usa la del servidor.
export const ANTIGUEDAD_MAX_ASISTENCIA_MS = 24 * 60 * 60 * 1000;

// Margen de reloj entre el teléfono y el servidor al comparar la hora del escaneo con la vigencia del
// código del QR (los relojes de dos aparatos nunca coinciden al segundo). Ensancha por igual los dos
// lados de la vigencia de 60 s.
export const TOLERANCIA_RELOJ_MS = 2 * 60 * 1000;

export const MENSAJE_ACCION_ANTIGUA =
  "Esta acción se hizo hace demasiado tiempo para poder validarla. Descártala y vuelve a registrarla si aún corresponde.";

// Devuelve { ok: true, instante, diferida } o { ok: false, codigo, mensaje }
export function resolverInstante({ hechaEn, ahora, antiguedadMaxMs = ANTIGUEDAD_MAX_ASISTENCIA_MS }) {
  if (hechaEn == null) return { ok: true, instante: ahora, diferida: false };
  if (ahora - hechaEn > antiguedadMaxMs) {
    return { ok: false, codigo: "ACCION_DEMASIADO_ANTIGUA", mensaje: MENSAJE_ACCION_ANTIGUA };
  }
  return { ok: true, instante: Math.min(hechaEn, ahora), diferida: true };
}

// ¿Es una hora de origen bien formada? (milisegundos epoch, positivo)
export const esHoraDeOrigenValida = (valor) => Number.isFinite(valor) && valor > 0;
