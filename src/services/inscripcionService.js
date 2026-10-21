import {
  collection,
  deleteField,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { fechaAMillis } from "../utils/jornadaFecha";
import { instantaneaDeJornada } from "../utils/instantaneaJornada";
import {
  ErrorNegocio,
  TIPOS,
  conTiempoLimite,
} from "../utils/sincronizacion";

// ID determinista: un usuario solo puede tener un documento de inscripción por
// jornada. Las reglas de Firestore no permiten `update` sobre inscripciones, así
// que si dos envíos coinciden, el segundo es rechazado en vez de duplicar la
// inscripción o descontar dos cupos.
export const idInscripcion = (uid, jornadaId) => `${uid}_${jornadaId}`;

// Búsqueda por campos: también encuentra las inscripciones antiguas (ID aleatorio).
// Siempre contra el servidor: sin conexión falla en lugar de devolver datos viejos.
const inscripcionesDe = (uid, jornadaId) =>
  getDocsFromServer(
    query(
      collection(db, "inscripciones"),
      where("userId", "==", uid),
      where("jornadaId", "==", jornadaId)
    )
  );

const esPermisoDenegado = (error) =>
  String(error?.code || "").replace(/^firestore\//, "") === "permission-denied";

async function inscribir(uid, accion) {
  if (!(await inscripcionesDe(uid, accion.jornadaId)).empty) return "ya-inscrito";

  const jornadaRef = doc(db, "jornadas", accion.jornadaId);
  const inscripcionRef = doc(db, "inscripciones", idInscripcion(uid, accion.jornadaId));

  try {
    return await runTransaction(db, async (tx) => {
      const jornada = await tx.get(jornadaRef);
      if (!jornada.exists()) {
        throw new ErrorNegocio("JORNADA_NO_DISPONIBLE", "La jornada ya no existe.");
      }

      const datos = jornada.data();
      if (datos.activa !== true) {
        throw new ErrorNegocio("JORNADA_NO_DISPONIBLE", "La jornada fue desactivada.");
      }
      const fecha = fechaAMillis(datos.fecha, datos.hora);
      // Se valida con la fecha del dispositivo
      if (fecha == null || fecha <= Date.now()) {
        throw new ErrorNegocio("JORNADA_NO_DISPONIBLE", "La jornada ya finalizó.");
      }
      const ocupados = datos.cuposOcupados || 0;
      if (ocupados >= (datos.cuposTotales || 0)) {
        throw new ErrorNegocio("SIN_CUPOS", "La jornada ya no tiene cupos disponibles.");
      }

      tx.set(inscripcionRef, {
        userId: uid,
        jornadaId: accion.jornadaId,
        nombreUsuario: accion.nombreUsuario,
        emailUsuario: accion.emailUsuario,
        tituloJornada: accion.tituloJornada ?? datos.titulo ?? "",
        fechaJornada: Timestamp.fromMillis(fecha),
        inscritoEn: serverTimestamp(),
        asistio: false,
      });
      tx.update(jornadaRef, { cuposOcupados: ocupados + 1 });
      // Anota cómo está la jornada en este momento (en la misma transacción): así el
      // estudiante recibe el aviso de cualquier cambio posterior, aunque la app esté
      // cerrada o haya cerrado sesión cuando el maestro lo haga.
      tx.set(
        doc(db, "users", uid),
        { jornadasVistas: { [accion.jornadaId]: instantaneaDeJornada(datos) } },
        { merge: true }
      );
      return "completada";
    });
  } catch (error) {
    // Si el documento ya existía, `set` equivale a un `update` y las reglas lo
    // rechazan: otra inscripción idéntica se adelantó. Se confirma y se da por hecha.
    if (esPermisoDenegado(error) && !(await inscripcionesDe(uid, accion.jornadaId)).empty) {
      return "ya-inscrito";
    }
    throw error;
  }
}

async function cancelar(uid, accion) {
  const existentes = await inscripcionesDe(uid, accion.jornadaId);
  if (existentes.empty) return "ya-cancelada";

  const jornadaRef = doc(db, "jornadas", accion.jornadaId);

  try {
    return await runTransaction(db, async (tx) => {
      // En una transacción todas las lecturas van antes que las escrituras
      const vigentes = [];
      for (const { ref } of existentes.docs) {
        if ((await tx.get(ref)).exists()) vigentes.push(ref);
      }
      if (vigentes.length === 0) return "ya-cancelada";

      const jornada = await tx.get(jornadaRef);

      vigentes.forEach((ref) => tx.delete(ref));
      if (jornada.exists()) {
        const ocupados = jornada.data().cuposOcupados || 0;
        tx.update(jornadaRef, {
          cuposOcupados: Math.max(0, ocupados - vigentes.length),
        });
      }
      // Ya no está inscrito: se olvida el estado anotado de esa jornada
      tx.set(
        doc(db, "users", uid),
        { jornadasVistas: { [accion.jornadaId]: deleteField() } },
        { merge: true }
      );
      return "completada";
    });
  } catch (error) {
    // Leer un documento que otro envío acaba de borrar es rechazado por las reglas
    if (esPermisoDenegado(error) && (await inscripcionesDe(uid, accion.jornadaId)).empty) {
      return "ya-cancelada";
    }
    throw error;
  }
}

// Envía una acción de la cola. Es idempotente: repetirla no duplica ni descuadra cupos.
// Lanza ErrorNegocio si el servidor no puede aceptarla (sin cupos, jornada desactivada...).
export function ejecutarAccion(uid, accion) {
  const tarea =
    accion.tipo === TIPOS.INSCRIBIR ? inscribir(uid, accion) : cancelar(uid, accion);
  return conTiempoLimite(tarea, 20000);
}
