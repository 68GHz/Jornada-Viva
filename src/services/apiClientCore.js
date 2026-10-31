import { ErrorNegocio, ErrorRed, conTiempoLimite } from "../utils/sincronizacion.js";

// Cliente HTTP único de la API de negocio (sin dependencias de Firebase para poder probarlo).
// Convierte las respuestas de error al mismo vocabulario de errores que ya usaba la app, así
// el resto del código (clasificarError, mensajeDeError, la cola offline...) no cambia:
//
//   sin red / tiempo agotado / 502-504  -> ErrorRed         (temporal: se reintenta; `motivo` distingue
//                                          «sin red» de «el servidor tarda o está despertando»)
//   409 con código de negocio           -> ErrorNegocio     (sin cupos, jornada no disponible...)
//   403                                 -> code "permission-denied"
//   401                                 -> code "unauthenticated"
//   400                                 -> code "invalid-argument" (+ `campos`)
//   404                                 -> code "not-found"
//   otros 409                           -> code "email-already-in-use" / "failed-precondition"
//   500 y demás                         -> code "internal" (temporal)
const CODIGOS_DE_NEGOCIO = new Set([
  "JORNADA_NO_DISPONIBLE",
  "SIN_CUPOS",
  "PLAZO_VENCIDO", // cancelar fuera del plazo de 2 días
  "ACCION_DEMASIADO_ANTIGUA", // acción sin conexión (cancelación, asistencia) demasiado antigua para validarla
  // Asistencia: motivos por los que el servidor la rechaza (no se reintentan; se explica el motivo)
  "CODIGO_INVALIDO",
  "CODIGO_CADUCADO",
  "ASISTENCIA_FUERA_DE_VENTANA",
  "ASISTENCIA_NO_INICIADA",
  "NO_INSCRITO",
]);

export class ErrorApi extends Error {
  constructor({ estado, codigo, mensaje, campos, code }) {
    super(mensaje);
    this.name = "ErrorApi";
    this.estado = estado;
    this.codigoApi = codigo;
    this.code = code;
    this.campos = campos;
  }
}

function codigoCompatible(estado, codigo) {
  if (codigo === "EMAIL_EN_USO") return "email-already-in-use";
  if (estado === 400) return "invalid-argument";
  if (estado === 401) return "unauthenticated";
  if (estado === 403) return "permission-denied";
  if (estado === 404) return "not-found";
  if (estado === 409) return "failed-precondition";
  return "internal";
}

export function errorDeRespuesta(estado, cuerpo) {
  const e = cuerpo && typeof cuerpo === "object" ? cuerpo.error || {} : {};
  const mensaje = e.mensaje || "No se pudo completar la operación.";

  if ([502, 503, 504].includes(estado)) return new ErrorRed(mensaje, "servidor-no-disponible");
  if (estado === 409 && CODIGOS_DE_NEGOCIO.has(e.codigo)) return new ErrorNegocio(e.codigo, mensaje);
  return new ErrorApi({
    estado,
    codigo: e.codigo,
    mensaje,
    campos: e.campos,
    code: codigoCompatible(estado, e.codigo),
  });
}

// `url`: base de la API. `obtenerToken`: () => Promise<string> (ID token de Firebase Auth).
export function crearClienteApi({ url, obtenerToken, fetchFn = (...a) => fetch(...a), espera = 20000 }) {
  async function llamar(metodo, ruta, { cuerpo, texto = false, espera: esperaPropia } = {}) {
    if (!url) throw new Error("La API no está configurada (EXPO_PUBLIC_API_URL).");

    let token;
    try {
      token = await obtenerToken();
    } catch (e) {
      // Sin sesión es un error de permisos; sin red para renovar el token, un error de conexión
      if (String(e?.code || "").includes("network")) throw new ErrorRed();
      throw new ErrorApi({ estado: 401, mensaje: "Inicia sesión para continuar.", code: "unauthenticated" });
    }

    let respuesta;
    try {
      respuesta = await conTiempoLimite(
        fetchFn(url + ruta, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
        }),
        esperaPropia ?? espera
      );
    } catch (e) {
      if (e?.name === "ErrorRed") throw e;
      throw new ErrorRed(); // fallo de red (en React Native: TypeError "Network request failed")
    }

    const contenido = await respuesta.text().catch(() => "");
    if (!respuesta.ok) {
      let cuerpoError = null;
      try {
        cuerpoError = contenido ? JSON.parse(contenido) : null;
      } catch {
        /* respuesta que no es JSON (p. ej. una página de error del hosting) */
      }
      throw errorDeRespuesta(respuesta.status, cuerpoError);
    }
    if (texto) return contenido;
    if (!contenido) return null;
    try {
      return JSON.parse(contenido);
    } catch {
      throw new ErrorApi({ estado: respuesta.status, mensaje: "Respuesta inesperada del servidor.", code: "internal" });
    }
  }

  return { llamar };
}
