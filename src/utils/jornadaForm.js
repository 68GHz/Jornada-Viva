import { DURACION_POR_DEFECTO, LIMITES_DURACION } from "./duracion.js";
import { esEspacioValido } from "./espacios.js";
import { MENSAJE_BANNER, esUrlDeBanner } from "./bannerJornada.js";
import { combinarFechaHora } from "./zonaNegocio.js";

// Límites que también valida firestore.rules
export const LIMITES = {
  titulo: 120,
  descripcion: 2000,
  entidad: 120,
  responsable: 120,
  cuposMaximos: 1000,
};

// Duración que propone el formulario al crear una jornada
export const DURACION_SUGERIDA = String(DURACION_POR_DEFECTO);

export const ENTIDAD_POR_DEFECTO = "Institución Universitaria Tecnológico de Antioquia";

const texto = (v) => String(v ?? "").trim();

// Clave de idempotencia para un intento de «crear jornada». El formulario genera una y la repite
// al reintentar sin cambiar nada; si el usuario modifica algo, se genera otra. Así un error de
// conexión (cuando el servidor sí guardó la jornada) no produce un duplicado al reintentar.
export const nuevaClaveCreacion = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

// Campos con los que se reconoce que una jornada ya guardada es la que el formulario intenta
// crear (la duración no entra: una jornada guardada por una versión anterior de la API no la tiene)
const CAMPOS_DE_IGUALDAD = ["titulo", "descripcion", "entidad", "responsable", "lugar", "fecha", "cuposTotales"];

// `jornada`: la guardada (con `fecha` en milisegundos); `datos`: los que devolvió validarJornada
export const esMismaJornada = (jornada, datos) =>
  !!jornada && !!datos && CAMPOS_DE_IGUALDAD.every((campo) => jornada[campo] === datos[campo]);

// Valida el formulario de crear/editar jornada con la fecha del dispositivo.
// `campos` son los textos del formulario; `contexto`:
//   - cuposOcupados: inscritos actuales (los cupos no pueden quedar por debajo)
//   - exigirFutura: la fecha debe ser posterior a `ahora` (jornadas activas)
// Devuelve { errores: { campo: mensaje }, datos } con `datos` en null si hay errores.
export function validarJornada(campos, { ahora = Date.now(), cuposOcupados = 0, exigirFutura = true } = {}) {
  const errores = {};

  const titulo = texto(campos.titulo);
  const descripcion = texto(campos.descripcion);
  const entidad = texto(campos.entidad);
  const responsable = texto(campos.responsable);
  const lugar = texto(campos.lugar);

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

  const fecha = combinarFechaHora(texto(campos.dia), texto(campos.hora));
  if (!campos.dia) errores.dia = "Elige la fecha.";
  else if (!texto(campos.hora)) errores.hora = "Escribe la hora (HH:mm, formato 24 h).";
  else if (fecha == null) errores.hora = "Fecha u hora no válidas. La hora va como HH:mm (24 h).";
  else if (exigirFutura && fecha <= ahora) errores.dia = "La fecha y la hora deben ser posteriores a este momento.";

  const textoDuracion = texto(campos.duracionMin);
  const duracionMin = Number(textoDuracion);
  if (!/^\d+$/.test(textoDuracion) || !Number.isSafeInteger(duracionMin)) {
    errores.duracionMin = "La duración debe ser un número entero de minutos.";
  } else if (duracionMin < LIMITES_DURACION.minimo) {
    errores.duracionMin = `La duración mínima es de ${LIMITES_DURACION.minimo} minutos.`;
  } else if (duracionMin > LIMITES_DURACION.maximo) {
    errores.duracionMin = `La duración máxima es de ${LIMITES_DURACION.maximo} minutos (24 horas).`;
  }

  const textoCupos = texto(campos.cuposTotales);
  const cuposTotales = Number(textoCupos);
  if (!/^\d+$/.test(textoCupos) || !Number.isSafeInteger(cuposTotales) || cuposTotales < 1) {
    errores.cuposTotales = "Los cupos deben ser un número entero mayor que 0.";
  } else if (cuposTotales > LIMITES.cuposMaximos) {
    errores.cuposTotales = `Máximo ${LIMITES.cuposMaximos} cupos.`;
  } else if (cuposTotales < cuposOcupados) {
    errores.cuposTotales = `Ya hay ${cuposOcupados} inscritos: los cupos no pueden ser menos.`;
  }

  // Banner opcional (enlace https a una imagen). Sin el campo en el formulario no se envía nada;
  // con texto vacío se envía "" y el servidor quita el banner que tuviera la jornada.
  // Solo se admite texto: un número, un objeto o un arreglo no es un enlace (null = no válido)
  const bannerUrl =
    campos.bannerUrl === undefined ? undefined : typeof campos.bannerUrl === "string" ? campos.bannerUrl.trim() : null;
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
