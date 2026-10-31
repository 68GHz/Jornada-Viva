// FE-01 · Espacios alternos disponibles.
// Dada una franja horaria, calcula qué espacios ya tienen una jornada y cuáles están libres.
// Es lógica pura (sin red ni Firebase): se calcula con las jornadas que la app ya tiene guardadas
// en el dispositivo, así que funciona también sin conexión (con los datos ya descargados).
// Solo informa: no impide programar dos jornadas en el mismo espacio.
import { ESPACIOS } from "./espacios.js";
import { finJornadaMs } from "./duracion.js";
import { ESTADOS_JORNADA, estadoJornada } from "./estadoJornada.js";

// Dos franjas [inicio, fin) se solapan si cada una empieza antes de que termine la otra.
// El borde exacto no cuenta: si una termina a las 10:00 y la otra empieza a las 10:00, no chocan.
export const seSolapan = (inicioA, finA, inicioB, finB) => inicioA < finB && inicioB < finA;

const franjaValida = (inicio, fin) => Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio;

// Solo ocupan el espacio las jornadas activas o en curso. Las canceladas y las finalizadas
// (según estadoJornada) no lo ocupan.
const OCUPAN = new Set([ESTADOS_JORNADA.ACTIVA, ESTADOS_JORNADA.EN_CURSO]);

// Mapa espacio -> jornadas (con `lugar`, `fecha` en ms y opcionalmente `duracionMin`) que lo ocupan
// durante [inicio, fin). `excluirId` omite una jornada (la que se está viendo o editando).
export function espaciosOcupados(jornadas, inicio, fin, { excluirId = null, ahora = Date.now() } = {}) {
  const ocupados = new Map();
  if (!franjaValida(inicio, fin)) return ocupados;

  for (const j of jornadas || []) {
    if (!j || j.id === excluirId || !j.lugar || j.fecha == null) continue;
    if (!OCUPAN.has(estadoJornada(j, ahora))) continue;
    if (!seSolapan(inicio, fin, j.fecha, finJornadaMs(j))) continue;
    ocupados.set(j.lugar, [...(ocupados.get(j.lugar) || []), j]);
  }
  return ocupados;
}

// Espacios de la lista oficial que no tienen ninguna jornada en [inicio, fin), en el mismo orden
// de ESPACIOS. Con una franja que no se puede calcular (sin fecha, fin <= inicio) no hay
// información de ocupación: se devuelven todos.
export function espaciosLibres(jornadas, inicio, fin, opciones) {
  const ocupados = espaciosOcupados(jornadas, inicio, fin, opciones);
  return ESPACIOS.filter((espacio) => !ocupados.has(espacio));
}

// Qué mostrar en el detalle de una jornada que todavía no empieza. Devuelve null si no hay nada
// que sugerir; si no, { motivo, ocupantes, libres }:
//  - motivo "cancelada": la jornada fue cancelada; `libres` son los demás espacios libres a su hora
//  - motivo "ocupado":   su espacio también lo usa otra jornada a esa hora (`ocupantes`)
// `libres` nunca incluye el espacio de la propia jornada (son los espacios *alternos*).
export function sugerirEspaciosAlternos(jornada, jornadas, ahora = Date.now()) {
  if (!jornada || jornada.fecha == null) return null;

  const estado = estadoJornada(jornada, ahora);
  if (estado !== ESTADOS_JORNADA.ACTIVA && estado !== ESTADOS_JORNADA.CANCELADA) return null;

  const ocupados = espaciosOcupados(jornadas, jornada.fecha, finJornadaMs(jornada), {
    excluirId: jornada.id,
    ahora,
  });
  const ocupantes = ocupados.get(jornada.lugar) || [];
  const cancelada = estado === ESTADOS_JORNADA.CANCELADA;
  if (!cancelada && ocupantes.length === 0) return null;

  return {
    motivo: cancelada ? "cancelada" : "ocupado",
    ocupantes,
    libres: ESPACIOS.filter((espacio) => espacio !== jornada.lugar && !ocupados.has(espacio)),
  };
}

// "Bloque 1, Bloque 2, Bloque 3, Bloque 4, Bloque 5 y 11 más" (para no desbordar la pantalla)
export function listaCorta(elementos, maximo = 5) {
  const lista = Array.isArray(elementos) ? elementos : [];
  if (lista.length <= maximo) return lista.join(", ");
  const resto = lista.length - maximo;
  return `${lista.slice(0, maximo).join(", ")} y ${resto} más`;
}
