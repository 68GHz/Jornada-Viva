import { llamarApi } from "./apiClient";
import { usaApi } from "../config/api";

// FE-01 · La disponibilidad de espacios la calcula la API con todas las jornadas. Si no se puede
// consultar (sin conexión, API apagada o con error), quien llama usa el cálculo local de respaldo.
const ESPERA_MS = 8000;

export const disponibilidadEnServidor = () => usaApi("jornadas");

// -> { ocupados: { espacio: [{ id, titulo, fecha, lugar }] }, libres: [espacio] }
export function pedirDisponibilidad(inicio, fin, excluirId) {
  const consulta = new URLSearchParams({ inicio: String(inicio), fin: String(fin) });
  if (excluirId) consulta.set("excluirId", excluirId);
  return llamarApi("GET", `/v1/espacios/disponibilidad?${consulta}`, { espera: ESPERA_MS });
}

// -> { sugerencia: null | { motivo, ocupantes, libres } }
export function pedirAlternos(jornadaId) {
  return llamarApi("GET", `/v1/jornadas/${encodeURIComponent(jornadaId)}/espacios-alternos`, {
    espera: ESPERA_MS,
  });
}
