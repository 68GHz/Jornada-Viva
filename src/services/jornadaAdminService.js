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
import { usaApi } from "../config/api";
import { llamarApi } from "./apiClient";
import { esMismaJornada } from "../utils/jornadaForm";
import { fechaAMillis, normalizarJornada } from "../utils/jornadaFecha";
import { conTiempoLimite, mensajeDeRed } from "../utils/sincronizacion";

// Administración de jornadas (gestor y administrador). Estas operaciones solo funcionan
// con conexión y firestore.rules las valida en el servidor: un gestor crea jornadas a su
// nombre y solo administra las que tiene asignadas (editar, cancelar, reactivar,
// eliminar, leer inscritos); el administrador, cualquiera.
const ESPERA_MS = 15000;

const camposEditables = ({ titulo, descripcion, entidad, responsable, lugar, fecha, duracionMin, cuposTotales }) => ({
  titulo,
  descripcion,
  entidad,
  responsable,
  lugar,
  fecha: Timestamp.fromMillis(fecha),
  duracionMin,
  cuposTotales,
});

const rutaJornada = (id) => `/v1/jornadas/${encodeURIComponent(id)}`;

// Con la API (módulo "jornadas") el servidor aplica los permisos y validaciones, crea los avisos
// a los inscritos y audita las acciones del administrador.
// `claveIdempotencia` (solo con la API): al reintentar con la misma clave el servidor devuelve la
// jornada ya creada en vez de crear otra.
export const crearJornada = (uid, datos, claveIdempotencia) =>
  usaApi("jornadas")
    ? llamarApi("POST", "/v1/jornadas", {
        cuerpo: { ...datos, creadoPor: uid, ...(claveIdempotencia ? { claveIdempotencia } : {}) },
      })
    : conTiempoLimite(
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
  usaApi("jornadas")
    ? llamarApi("PUT", rutaJornada(jornadaId), { cuerpo: { ...datos, ...(creadoPor ? { creadoPor } : {}) } })
    : conTiempoLimite(
    updateDoc(doc(db, "jornadas", jornadaId), {
      ...camposEditables(datos),
      ...(creadoPor ? { creadoPor } : {}),
    }),
    ESPERA_MS
  );

export const cancelarJornada = (jornadaId) =>
  usaApi("jornadas")
    ? llamarApi("POST", `${rutaJornada(jornadaId)}/cancelar`)
    : conTiempoLimite(updateDoc(doc(db, "jornadas", jornadaId), { activa: false }), ESPERA_MS);

export const reactivarJornada = (jornadaId) =>
  usaApi("jornadas")
    ? llamarApi("POST", `${rutaJornada(jornadaId)}/reactivar`)
    : conTiempoLimite(updateDoc(doc(db, "jornadas", jornadaId), { activa: true }), ESPERA_MS);

// Las inscripciones de una jornada eliminada se conservan: a los estudiantes les
// aparece como "No disponible" en Mis jornadas.
export const eliminarJornada = (jornadaId) =>
  usaApi("jornadas")
    ? llamarApi("DELETE", rutaJornada(jornadaId))
    : conTiempoLimite(deleteDoc(doc(db, "jornadas", jornadaId)), ESPERA_MS);

// Error de conexión: no se sabe si el servidor llegó a guardar lo pedido
export const esErrorDeConexion = (error) =>
  error?.name === "ErrorRed" ||
  ["unavailable", "deadline-exceeded"].includes(String(error?.code || "").replace(/^firestore\//, ""));

// ¿Ya existe una jornada igual a `datos` para ese gestor? Se consulta antes de reintentar una
// creación que falló por conexión: si el primer intento sí se guardó, no se crea otra. Devuelve su
// ID o null. Siempre lee del servidor (la caché podría no tenerla todavía).
export async function buscarJornadaIgual(creadoPor, datos) {
  const snapshot = await conTiempoLimite(
    getDocsFromServer(query(collection(db, "jornadas"), where("creadoPor", "==", creadoPor))),
    ESPERA_MS
  );
  const igual = snapshot.docs.find((d) => esMismaJornada(normalizarJornada(d.id, d.data()), datos));
  return igual ? igual.id : null;
}

// Estudiantes inscritos en una jornada (siempre desde el servidor)
export async function obtenerInscritos(jornadaId) {
  if (usaApi("jornadas")) {
    return (await llamarApi("GET", `${rutaJornada(jornadaId)}/inscritos`, { espera: ESPERA_MS })).inscritos;
  }
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
      metodoAsistencia: datos.metodoAsistencia || null,
    };
  });
}

// Mensaje para el usuario según el error de Firebase
export function mensajeDeError(error) {
  // Validación del servidor (no debería ocurrir: el formulario ya valida): se muestra su mensaje
  if (error?.code === "invalid-argument" && error.campos) {
    return Object.values(error.campos)[0] || "Revisa los datos e intenta de nuevo.";
  }
  if (error?.code === "failed-precondition" && error.message) return error.message;
  const codigo = String(error?.code || "").replace(/^firestore\//, "");
  if (codigo === "permission-denied") {
    return "No tienes permiso para realizar esta acción. Solo puedes administrar las jornadas que tienes asignadas.";
  }
  if (esErrorDeConexion(error)) return mensajeDeRed(error);
  return "No se pudo completar la operación. Intenta de nuevo.";
}
