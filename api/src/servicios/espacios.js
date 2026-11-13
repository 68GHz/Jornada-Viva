import { Timestamp } from "firebase-admin/firestore";
import { LIMITES_DURACION, finJornadaMs } from "../dominio/duracion.js";
import { ESPACIOS } from "../dominio/espacios.js";
import { espaciosOcupados, sugerirEspaciosAlternos } from "../dominio/espaciosLibres.js";
import { normalizarJornada } from "../dominio/jornadaFecha.js";
import { noEncontrado, validacion } from "../errores.js";

// FE-01 · Disponibilidad de espacios. Solo informa (no impide programar dos jornadas en el mismo
// espacio). Antes lo calculaba cada app con las jornadas guardadas en el dispositivo; ahora el
// servidor lo calcula con TODAS las jornadas, así que no depende de lo que el dispositivo haya
// descargado. La app conserva su cálculo local como respaldo sin conexión.

// Jornadas que pueden solaparse con [inicio, fin): empiezan antes de `fin` y no más de la duración
// máxima antes de `inicio` (una jornada dura como máximo 24 h).
async function jornadasCercanas(db, inicio, fin) {
  const desde = inicio - LIMITES_DURACION.maximo * 60000;
  const snap = await db
    .collection("jornadas")
    .where("fecha", ">=", Timestamp.fromMillis(desde))
    .where("fecha", "<", Timestamp.fromMillis(fin))
    .get();
  return snap.docs.map((d) => normalizarJornada(d.id, d.data()));
}

const aResumen = (j) => ({ id: j.id, titulo: j.titulo, fecha: j.fecha, lugar: j.lugar });

const aNumero = (valor) => (valor === undefined || valor === "" ? NaN : Number(valor));

// Qué espacios están ocupados en [inicio, fin) (ms). `excluirId` omite una jornada (la que se edita).
export async function disponibilidad(ctx, _usuario, consulta = {}) {
  const inicio = aNumero(consulta.inicio);
  const fin = aNumero(consulta.fin);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) {
    throw validacion({ inicio: "Indica una franja válida: inicio y fin en milisegundos, con fin > inicio." });
  }
  if (fin - inicio > LIMITES_DURACION.maximo * 60000) {
    throw validacion({ fin: "La franja no puede superar la duración máxima de una jornada." });
  }
  const { db, ahora } = ctx;
  const cercanas = await jornadasCercanas(db, inicio, fin);
  const mapa = espaciosOcupados(cercanas, inicio, fin, {
    excluirId: consulta.excluirId || null,
    ahora: ahora(),
  });
  return {
    ocupados: Object.fromEntries([...mapa].map(([espacio, js]) => [espacio, js.map(aResumen)])),
    libres: ESPACIOS.filter((espacio) => !mapa.has(espacio)),
  };
}

// Sugerencia de espacios alternos para una jornada (cancelada, o cuyo espacio comparte otra jornada)
export async function alternos(ctx, _usuario, jornadaId) {
  const { db, ahora } = ctx;
  const snap = await db.collection("jornadas").doc(jornadaId).get();
  if (!snap.exists) throw noEncontrado("La jornada no existe.");
  const jornada = normalizarJornada(snap.id, snap.data());
  if (jornada.fecha == null) return { sugerencia: null };
  const cercanas = await jornadasCercanas(db, jornada.fecha, finJornadaMs(jornada));
  const sugerencia = sugerirEspaciosAlternos(jornada, cercanas, ahora());
  return {
    sugerencia: sugerencia && { ...sugerencia, ocupantes: sugerencia.ocupantes.map(aResumen) },
  };
}
