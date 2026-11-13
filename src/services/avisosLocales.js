import { guardarLocal, leerLocal } from "./localStore";
import { mostrarNotificacionLocal } from "./notificationService";
import { seleccionarParaAvisar } from "../utils/avisosLocales";

// Muestra como aviso del dispositivo las notificaciones nuevas que crea el servidor.
// Se procesan de una en una para que dos lecturas seguidas no avisen dos veces lo mismo.
let cola = Promise.resolve();

export function avisarNuevasNotificaciones(uid, lista) {
  cola = cola
    .then(async () => {
      const conocidas = await leerLocal(uid, "notificacionesAvisadas", null);
      const { nuevas, avisadas } = seleccionarParaAvisar(lista, conocidas);
      for (const n of nuevas) {
        await mostrarNotificacionLocal(n.titulo, n.mensaje, { jornadaId: n.jornadaId, tipo: n.tipo });
      }
      if (nuevas.length > 0 || conocidas === null) await guardarLocal(uid, "notificacionesAvisadas", avisadas);
    })
    .catch((error) => console.warn("No se pudo mostrar el aviso de una notificación:", error));
  return cola;
}
