import { doc, writeBatch } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { usaApi } from "../config/api";
import { llamarApi } from "./apiClient";

const LIMITE_BATCH = 400;

// Persiste `activa: false` en Firestore (p. ej. jornadas vencidas).
// Solo toca ese campo; los cupos y demás datos no se modifican.
// Con la API (módulo "jornadas") la desactivación la hace el servidor, que revisa todas las
// jornadas vencidas (también corre solo cada pocos minutos): `ids` ya no hace falta.
export async function desactivarJornadas(ids) {
  if (usaApi("jornadas")) {
    await llamarApi("POST", "/v1/mantenimiento/vencidas");
    return;
  }
  for (let i = 0; i < ids.length; i += LIMITE_BATCH) {
    const batch = writeBatch(db);
    ids.slice(i, i + LIMITE_BATCH).forEach((id) => {
      batch.update(doc(db, "jornadas", id), { activa: false });
    });
    await batch.commit();
  }
}
