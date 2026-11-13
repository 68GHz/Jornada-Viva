// Roles de la app. El rol vive en `users/{uid}.rol` y solo lo cambia un administrador
// (o scripts/admin.js): las reglas de Firestore impiden que un usuario se lo cambie.
// Sin rol guardado se considera estudiante.
//
//   estudiante     Usuario/Alumno: consulta jornadas, se inscribe, etc.
//   gestor         Gestor de jornadas (antes "maestro"): administra las jornadas asignadas
//   administrador  Módulo de administración: usuarios, gestores, jornadas, reportes
export const ROLES = {
  ESTUDIANTE: "estudiante",
  GESTOR: "gestor",
  ADMINISTRADOR: "administrador",
};

export const ETIQUETA_ROL = {
  [ROLES.ESTUDIANTE]: "Usuario/Alumno",
  [ROLES.GESTOR]: "Gestor de jornadas",
  [ROLES.ADMINISTRADOR]: "Administrador",
};

// "maestro" es el nombre anterior de "gestor": se sigue aceptando hasta migrar los datos
export const normalizarRol = (valor) => {
  if (valor === ROLES.ADMINISTRADOR) return ROLES.ADMINISTRADOR;
  if (valor === ROLES.GESTOR || valor === "maestro") return ROLES.GESTOR;
  return ROLES.ESTUDIANTE;
};

export const esGestor = (rol) => normalizarRol(rol) === ROLES.GESTOR;
export const esAdministrador = (rol) => normalizarRol(rol) === ROLES.ADMINISTRADOR;
export const esEstudiante = (rol) => normalizarRol(rol) === ROLES.ESTUDIANTE;

// Una jornada está asignada al gestor que figura en `creadoPor`. Las jornadas anteriores
// a los roles no tienen propietario: solo un administrador puede gestionarlas.
export const esPropietario = (jornada, uid) =>
  !!uid && !!jornada && jornada.creadoPor === uid;

// El administrador gestiona cualquier jornada; el gestor, solo las asignadas a él
export const puedeAdministrarJornada = (rol, uid, jornada) =>
  !!jornada &&
  (esAdministrador(rol) || (esGestor(rol) && esPropietario(jornada, uid)));

// Roles que pueden tener jornadas asignadas
export const puedeSerResponsable = (rol) => esGestor(rol) || esAdministrador(rol);
