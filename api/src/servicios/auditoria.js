import { FieldValue } from "firebase-admin/firestore";

// Registro de auditoría (inmutable). Se agrega al mismo lote/transacción que la acción, así que
// si la acción falla no queda un registro falso. `actor`: { uid, nombre }.
export function agregarAuditoria(db, escritor, actor, { accion, entidad, entidadId, detalle }) {
  escritor.set(db.collection("auditoria").doc(), {
    accion,
    entidad,
    entidadId: String(entidadId),
    ...(detalle ? { detalle: String(detalle).slice(0, 500) } : {}),
    actorId: actor.uid,
    actorNombre: actor.nombre || "",
    creadaEn: FieldValue.serverTimestamp(),
  });
}

export const actorDe = (usuario) => ({ uid: usuario.uid, nombre: usuario.nombre || usuario.email || "" });
