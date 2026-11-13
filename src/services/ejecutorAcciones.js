import { manejadoresAsistencia } from "./asistenciaService";
import { ErrorTipoDesconocido, ejecutarAccion as ejecutarAccionDeInscripcion } from "./inscripcionService";
import { esAccionDeInscripcion } from "../utils/sincronizacion";

// Único punto por el que la cola envía una acción al servidor: elige el manejador según su tipo.
//  - inscribirse / cancelar        -> inscripcionService
//  - registrar / marcar / quitar asistencia -> asistenciaService
// Un tipo que esta versión de la app no conoce es un error permanente: queda "rechazada" con su
// motivo, sin perderse y sin enviarse como si fuera otra cosa.
export function ejecutarAccion(uid, accion) {
  if (esAccionDeInscripcion(accion?.tipo)) return ejecutarAccionDeInscripcion(uid, accion);
  const manejador = Object.prototype.hasOwnProperty.call(manejadoresAsistencia, accion?.tipo)
    ? manejadoresAsistencia[accion.tipo]
    : null;
  if (!manejador) return Promise.reject(new ErrorTipoDesconocido(accion?.tipo));
  return manejador(accion);
}
