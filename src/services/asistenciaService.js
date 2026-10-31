import { usaApi } from "../config/api";
import { llamarApi } from "./apiClient";
import { TIPOS, mensajeDeRed } from "../utils/sincronizacion";

export * from "../utils/asistencia";

// La asistencia siempre pasa por la API: el servidor firma el código del QR, valida la ventana de
// tiempo y registra la asistencia. Firestore ya no admite escrituras de asistencia desde la app.
const ESPERA_MS = 15000;

const rutaJornada = (id) => `/v1/jornadas/${encodeURIComponent(id)}`;

function exigirApi() {
  if (!usaApi("asistencia")) {
    throw new Error("La asistencia necesita conexión con el servidor de Jornada Viva.");
  }
}

// Código firmado para mostrar en el QR (gestor de la jornada o administrador).
// Devuelve { codigo, expiraEn, renovarEnMs }: hay que pedir otro antes de que venza.
export function pedirCodigoQr(jornadaId) {
  exigirApi();
  return llamarApi("POST", `${rutaJornada(jornadaId)}/asistencia/codigo`, { espera: ESPERA_MS });
}

// El estudiante registra su asistencia con el código leído del QR. Devuelve "registrada" o
// "ya-registrada".
export async function registrarAsistenciaEstudiante(jornadaId, codigo) {
  exigirApi();
  const { resultado } = await llamarApi("POST", `${rutaJornada(jornadaId)}/asistencia`, {
    cuerpo: { codigo },
    espera: ESPERA_MS,
  });
  return resultado;
}

// El gestor o el administrador marcan (true) o quitan (false) la asistencia de un inscrito, en
// cualquier momento desde que empieza la jornada.
export function marcarAsistenciaManual(jornadaId, inscripcionId, asistio) {
  exigirApi();
  return llamarApi(
    "PUT",
    `${rutaJornada(jornadaId)}/inscritos/${encodeURIComponent(inscripcionId)}/asistencia`,
    { cuerpo: { asistio }, espera: ESPERA_MS }
  );
}

// ---- Acciones de la cola (asistencia sin conexión) ---------------------------------------------
// Una asistencia hecha sin conexión se guarda en la cola y se envía al reconectar con la HORA EN QUE
// OCURRIÓ (`creadaEn` de la acción): el servidor la valida con esa hora (ver api/src/dominio/
// relojDiferido.js) en lugar de la hora de la sincronización. Todas son idempotentes.

// Estudiante: registra su escaneo guardado. Devuelve "registrada" o "ya-registrada".
async function registrarAsistenciaDeLaCola(accion) {
  exigirApi();
  const { resultado } = await llamarApi("POST", `${rutaJornada(accion.jornadaId)}/asistencia`, {
    cuerpo: { codigo: accion.codigo, escaneadoEn: accion.creadaEn },
    espera: ESPERA_MS,
  });
  return resultado;
}

// Gestor o administrador: marca (true) o quita (false) la asistencia de un inscrito
const marcarAsistenciaDeLaCola = (asistio) => async (accion) => {
  exigirApi();
  const { asistio: resultado } = await llamarApi(
    "PUT",
    `${rutaJornada(accion.jornadaId)}/inscritos/${encodeURIComponent(accion.objetivoId)}/asistencia`,
    { cuerpo: { asistio, marcadaEn: accion.creadaEn }, espera: ESPERA_MS }
  );
  return resultado ? "marcada" : "retirada";
};

// Manejadores de las acciones de asistencia, por tipo
export const manejadoresAsistencia = {
  [TIPOS.REGISTRAR_ASISTENCIA]: registrarAsistenciaDeLaCola,
  [TIPOS.MARCAR_ASISTENCIA]: marcarAsistenciaDeLaCola(true),
  [TIPOS.QUITAR_ASISTENCIA]: marcarAsistenciaDeLaCola(false),
};

// Mensaje para el usuario según el error (los de la API ya vienen redactados para mostrarse)
export function mensajeDeErrorAsistencia(error) {
  if (error?.name === "ErrorRed") return mensajeDeRed(error);
  return error?.message || "No se pudo completar la operación. Intenta de nuevo.";
}
