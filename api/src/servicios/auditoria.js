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

const LIMITE_MAXIMO = 200;

// Últimos registros de auditoría (más recientes primero). Solo los lee el administrador.
export async function listar(ctx, limite) {
  const n = Math.min(Math.max(parseInt(limite, 10) || 100, 1), LIMITE_MAXIMO);
  const snap = await ctx.db.collection("auditoria").orderBy("creadaEn", "desc").limit(n).get();
  return {
    registros: snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        accion: x.accion,
        entidad: x.entidad,
        entidadId: x.entidadId,
        detalle: x.detalle || "",
        actorId: x.actorId,
        actorNombre: x.actorNombre || "",
        creadaEn: typeof x.creadaEn?.toMillis === "function" ? x.creadaEn.toMillis() : null,
      };
    }),
  };
}
