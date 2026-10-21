import { doc, writeBatch } from "firebase/firestore";
import { db } from "../../firebaseConfig";

const LIMITE_BATCH = 400;

// Persiste `activa: false` en Firestore (p. ej. jornadas vencidas).
// Solo toca ese campo; los cupos y demás datos no se modifican.
export async function desactivarJornadas(ids) {
  for (let i = 0; i < ids.length; i += LIMITE_BATCH) {
    const batch = writeBatch(db);
    ids.slice(i, i + LIMITE_BATCH).forEach((id) => {
      batch.update(doc(db, "jornadas", id), { activa: false });
    });
    await batch.commit();
  }
}
