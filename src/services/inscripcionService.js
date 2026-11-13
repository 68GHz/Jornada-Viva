import { usaApi } from "../config/api";
import { llamarApi } from "./apiClient";
import { TIPOS } from "../utils/sincronizacion";

// Envío de las acciones de inscripción de la cola (inscribirse y cancelar).
//
// Todo pasa por la API de negocio: el servidor aplica las reglas (cupos, duplicados, plazo de
// cancelación) dentro de una transacción y es el único que escribe en Firestore. La lógica local
// anterior (transacciones del SDK de Firestore desde el teléfono) se retiró: las reglas de Firestore
// ya no permiten escribir desde la app.

// Misma operación, ejecutada por la API (devuelve "completada" | "ya-inscrito" | "ya-cancelada")
const rutaInscripcion = (accion) => `/v1/jornadas/${encodeURIComponent(accion.jornadaId)}/inscripcion`;

async function inscribirEnApi(accion) {
  const respuesta = await llamarApi("PUT", rutaInscripcion(accion), {
    cuerpo: {
      nombreUsuario: accion.nombreUsuario,
      emailUsuario: accion.emailUsuario,
      ...(accion.tituloJornada !== undefined ? { tituloJornada: accion.tituloJornada } : {}),
    },
  });
  return respuesta.resultado;
}

async function cancelarEnApi(accion) {
  const respuesta = await llamarApi("DELETE", rutaInscripcion(accion), {
    // Una cancelación hecha sin conexión lleva la hora en que el usuario la hizo, para que el
    // servidor valide el plazo con ella y no con la hora de la sincronización. Con conexión no
    // se envía nada: el servidor usa su propia hora y el reloj del teléfono no cuenta.
    cuerpo:
      accion.sinConexion === true && Number.isFinite(accion.creadaEn)
        ? { canceladaEn: accion.creadaEn }
        : undefined,
  });
  return respuesta.resultado;
}

// Manejadores de las acciones de inscripción, por tipo de acción
export const manejadoresInscripcion = {
  [TIPOS.INSCRIBIR]: inscribirEnApi,
  [TIPOS.CANCELAR]: cancelarEnApi,
};

// Error permanente para un tipo de acción que esta versión de la app no sabe enviar (p. ej. una
// acción guardada por otra versión): queda "rechazada" con este motivo, sin perderse y sin enviarse
// como si fuera otra cosa.
export class ErrorTipoDesconocido extends Error {
  constructor(tipo) {
    super(`Esta versión de la app no sabe enviar la acción «${tipo ?? "sin tipo"}».`);
    this.name = "ErrorTipoDesconocido";
    this.code = "unimplemented";
  }
}

// Error permanente: sin la API configurada la app no puede escribir nada
export class ErrorSinApi extends Error {
  constructor() {
    super("La app necesita la API de Jornada Viva configurada (EXPO_PUBLIC_API_URL) para enviar cambios.");
    this.name = "ErrorSinApi";
    this.code = "failed-precondition";
  }
}

// Envía una acción de la cola. Es idempotente: repetirla no duplica ni descuadra cupos.
// Lanza ErrorNegocio si el servidor no puede aceptarla (sin cupos, jornada desactivada...).
export function ejecutarAccion(_uid, accion) {
  const manejador = Object.prototype.hasOwnProperty.call(manejadoresInscripcion, accion?.tipo)
    ? manejadoresInscripcion[accion.tipo]
    : null;
  if (!manejador) return Promise.reject(new ErrorTipoDesconocido(accion?.tipo));
  if (!usaApi("inscripciones")) return Promise.reject(new ErrorSinApi());
  return manejador(accion);
}
