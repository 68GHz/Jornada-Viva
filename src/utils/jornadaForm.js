import { esEspacioValido } from "./espacios.js";
import { combinarFechaHora } from "./zonaNegocio.js";

// Límites que también valida firestore.rules
export const LIMITES = {
  titulo: 120,
  descripcion: 2000,
  entidad: 120,
  responsable: 120,
  cuposMaximos: 1000,
};

export const ENTIDAD_POR_DEFECTO = "Institución Universitaria Tecnológico de Antioquia";

const texto = (v) => String(v ?? "").trim();

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

  const textoCupos = texto(campos.cuposTotales);
  const cuposTotales = Number(textoCupos);
  if (!/^\d+$/.test(textoCupos) || !Number.isSafeInteger(cuposTotales) || cuposTotales < 1) {
    errores.cuposTotales = "Los cupos deben ser un número entero mayor que 0.";
  } else if (cuposTotales > LIMITES.cuposMaximos) {
    errores.cuposTotales = `Máximo ${LIMITES.cuposMaximos} cupos.`;
  } else if (cuposTotales < cuposOcupados) {
    errores.cuposTotales = `Ya hay ${cuposOcupados} inscritos: los cupos no pueden ser menos.`;
  }

  if (Object.keys(errores).length > 0) return { errores, datos: null };
  return {
    errores,
    datos: { titulo, descripcion, entidad, responsable, lugar, fecha, cuposTotales },
  };
}
