// Errores de la API. Todos se responden con { error: { codigo, mensaje, campos? } }.
//
//   400 VALIDACION           datos inválidos (campos: { campo: mensaje })
//   401 NO_AUTENTICADO       falta el token o no es válido
//   403 SIN_PERMISO          el rol no permite la acción
//   403 CUENTA_DESACTIVADA   la cuenta fue desactivada por un administrador
//   404 NO_ENCONTRADO        el recurso no existe
//   409 <código de negocio>  JORNADA_NO_DISPONIBLE, SIN_CUPOS, ... (mismos códigos que la app)
export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje, campos) {
    super(mensaje);
    this.name = "ErrorApi";
    this.estado = estado;
    this.codigo = codigo;
    this.campos = campos;
  }
}

export const validacion = (campos, mensaje = "Los datos enviados no son válidos.") =>
  new ErrorApi(400, "VALIDACION", mensaje, campos);
export const noAutenticado = (mensaje = "Inicia sesión para continuar.") =>
  new ErrorApi(401, "NO_AUTENTICADO", mensaje);
export const sinPermiso = (mensaje = "No tienes permiso para realizar esta acción.") =>
  new ErrorApi(403, "SIN_PERMISO", mensaje);
export const noEncontrado = (mensaje = "No se encontró lo solicitado.") =>
  new ErrorApi(404, "NO_ENCONTRADO", mensaje);
export const negocio = (codigo, mensaje) => new ErrorApi(409, codigo, mensaje);
