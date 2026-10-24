import { FieldValue } from "firebase-admin/firestore";
import { ETIQUETA_ROL, ROLES, normalizarRol } from "../dominio/roles.js";
import { validarUsuario } from "../dominio/usuariosAdmin.js";
import { ErrorApi, noEncontrado, sinPermiso, validacion } from "../errores.js";
import { actorDe, agregarAuditoria } from "./auditoria.js";

// Administración de cuentas (solo administrador). Reglas que antes aplicaban firestore.rules y
// la app: un administrador no cambia su propio rol ni su estado (así el sistema nunca se queda
// sin administrador) y cada cambio queda en la auditoría en la misma operación atómica.

// Crea la cuenta de acceso (Firebase Auth) y su perfil con el rol indicado
export async function crear(ctx, admin, cuerpo = {}) {
  const { db, auth } = ctx;
  const { errores, datos } = validarUsuario(cuerpo);
  if (!datos) throw validacion(errores);

  let cuenta;
  try {
    cuenta = await auth.createUser({
      email: datos.correo,
      password: datos.clave,
      displayName: datos.nombre,
    });
  } catch (error) {
    const codigo = String(error?.code || "");
    if (codigo === "auth/email-already-exists") {
      throw new ErrorApi(409, "EMAIL_EN_USO", "Ya existe una cuenta con ese correo.");
    }
    if (codigo === "auth/invalid-email") throw validacion({ correo: "El correo no es válido." });
    if (codigo === "auth/invalid-password") {
      throw validacion({ clave: "La contraseña es demasiado débil (mínimo 6 caracteres)." });
    }
    throw error;
  }

  try {
    const lote = db.batch();
    lote.set(db.collection("users").doc(cuenta.uid), {
      uid: cuenta.uid,
      nombre: datos.nombre,
      email: datos.correo,
      rol: datos.rol,
      activo: true,
      creadoEn: FieldValue.serverTimestamp(),
    });
    agregarAuditoria(db, lote, actorDe(admin), {
      accion: "usuario.crear",
      entidad: "usuario",
      entidadId: cuenta.uid,
      detalle: `${datos.correo} · ${ETIQUETA_ROL[datos.rol]}`,
    });
    await lote.commit();
  } catch (error) {
    // No se deja una cuenta de acceso sin perfil
    await auth.deleteUser(cuenta.uid).catch(() => {});
    throw error;
  }
  return { id: cuenta.uid };
}

// Cambia nombre, rol y/o estado de otra cuenta. Devuelve { cambiado }.
export async function actualizar(ctx, admin, usuarioId, cambios = {}) {
  const { db } = ctx;
  if (usuarioId === admin.uid) {
    throw sinPermiso("No tienes permiso para realizar esta acción.");
  }

  const errores = {};
  if (cambios.nombre !== undefined) {
    const n = String(cambios.nombre ?? "").trim();
    if (!n) errores.nombre = "Escribe el nombre.";
    else if (n.length > 100) errores.nombre = "Máximo 100 caracteres.";
  }
  if (cambios.rol !== undefined && !Object.values(ROLES).includes(cambios.rol)) {
    errores.rol = "Selecciona un rol.";
  }
  if (cambios.activo !== undefined && typeof cambios.activo !== "boolean") {
    errores.activo = "El estado debe ser verdadero o falso.";
  }
  if (Object.keys(errores).length > 0) throw validacion(errores);

  const ref = db.collection("users").doc(usuarioId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw noEncontrado("La cuenta no existe.");
    const usuario = snap.data();

    const campos = {};
    const detalle = [];
    const nombre = cambios.nombre === undefined ? undefined : String(cambios.nombre).trim();
    if (nombre !== undefined && nombre !== usuario.nombre) {
      campos.nombre = nombre;
      detalle.push(`nombre: ${usuario.nombre || "-"} → ${nombre}`);
    }
    // La app comparaba con el rol ya normalizado (el alias "maestro" se mostraba como "gestor")
    const rolActual = normalizarRol(usuario.rol);
    if (cambios.rol !== undefined && cambios.rol !== rolActual) {
      campos.rol = cambios.rol;
      detalle.push(`rol: ${rolActual} → ${cambios.rol}`);
    }
    if (cambios.activo !== undefined && cambios.activo !== (usuario.activo !== false)) {
      campos.activo = cambios.activo;
      detalle.push(cambios.activo ? "cuenta activada" : "cuenta desactivada");
    }
    if (Object.keys(campos).length === 0) return { cambiado: false };

    tx.update(ref, campos);
    agregarAuditoria(db, tx, actorDe(admin), {
      accion: campos.rol ? "usuario.rol" : campos.activo !== undefined ? "usuario.estado" : "usuario.editar",
      entidad: "usuario",
      entidadId: usuarioId,
      detalle: `${usuario.email || usuarioId} · ${detalle.join("; ")}`,
    });
    return { cambiado: true };
  });
}
