import { ROLES, normalizarRol } from "./roles.js";
import { estadoJornada, ESTADOS_JORNADA } from "./estadoJornada.js";

// Lógica pura del módulo de administración (usuarios, filtros, estadísticas, reportes)

export const cuentaActiva = (usuario) => usuario?.activo !== false;

const sinTildes = (t) =>
  String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Filtra y ordena usuarios: texto (nombre o correo), rol ("todos" o un rol) y estado de la cuenta
export function filtrarUsuarios(usuarios, { texto = "", rol = "todos", estado = "todos" } = {}) {
  const q = sinTildes(texto).trim();
  return usuarios
    .filter((u) => {
      if (rol !== "todos" && normalizarRol(u.rol) !== rol) return false;
      if (estado === "activos" && !cuentaActiva(u)) return false;
      if (estado === "inactivos" && cuentaActiva(u)) return false;
      return !q || sinTildes(u.nombre).includes(q) || sinTildes(u.email).includes(q);
    })
    .sort((a, b) => String(a.nombre || a.email).localeCompare(String(b.nombre || b.email), "es"));
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Valida el formulario de usuario. En edición no se pide contraseña ni correo.
export function validarUsuario({ nombre, correo, clave, rol }, { esEdicion = false } = {}) {
  const errores = {};
  const n = String(nombre ?? "").trim();
  if (!n) errores.nombre = "Escribe el nombre.";
  else if (n.length > 100) errores.nombre = "Máximo 100 caracteres.";

  if (!Object.values(ROLES).includes(rol)) errores.rol = "Selecciona un rol.";

  if (!esEdicion) {
    if (!CORREO.test(String(correo ?? "").trim())) errores.correo = "Escribe un correo válido.";
    if (String(clave ?? "").length < 6) errores.clave = "La contraseña debe tener al menos 6 caracteres.";
  }
  if (Object.keys(errores).length > 0) return { errores, datos: null };
  return {
    errores,
    datos: { nombre: n, correo: String(correo ?? "").trim().toLowerCase(), clave, rol },
  };
}

// Reglas de negocio de la cuenta propia: un administrador no puede quitarse el rol ni
// desactivarse a sí mismo (evita quedarse sin acceso al módulo).
export function puedeModificarCuenta(actorUid, usuarioObjetivo) {
  return !!actorUid && !!usuarioObjetivo && actorUid !== usuarioObjetivo.id;
}

// Jornadas por estado y filtros del administrador:
// estado ("todos" | activa | cancelada | finalizada), gestor (uid | "todos"), desde/hasta ("YYYY-MM-DD")
export function filtrarJornadas(jornadas, filtros = {}, ahora = Date.now(), diaDe = (ms) => new Date(ms).toISOString().slice(0, 10)) {
  const { texto = "", estado = "todos", gestor = "todos", desde = null, hasta = null } = filtros;
  const q = sinTildes(texto).trim();
  return jornadas.filter((j) => {
    if (estado !== "todos" && estadoJornada(j, ahora) !== estado) return false;
    if (gestor === "sin-gestor" && j.creadoPor) return false;
    if (gestor !== "todos" && gestor !== "sin-gestor" && j.creadoPor !== gestor) return false;
    if (j.fecha != null) {
      const dia = diaDe(j.fecha);
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
    }
    return !q || sinTildes(j.titulo).includes(q) || sinTildes(j.lugar).includes(q);
  });
}

// Indicadores del panel de control
export function calcularEstadisticas(usuarios, jornadas, ahora = Date.now()) {
  const porRol = { [ROLES.ESTUDIANTE]: 0, [ROLES.GESTOR]: 0, [ROLES.ADMINISTRADOR]: 0 };
  let inactivos = 0;
  for (const u of usuarios) {
    porRol[normalizarRol(u.rol)] += 1;
    if (!cuentaActiva(u)) inactivos += 1;
  }

  const porEstado = {
    [ESTADOS_JORNADA.ACTIVA]: 0,
    [ESTADOS_JORNADA.CANCELADA]: 0,
    [ESTADOS_JORNADA.FINALIZADA]: 0,
  };
  const porEspacio = {};
  const porGestor = {};
  let cuposTotales = 0;
  let cuposOcupados = 0;
  for (const j of jornadas) {
    porEstado[estadoJornada(j, ahora)] += 1;
    if (j.lugar) porEspacio[j.lugar] = (porEspacio[j.lugar] || 0) + 1;
    const g = j.creadoPor || "sin-gestor";
    porGestor[g] = (porGestor[g] || 0) + 1;
    cuposTotales += j.cuposTotales || 0;
    cuposOcupados += j.cuposOcupados || 0;
  }
  return {
    totalUsuarios: usuarios.length,
    estudiantes: porRol[ROLES.ESTUDIANTE],
    gestores: porRol[ROLES.GESTOR],
    administradores: porRol[ROLES.ADMINISTRADOR],
    cuentasInactivas: inactivos,
    totalJornadas: jornadas.length,
    porEstado,
    porEspacio,
    porGestor,
    cuposTotales,
    cuposOcupados,
    ocupacion: cuposTotales > 0 ? Math.round((cuposOcupados / cuposTotales) * 100) : 0,
  };
}
