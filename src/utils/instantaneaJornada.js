// "Instantánea" de una jornada: los datos de la jornada que el estudiante ya conoce.
// Sirve de punto de comparación para avisarle de lo que cambie después (cancelación,
// reactivación, reprogramación, actualización o eliminación).
//
// Se guarda en Firestore (users/{uid}.jornadasVistas) para que sobreviva a cerrar
// sesión, cambiar de dispositivo o tener la app cerrada cuando el maestro hace el cambio.
export const CAMPOS_INSTANTANEA = [
  "activa",
  "fecha",
  "titulo",
  "lugar",
  "descripcion",
  "responsable",
  "entidad",
];

// `datos` son los de Firestore (la fecha es un Timestamp: se guarda en segundos)
export function instantaneaDeJornada(datos) {
  return {
    activa: datos.activa !== undefined ? datos.activa : true,
    fecha: datos.fecha?.seconds || datos.fecha || null,
    titulo: datos.titulo || "",
    lugar: datos.lugar || "",
    descripcion: datos.descripcion || "",
    responsable: datos.responsable || "",
    entidad: datos.entidad || "",
  };
}

export const mismaInstantanea = (a, b) =>
  !!a && !!b && CAMPOS_INSTANTANEA.every((campo) => a[campo] === b[campo]);
