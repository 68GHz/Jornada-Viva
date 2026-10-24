import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { fechaAMillis } from "../dominio/jornadaFecha.js";
import { instantaneaDeJornada } from "../dominio/instantaneaJornada.js";
import { negocio, validacion } from "../errores.js";

// Inscribirse y cancelar la inscripción. Mismo comportamiento que tenía la app móvil:
//  - ID determinista `${uid}_${jornadaId}` (más búsqueda por campos para las inscripciones
//    antiguas con ID aleatorio): nunca hay dos inscripciones del mismo usuario en una jornada
//  - idempotentes: repetir la acción devuelve "ya-inscrito" / "ya-cancelada" sin tocar cupos
//  - la inscripción anota en `users/{uid}.jornadasVistas` el estado de la jornada (base de los avisos)
//  - todo ocurre en una transacción de Firestore
export const idInscripcion = (uid, jornadaId) => `${uid}_${jornadaId}`;

const texto = (v, max) => String(v ?? "").trim().slice(0, max);

export async function inscribir(ctx, usuario, jornadaId, cuerpo = {}) {
  const { db, ahora } = ctx;
  const jornadaRef = db.collection("jornadas").doc(jornadaId);
  const inscripcionRef = db.collection("inscripciones").doc(idInscripcion(usuario.uid, jornadaId));
  const usuarioRef = db.collection("users").doc(usuario.uid);

  if (cuerpo.tituloJornada !== undefined && typeof cuerpo.tituloJornada !== "string") {
    throw validacion({ tituloJornada: "El título debe ser un texto." });
  }

  return db.runTransaction(async (tx) => {
    // Todas las lecturas van antes que las escrituras
    const existentes = await tx.get(
      db.collection("inscripciones").where("userId", "==", usuario.uid).where("jornadaId", "==", jornadaId)
    );
    if (!existentes.empty) return "ya-inscrito";

    const jornada = await tx.get(jornadaRef);
    if (!jornada.exists) {
      throw negocio("JORNADA_NO_DISPONIBLE", "La jornada ya no existe.");
    }
    const datos = jornada.data();
    if (datos.activa !== true) {
      throw negocio("JORNADA_NO_DISPONIBLE", "La jornada fue desactivada.");
    }
    const fecha = fechaAMillis(datos.fecha, datos.hora);
    if (fecha == null || fecha <= ahora()) {
      throw negocio("JORNADA_NO_DISPONIBLE", "La jornada ya finalizó.");
    }
    const ocupados = datos.cuposOcupados || 0;
    if (ocupados >= (datos.cuposTotales || 0)) {
      throw negocio("SIN_CUPOS", "La jornada ya no tiene cupos disponibles.");
    }

    tx.set(inscripcionRef, {
      userId: usuario.uid,
      jornadaId,
      nombreUsuario: texto(cuerpo.nombreUsuario, 200) || usuario.nombre,
      emailUsuario: texto(cuerpo.emailUsuario, 200) || usuario.email,
      tituloJornada: texto(cuerpo.tituloJornada, 200) || datos.titulo || "",
      fechaJornada: Timestamp.fromMillis(fecha),
      inscritoEn: FieldValue.serverTimestamp(),
      asistio: false,
    });
    tx.update(jornadaRef, { cuposOcupados: ocupados + 1 });
    // Estado de la jornada que el alumno ya conoce: así recibe el aviso de cualquier cambio posterior
    tx.set(usuarioRef, { jornadasVistas: { [jornadaId]: instantaneaDeJornada(datos) } }, { merge: true });
    return "completada";
  });
}

export async function cancelar(ctx, usuario, jornadaId) {
  const { db } = ctx;
  const jornadaRef = db.collection("jornadas").doc(jornadaId);
  const usuarioRef = db.collection("users").doc(usuario.uid);

  return db.runTransaction(async (tx) => {
    const existentes = await tx.get(
      db.collection("inscripciones").where("userId", "==", usuario.uid).where("jornadaId", "==", jornadaId)
    );
    if (existentes.empty) return "ya-cancelada";

    const jornada = await tx.get(jornadaRef);

    existentes.docs.forEach((d) => tx.delete(d.ref));
    if (jornada.exists) {
      const ocupados = jornada.data().cuposOcupados || 0;
      tx.update(jornadaRef, { cuposOcupados: Math.max(0, ocupados - existentes.size) });
    }
    // Ya no está inscrito: se olvida el estado anotado de esa jornada
    tx.set(usuarioRef, { jornadasVistas: { [jornadaId]: FieldValue.delete() } }, { merge: true });
    return "completada";
  });
}
