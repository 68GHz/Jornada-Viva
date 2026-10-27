import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { conTiempoLimite } from "../utils/sincronizacion";
import { estadoVentanaAsistencia } from "../utils/asistencia";

export * from "../utils/asistencia";

const ESPERA_MS = 15000;

/**
 * Registra la asistencia autónoma de un estudiante tras escanear el QR.
 */
export async function registrarAsistenciaEstudiante(inscripcionId, jornadaFechaMs) {
  const ventana = estadoVentanaAsistencia(jornadaFechaMs);
  if (!ventana.disponible) {
    throw new Error(ventana.mensaje);
  }

  const ref = doc(db, "inscripciones", inscripcionId);
  return conTiempoLimite(
    updateDoc(ref, {
      asistio: true,
      asistioEn: serverTimestamp(),
      metodoAsistencia: "qr",
    }),
    ESPERA_MS
  );
}

/**
 * Marca o desmarca la asistencia de un inscrito de forma manual por el gestor/administrador.
 */
export async function registrarAsistenciaManual(inscripcionId, jornadaFechaMs, asistio) {
  const ventana = estadoVentanaAsistencia(jornadaFechaMs);
  if (!ventana.disponible) {
    throw new Error(ventana.mensaje);
  }

  const ref = doc(db, "inscripciones", inscripcionId);
  return conTiempoLimite(
    updateDoc(ref, {
      asistio: Boolean(asistio),
      asistioEn: asistio ? serverTimestamp() : null,
      metodoAsistencia: "manual",
    }),
    ESPERA_MS
  );
}
