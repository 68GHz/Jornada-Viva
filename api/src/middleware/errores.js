import { ErrorApi } from "../errores.js";

export const rutaNoEncontrada = (_req, _res, next) =>
  next(new ErrorApi(404, "RUTA_NO_ENCONTRADA", "La ruta solicitada no existe."));

// Último middleware: convierte cualquier error en { error: { codigo, mensaje, campos? } }.
// Los errores inesperados no filtran detalles internos al cliente.
export function manejarErrores(registro = console) {
  // eslint-disable-next-line no-unused-vars
  return (error, req, res, _next) => {
    if (error instanceof ErrorApi) {
      return res.status(error.estado).json({
        error: {
          codigo: error.codigo,
          mensaje: error.message,
          ...(error.campos ? { campos: error.campos } : {}),
        },
      });
    }
    if (error?.type === "entity.parse.failed" || error instanceof SyntaxError) {
      return res.status(400).json({
        error: { codigo: "VALIDACION", mensaje: "El cuerpo de la solicitud no es un JSON válido." },
      });
    }
    // Contención de transacciones agotada (Firestore ABORTED) o servicio saturado: el cliente reintenta
    if ([10, 14, 4, 8].includes(error?.code) || ["aborted", "unavailable"].includes(error?.code)) {
      registro.error(`[transitorio] ${req.method} ${req.originalUrl}:`, error);
      return res.status(503).json({
        error: { codigo: "SERVICIO_OCUPADO", mensaje: "El servidor está ocupado. Intenta de nuevo en unos segundos." },
      });
    }
    registro.error(`[error] ${req.method} ${req.originalUrl}:`, error);
    return res.status(500).json({
      error: { codigo: "ERROR_INTERNO", mensaje: "No se pudo completar la operación. Intenta de nuevo." },
    });
  };
}
