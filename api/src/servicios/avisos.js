import { FieldValue } from "firebase-admin/firestore";
import { detectarCambioJornada, detectarEliminacion } from "../dominio/cambiosJornada.js";
import { instantaneaDeJornada, mismaInstantanea } from "../dominio/instantaneaJornada.js";

// Avisos de cambios de una jornada a los estudiantes inscritos (antes los detectaba el móvil de
// cada alumno). Se aplica EXACTAMENTE el mismo procedimiento: se compara el estado que el alumno
// ya conocía (`users/{uid}.jornadasVistas[jornadaId]`) con el estado actual de la jornada.
//   - hay cambio relevante  -> se crea la notificación y se actualiza el estado conocido
//   - sin aviso pero distinto -> solo se actualiza el estado conocido
//   - jornada eliminada     -> aviso de eliminación y se olvida el estado conocido
// Si el alumno no tenía estado anotado (inscripciones anteriores a esta función) no se avisa,
// igual que antes: solo se anota el estado actual.
const USUARIOS_POR_LOTE = 200; // cada uno usa 2 operaciones (límite de Firestore: 500)

const idAviso = (uid, jornadaId, tipo) =>
  `${uid}_${jornadaId}_${tipo}_${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

export async function inscritosDe(db, jornadaId) {
  const snap = await db.collection("inscripciones").where("jornadaId", "==", jornadaId).get();
  return [...new Set(snap.docs.map((d) => d.data().userId).filter(Boolean))];
}

// `datosActuales`: datos de Firestore de la jornada tras el cambio, o null si fue eliminada.
// Devuelve cuántas notificaciones se crearon.
export async function notificarCambioJornada(ctx, jornadaId, datosActuales) {
  const { db, ahora } = ctx;
  const uids = await inscritosDe(db, jornadaId);
  if (uids.length === 0) return 0;

  const perfiles = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
  const instantanea = datosActuales ? instantaneaDeJornada(datosActuales) : null;
  const pendientes = [];

  perfiles.forEach((perfil, i) => {
    const uid = uids[i];
    const anterior = perfil.exists ? perfil.data().jornadasVistas?.[jornadaId] : undefined;

    if (!datosActuales) {
      const cambio = detectarEliminacion(anterior);
      if (!cambio) return;
      pendientes.push({
        uid,
        cambio,
        datosJornada: { titulo: anterior.titulo || "", lugar: anterior.lugar || "", fecha: null },
        vistas: FieldValue.delete(),
      });
      return;
    }

    const cambio = anterior ? detectarCambioJornada(anterior, datosActuales, ahora()) : null;
    if (!cambio && mismaInstantanea(anterior, instantanea)) return;
    pendientes.push({
      uid,
      cambio,
      datosJornada: {
        titulo: datosActuales.titulo || "",
        lugar: datosActuales.lugar || "",
        fecha: datosActuales.fecha || null,
      },
      vistas: instantanea,
    });
  });

  let creadas = 0;
  for (let i = 0; i < pendientes.length; i += USUARIOS_POR_LOTE) {
    const lote = db.batch();
    for (const { uid, cambio, datosJornada, vistas } of pendientes.slice(i, i + USUARIOS_POR_LOTE)) {
      if (cambio) {
        lote.set(db.collection("notificaciones").doc(idAviso(uid, jornadaId, cambio.tipo)), {
          userId: uid,
          jornadaId,
          tipo: cambio.tipo,
          titulo: cambio.titulo,
          mensaje: cambio.mensaje,
          leida: false,
          creadaEn: FieldValue.serverTimestamp(),
          datosJornada,
        });
        creadas += 1;
      }
      lote.set(db.collection("users").doc(uid), { jornadasVistas: { [jornadaId]: vistas } }, { merge: true });
    }
    await lote.commit();
  }
  return creadas;
}

// Los avisos no deben impedir un cambio ya guardado: si fallan se registra y la acción sigue.
export async function notificarSinFallar(ctx, jornadaId, datosActuales) {
  try {
    return await notificarCambioJornada(ctx, jornadaId, datosActuales);
  } catch (error) {
    (ctx.registro || console).error(`[avisos] no se pudieron crear los avisos de ${jornadaId}:`, error);
    return 0;
  }
}
