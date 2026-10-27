import { jornadaTerminada } from "../dominio/duracion.js";
import { normalizarJornada } from "../dominio/jornadaFecha.js";
import { notificarSinFallar } from "./avisos.js";

// Desactiva (activa:false) las jornadas activas que ya terminaron: la hora de inicio más su
// duración (las que no tienen duración usan la de por defecto). Una jornada en curso sigue activa
// hasta que termina. Antes lo hacía cualquier cliente al cargar el listado. Una jornada sin fecha
// no se desactiva (no se puede asegurar que haya terminado). Terminar no es cancelar: no genera
// aviso, solo actualiza el estado que cada alumno ya conocía (así una reactivación posterior se
// avisa correctamente).
export async function desactivarVencidas(ctx) {
  const { db, ahora } = ctx;
  const ahoraMs = ahora();
  const snap = await db.collection("jornadas").where("activa", "==", true).get();
  const vencidas = snap.docs.filter((d) => {
    const jornada = normalizarJornada(d.id, d.data());
    return jornada.fecha != null && jornadaTerminada(jornada, ahoraMs);
  });

  for (let i = 0; i < vencidas.length; i += 400) {
    const lote = db.batch();
    vencidas.slice(i, i + 400).forEach((d) => lote.update(d.ref, { activa: false }));
    await lote.commit();
  }
  for (const d of vencidas) await notificarSinFallar(ctx, d.id, { ...d.data(), activa: false });
  return { desactivadas: vencidas.length };
}
