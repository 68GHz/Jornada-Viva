import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useConnectivity } from "../context/ConnectivityContext";
import { useJornadas } from "../context/JornadasContext";
import { useSync } from "../context/SyncContext";
import { obtenerAccion } from "../services/syncQueueService";
import { ESTADOS, ErrorNegocio, TIPOS } from "../utils/sincronizacion";
import { jornadaDisponible } from "../utils/jornadaEstado";
import {
  DIAS_LIMITE_CANCELACION,
  puedeCancelarInscripcion,
} from "../utils/jornadaFecha";

// Inscribirse y cancelar la inscripción, con o sin conexión.
//
// Toda acción pasa por la cola persistente: si hay conexión se envía de inmediato;
// si no, queda guardada como "pendiente por sincronizar". Las reglas se validan
// primero con los datos locales y la fecha del dispositivo.
//
// Resultado: { estado: "completada" | "pendiente" | "anulada" | "duplicada" }
// Lanza ErrorNegocio si la acción no es válida o el servidor la rechaza.
export function useAccionesInscripcion() {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const { jornadasPorId, estadoInscripcion } = useJornadas();
  const { encolar, procesar, descartar, liberarAviso } = useSync();

  const validar = useCallback(
    (tipo, jornada) => {
      const actual = jornadasPorId.get(jornada.id) ?? jornada;
      const { inscrito } = estadoInscripcion(jornada.id);

      if (tipo === TIPOS.INSCRIBIR) {
        if (inscrito) {
          throw new ErrorNegocio("YA_INSCRITO", "Ya tienes una inscripción en esta jornada.");
        }
        if (!jornadasPorId.has(jornada.id) || !jornadaDisponible(actual)) {
          throw new ErrorNegocio(
            "JORNADA_NO_DISPONIBLE",
            "Esta jornada ya no está disponible para inscripción."
          );
        }
        if (actual.cuposTotales - actual.cuposOcupados <= 0) {
          throw new ErrorNegocio("SIN_CUPOS", "Esta jornada ya no tiene cupos disponibles.");
        }
        return;
      }

      if (!inscrito) {
        throw new ErrorNegocio("SIN_INSCRIPCION", "No tienes una inscripción en esta jornada.");
      }
      if (!puedeCancelarInscripcion(actual.fecha)) {
        throw new ErrorNegocio(
          "PLAZO_VENCIDO",
          `Solo puedes cancelar hasta ${DIAS_LIMITE_CANCELACION} días antes de la jornada.`
        );
      }
    },
    [jornadasPorId, estadoInscripcion]
  );

  const solicitar = useCallback(
    async (tipo, jornada) => {
      validar(tipo, jornada);

      const { resultado, accion } = await encolar({
        tipo,
        jornadaId: jornada.id,
        tituloJornada: jornada.titulo,
        fechaJornada: jornada.fecha ?? null,
        nombreUsuario: usuario.displayName || usuario.email,
        emailUsuario: usuario.email,
        // Con conexión el usuario espera la respuesta en pantalla; sin ella se
        // avisará cuando la acción se sincronice
        interactiva: enLinea,
        // Se hizo sin conexión: al cancelar, el servidor valida el plazo con la hora en que se hizo
        sinConexion: !enLinea,
      });
      if (resultado === "anulada") return { estado: "anulada" };
      if (resultado === "duplicada") return { estado: "duplicada" };
      if (!enLinea) return { estado: "pendiente" };

      // Con conexión se envía ya. Si un ciclo en curso terminó justo antes de
      // encolar, se reintenta una vez para que no quede esperando.
      for (let intento = 0; intento < 2; intento += 1) {
        await procesar({ forzar: true });
        const actual = await obtenerAccion(usuario.uid, accion.id);

        if (!actual) return { estado: "completada" };
        if (actual.estado === ESTADOS.RECHAZADA) {
          // Respuesta inmediata al usuario: se informa y no queda en la cola
          await descartar(actual.id);
          throw new ErrorNegocio(actual.codigoError || "RECHAZADA", actual.ultimoError);
        }
        if (actual.intentos > 0) break; // falló por la red: queda pendiente
      }
      await liberarAviso(accion.id);
      return { estado: "pendiente" };
    },
    [validar, encolar, enLinea, procesar, descartar, liberarAviso, usuario]
  );

  return {
    inscribirse: (jornada) => solicitar(TIPOS.INSCRIBIR, jornada),
    cancelarInscripcion: (jornada) => solicitar(TIPOS.CANCELAR, jornada),
  };
}
