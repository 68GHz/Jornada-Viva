import { DURACION_POR_DEFECTO, LIMITES_DURACION } from "./duracion.js";
import { esEspacioValido } from "./espacios.js";
import { MENSAJE_BANNER, esUrlDeBanner } from "./bannerJornada.js";

// Límites que también validaba firestore.rules (se mantienen idénticos)
export const LIMITES = {
  titulo: 120,
  descripcion: 2000,
  entidad: 120,
  responsable: 120,
  cuposMaximos: 1000,
};

const texto = (v) => String(v ?? "").trim();

// Valida los datos de una jornada (crear/editar) con las mismas reglas y mensajes que el
// formulario de la app (validarJornada) y que firestore.rules. La fecha llega ya combinada, en
// milisegundos epoch (la app la arma con la hora de negocio UTC-5). `duracionMin` (minutos) es
// opcional para que sigan funcionando las versiones de la app anteriores a ese campo: si no llega
// se usa la duración por defecto. `bannerUrl` (enlace https a una imagen) también es opcional:
// sin el campo no se toca el banner que ya tenía la jornada; con texto vacío se quita; con un
// enlace válido se fija.
//   - ahora:        reloj del servidor
//   - cuposOcupados: inscritos actuales (los cupos no pueden quedar por debajo)
//   - exigirFutura: la fecha debe ser posterior a `ahora` (jornadas activas)
// Devuelve { errores: { campo: mensaje }, datos } con `datos` en null si hay errores.
export function validarDatosJornada(campos, { ahora, cuposOcupados = 0, exigirFutura = true }) {
  const errores = {};
  const c = campos && typeof campos === "object" ? campos : {};

  const titulo = texto(c.titulo);
  const descripcion = texto(c.descripcion);
  const entidad = texto(c.entidad);
  const responsable = texto(c.responsable);
  const lugar = texto(c.lugar);

  if (!titulo) errores.titulo = "Escribe el título de la jornada.";
  else if (titulo.length > LIMITES.titulo) errores.titulo = `Máximo ${LIMITES.titulo} caracteres.`;

  if (!descripcion) errores.descripcion = "Escribe una descripción.";
  else if (descripcion.length > LIMITES.descripcion) {
    errores.descripcion = `Máximo ${LIMITES.descripcion} caracteres.`;
  }

  if (!entidad) errores.entidad = "Indica la entidad organizadora.";
  else if (entidad.length > LIMITES.entidad) errores.entidad = `Máximo ${LIMITES.entidad} caracteres.`;

  if (!responsable) errores.responsable = "Indica el responsable.";
  else if (responsable.length > LIMITES.responsable) {
    errores.responsable = `Máximo ${LIMITES.responsable} caracteres.`;
  }

  if (!esEspacioValido(lugar)) errores.lugar = "Selecciona un espacio de la lista.";

  const fecha = c.fecha;
  if (typeof fecha !== "number" || !Number.isFinite(fecha)) {
    errores.fecha = "Fecha u hora no válidas. La hora va como HH:mm (24 h).";
  } else if (exigirFutura && fecha <= ahora) {
    errores.fecha = "La fecha y la hora deben ser posteriores a este momento.";
  }

  const duracionMin = c.duracionMin === undefined ? DURACION_POR_DEFECTO : c.duracionMin;
  if (!Number.isSafeInteger(duracionMin)) {
    errores.duracionMin = "La duración debe ser un número entero de minutos.";
  } else if (duracionMin < LIMITES_DURACION.minimo) {
    errores.duracionMin = `La duración mínima es de ${LIMITES_DURACION.minimo} minutos.`;
  } else if (duracionMin > LIMITES_DURACION.maximo) {
    errores.duracionMin = `La duración máxima es de ${LIMITES_DURACION.maximo} minutos (24 horas).`;
  }

  const cuposTotales = c.cuposTotales;
  if (!Number.isSafeInteger(cuposTotales) || cuposTotales < 1) {
    errores.cuposTotales = "Los cupos deben ser un número entero mayor que 0.";
  } else if (cuposTotales > LIMITES.cuposMaximos) {
    errores.cuposTotales = `Máximo ${LIMITES.cuposMaximos} cupos.`;
  } else if (cuposTotales < cuposOcupados) {
    errores.cuposTotales = `Ya hay ${cuposOcupados} inscritos: los cupos no pueden ser menos.`;
  }

  // Solo se admite texto: un número, un objeto o un arreglo no es un enlace (null = no válido)
  const bannerUrl =
    c.bannerUrl === undefined ? undefined : typeof c.bannerUrl === "string" ? c.bannerUrl.trim() : null;
  if (bannerUrl === null || (bannerUrl && !esUrlDeBanner(bannerUrl))) errores.bannerUrl = MENSAJE_BANNER;

  if (Object.keys(errores).length > 0) return { errores, datos: null };
  return {
    errores,
    datos: {
      titulo, descripcion, entidad, responsable, lugar, fecha, duracionMin, cuposTotales,
      ...(bannerUrl !== undefined ? { bannerUrl } : {}),
    },
  };
}
