import {
  actualizarAccion,
  cargarCola,
  quitarAccion,
} from "./syncQueueService";
import { ESTADOS, clasificarError, esperaReintento } from "../utils/sincronizacion";

let enCurso = null;

// Envía al servidor las acciones pendientes, una a una y en orden.
// - Éxito: la acción sale de la cola.
// - Error de red: vuelve a quedar pendiente (con espera creciente) y se detiene el ciclo.
// - Error de negocio o permanente: queda "rechazada" con el motivo, sin perderse.
// Solo hay un ciclo a la vez; si se invoca mientras corre, devuelve el mismo.
// `ejecutar(accion)` hace el envío real (inyectable para pruebas).
// `alProcesar(accion)` se llama antes de enviar cada acción (si devuelve `false` el ciclo se
// detiene sin intentar el envío, p. ej. porque se perdió la conexión) y `alTerminar()` cuando
// el ciclo completo termina (aunque queden acciones en espera), para reflejar el estado real.
export function procesarCola({
  uid,
  ejecutar,
  forzar = false,
  alProcesar,
  alTerminar,
  ahora = Date.now,
}) {
  if (enCurso) return enCurso;
  enCurso = ciclo({ uid, ejecutar, forzar, alProcesar, ahora })
    .finally(() => {
      enCurso = null;
    })
    .finally(() => alTerminar?.());
  return enCurso;
}

async function ciclo({ uid, ejecutar, forzar, alProcesar, ahora }) {
  const resumen = { exitosas: 0, enviadas: [], rechazadas: [], pausada: false, pausadaPor: null };
  const vistas = new Set();

  while (true) {
    const cola = await cargarCola(uid);
    const accion = cola.find(
      (a) =>
        a.estado === ESTADOS.PENDIENTE &&
        !vistas.has(a.id) &&
        (forzar || !a.proximoIntento || a.proximoIntento <= ahora())
    );
    if (!accion) break;
    vistas.add(accion.id);

    if (alProcesar?.(accion) === false) {
      resumen.pausada = true;
      break;
    }

    await actualizarAccion(uid, accion.id, { estado: ESTADOS.SINCRONIZANDO });
    try {
      await ejecutar(accion);
      await quitarAccion(uid, accion.id);
      resumen.exitosas += 1;
      resumen.enviadas.push(accion);
    } catch (error) {
      const clasificado = clasificarError(error);

      if (clasificado.tipo === "red") {
        const intentos = accion.intentos + 1;
        await actualizarAccion(uid, accion.id, {
          estado: ESTADOS.PENDIENTE,
          intentos,
          ultimoError: clasificado.mensaje,
          proximoIntento: ahora() + esperaReintento(intentos),
        });
        resumen.pausada = true;
        resumen.pausadaPor = accion;
        break;
      }

      await actualizarAccion(uid, accion.id, {
        estado: ESTADOS.RECHAZADA,
        ultimoError: clasificado.mensaje,
        codigoError: clasificado.codigo || null,
      });
      resumen.rechazadas.push({
        ...accion,
        ultimoError: clasificado.mensaje,
        codigoError: clasificado.codigo || null,
      });
    }
  }

  return resumen;
}
