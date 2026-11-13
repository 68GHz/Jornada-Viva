import { FieldValue } from "firebase-admin/firestore";
import { ROLES } from "../dominio/roles.js";
import { validacion } from "../errores.js";

// Perfil del usuario que acaba de registrarse. Quien se registra SIEMPRE es estudiante: el rol de
// gestor o administrador solo lo asigna un administrador (nunca viene en la solicitud).
// Es idempotente: si el perfil ya existe no se toca (nadie cambia su rol por aquí).
export async function crearPerfil(ctx, usuario, cuerpo = {}) {
  const { db } = ctx;
  const nombre = String(cuerpo.nombre ?? "").trim();
  if (!nombre) throw validacion({ nombre: "Escribe tu nombre." });
  if (nombre.length > 100) throw validacion({ nombre: "Máximo 100 caracteres." });

  const ref = db.collection("users").doc(usuario.uid);
  const creado = await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.set(ref, {
      uid: usuario.uid,
      nombre,
      email: usuario.email,
      rol: ROLES.ESTUDIANTE,
      creadoEn: FieldValue.serverTimestamp(),
    });
    return true;
  });
  return { creado };
}

export function miPerfil(usuario) {
  const { perfil } = usuario;
  return {
    uid: usuario.uid,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    activo: perfil?.activo !== false,
  };
}
