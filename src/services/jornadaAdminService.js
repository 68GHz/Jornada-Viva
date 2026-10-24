import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { fechaAMillis } from "../utils/jornadaFecha";
import { conTiempoLimite } from "../utils/sincronizacion";

// Administración de jornadas (gestor y administrador). Estas operaciones solo funcionan
// con conexión y firestore.rules las valida en el servidor: un gestor crea jornadas a su
// nombre y solo administra las que tiene asignadas (editar, cancelar, reactivar,
// eliminar, leer inscritos); el administrador, cualquiera.
const ESPERA_MS = 15000;

const camposEditables = ({ titulo, descripcion, entidad, responsable, lugar, fecha, cuposTotales }) => ({
  titulo,
  descripcion,
  entidad,
  responsable,
  lugar,
  fecha: Timestamp.fromMillis(fecha),
  cuposTotales,
});

export const crearJornada = (uid, datos) =>
  conTiempoLimite(
    addDoc(collection(db, "jornadas"), {
      ...camposEditables(datos),
      cuposOcupados: 0,
      activa: true,
      creadoPor: uid,
      creadaEn: serverTimestamp(),
    }),
    ESPERA_MS
  );

// `creadoPor` (solo el administrador): reasigna la jornada a otro gestor
export const editarJornada = (jornadaId, datos, creadoPor) =>
  conTiempoLimite(
    updateDoc(doc(db, "jornadas", jornadaId), {
      ...camposEditables(datos),
      ...(creadoPor ? { creadoPor } : {}),
    }),
    ESPERA_MS
  );

export const cancelarJornada = (jornadaId) =>
  conTiempoLimite(updateDoc(doc(db, "jornadas", jornadaId), { activa: false }), ESPERA_MS);

export const reactivarJornada = (jornadaId) =>
  conTiempoLimite(updateDoc(doc(db, "jornadas", jornadaId), { activa: true }), ESPERA_MS);

// Las inscripciones de una jornada eliminada se conservan: a los estudiantes les
// aparece como "No disponible" en Mis jornadas.
export const eliminarJornada = (jornadaId) =>
  conTiempoLimite(deleteDoc(doc(db, "jornadas", jornadaId)), ESPERA_MS);

// Estudiantes inscritos en una jornada (siempre desde el servidor)
export async function obtenerInscritos(jornadaId) {
  const snapshot = await conTiempoLimite(
    getDocsFromServer(
      query(collection(db, "inscripciones"), where("jornadaId", "==", jornadaId))
    ),
    ESPERA_MS
  );
  return snapshot.docs.map((d) => {
    const datos = d.data();
    return {
      id: d.id,
      userId: datos.userId,
      nombreUsuario: datos.nombreUsuario || "",
      emailUsuario: datos.emailUsuario || "",
      inscritoEn: fechaAMillis(datos.inscritoEn),
      asistio: !!datos.asistio,
    };
  });
}

// Mensaje para el usuario según el error de Firebase
export function mensajeDeError(error) {
  const codigo = String(error?.code || "").replace(/^firestore\//, "");
  if (codigo === "permission-denied") {
    return "No tienes permiso para realizar esta acción. Solo puedes administrar las jornadas que tienes asignadas.";
  }
  if (error?.name === "ErrorRed" || ["unavailable", "deadline-exceeded"].includes(codigo)) {
    return "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.";
  }
  return "No se pudo completar la operación. Intenta de nuevo.";
}
