// Roles de la app. El rol vive en `users/{uid}.rol` y solo se puede asignar fuera de
// la app (consola de Firebase o scripts/admin.js): las reglas de Firestore impiden
// que un usuario se lo cambie. Sin rol guardado se considera estudiante.
export const ROLES = {
  ESTUDIANTE: "estudiante",
  MAESTRO: "maestro",
};

export const normalizarRol = (valor) =>
  valor === ROLES.MAESTRO ? ROLES.MAESTRO : ROLES.ESTUDIANTE;

export const esMaestro = (rol) => normalizarRol(rol) === ROLES.MAESTRO;

// Una jornada es del maestro que la creó (`creadoPor`). Las jornadas anteriores a los
// roles no tienen propietario y ningún maestro puede administrarlas.
export const esPropietario = (jornada, uid) =>
  !!uid && !!jornada && jornada.creadoPor === uid;

export const puedeAdministrarJornada = (rol, uid, jornada) =>
  esMaestro(rol) && esPropietario(jornada, uid);
