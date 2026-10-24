import { FieldValue } from "firebase-admin/firestore";
import { noEncontrado, sinPermiso, validacion } from "../errores.js";

// Las notificaciones las crea el servidor (ver avisos.js); aquí el usuario solo puede marcar
// como leídas o eliminar las SUYAS (mismas reglas que firestore.rules).
async function propia(db, usuario, id) {
  const ref = db.collection("notificaciones").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw noEncontrado("La notificación no existe.");
  if (snap.data().userId !== usuario.uid) throw sinPermiso();
  return ref;
}

export async function marcarLeida(ctx, usuario, id) {
  const ref = await propia(ctx.db, usuario, id);
  await ref.update({ leida: true, leidaEn: FieldValue.serverTimestamp() });
}

// Marca como leídas todas las del usuario (o solo las indicadas en `ids`). Devuelve cuántas.
export async function marcarTodasLeidas(ctx, usuario, ids) {
  const { db } = ctx;
  if (ids !== undefined && (!Array.isArray(ids) || ids.some((i) => typeof i !== "string"))) {
    throw validacion({ ids: "Debe ser una lista de identificadores." });
  }

  const refs = [];
  if (ids) {
    for (const id of new Set(ids)) refs.push(await propia(db, usuario, id));
  } else {
    const snap = await db
      .collection("notificaciones")
      .where("userId", "==", usuario.uid)
      .where("leida", "==", false)
      .get();
    snap.docs.forEach((d) => refs.push(d.ref));
  }

  for (let i = 0; i < refs.length; i += 400) {
    const lote = db.batch();
    refs
      .slice(i, i + 400)
      .forEach((ref) => lote.update(ref, { leida: true, leidaEn: FieldValue.serverTimestamp() }));
    await lote.commit();
  }
  return refs.length;
}

export async function eliminar(ctx, usuario, id) {
  const ref = await propia(ctx.db, usuario, id);
  await ref.delete();
}

// Token de notificaciones push del dispositivo (guardado en el perfil)
export async function registrarPushToken(ctx, usuario, cuerpo = {}) {
  const token = String(cuerpo.token ?? "").trim();
  if (!token || token.length > 300) throw validacion({ token: "El token no es válido." });
  const ref = ctx.db.collection("users").doc(usuario.uid);
  if (!(await ref.get()).exists) throw noEncontrado("El perfil del usuario no existe.");
  await ref.update({ pushToken: token, pushTokenActualizadoEn: FieldValue.serverTimestamp() });
}
