import { esEspacioValido } from "./espacios.js";

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
// milisegundos epoch (la app la arma con la hora de negocio UTC-5).
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

  const cuposTotales = c.cuposTotales;
  if (!Number.isSafeInteger(cuposTotales) || cuposTotales < 1) {
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
