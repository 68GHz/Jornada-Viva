import {
  collection,
  query,
  where,
  getDocFromServer,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  deleteField,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { usaApi } from "../config/api";
import { llamarApi } from "./apiClient";
import { guardarLocal, leerLocal } from "./localStore";
import { mostrarNotificacionLocal } from "./notificationService";
import { detectarCambioJornada, detectarEliminacion } from "../utils/cambiosJornada";
import { instantaneaDeJornada, mismaInstantanea } from "../utils/instantaneaJornada";
import { conTiempoLimite } from "../utils/sincronizacion";

// Espera máxima para leer el estado visto del servidor al iniciar (sin conexión se usa la copia local)
const ESPERA_ESTADO_VISTO_MS = 8000;
// Espera máxima al guardar una notificación; pasado ese tiempo la escritura sigue en cola del SDK
const ESPERA_NOTIFICACION_MS = 10000;

/**
 * Escucha en tiempo real las notificaciones directas guardadas en la colección `notificaciones`
 * para el usuario actual.
 */
export function escucharNotificacionesUsuario(userId, onActualizar, onError) {
  if (!userId) return () => {};

  const q = query(
    collection(db, "notificaciones"),
    where("userId", "==", userId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const lista = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        creadaEn: d.data().creadaEn?.toMillis
          ? d.data().creadaEn.toMillis()
          : d.data().creadaEn || Date.now(),
      }));

      // Ordenar más recientes primero
      lista.sort((a, b) => (b.creadaEn || 0) - (a.creadaEn || 0));
      onActualizar(lista);
    },
    (error) => {
      console.error("Error escuchando notificaciones:", error);
      if (onError) onError(error);
    }
  );
}

/**
 * Lee del servidor las jornadas que el usuario ya "vio" (users/{uid}.jornadasVistas). Vive en
 * Firestore y no en el dispositivo: cerrar sesión borra los datos locales, pero los cambios que
 * el maestro haga mientras el estudiante no está deben avisarse cuando vuelva.
 * Devuelve null si no hay conexión con el servidor.
 */
async function leerEstadoVistoRemoto(userId) {
  try {
    const snapshot = await conTiempoLimite(
      getDocFromServer(doc(db, "users", userId)),
      ESPERA_ESTADO_VISTO_MS
    );
    return (snapshot.exists() && snapshot.data().jornadasVistas) || {};
  } catch {
    return null;
  }
}

/**
 * Sincronizador en tiempo real del lado del cliente:
 * Escucha las inscripciones del usuario y monitorea las jornadas asociadas en Firestore.
 * Cuando una jornada cambia (la edita, cancela, reactiva o elimina su maestro, o se cambia en
 * Firestore), compara con el estado que el usuario ya conocía, registra la notificación en
 * `notificaciones` y muestra una notificación local.
 *
 * El estado conocido de cada jornada se guarda en Firestore (ver cargarEstadoVisto) y la
 * inscripción lo deja anotado en la misma transacción, así que no se pierde ningún cambio
 * aunque el usuario cierre sesión, cambie de dispositivo o tenga la app cerrada.
 */
export function iniciarSincronizadorJornadas(userId) {
  if (!userId) return () => {};
  // Con la API (módulo "jornadas") los avisos los crea el servidor en el momento del cambio:
  // el dispositivo ya no los detecta (evita duplicados). Ver NotificationContext.
  if (usaApi("jornadas")) return () => {};

  let activo = true;
  let desuscribirInscripciones = () => {};
  let desuscribirJornadas = [];
  let estadoVisto = {};

  // Los eventos se procesan de uno en uno para que no se pisen (p. ej. al guardar el estado)
  let serie = Promise.resolve();
  const enSerie = (tarea) => {
    serie = serie.then(tarea).catch((error) => {
      console.warn("Error procesando un cambio de jornada:", error);
    });
    return serie;
  };

  // Guarda cómo está una jornada para el usuario (null = ya no hace falta recordarla)
  const recordar = (jornadaId, instantanea) => {
    if (instantanea) {
      estadoVisto = { ...estadoVisto, [jornadaId]: instantanea };
    } else {
      const { [jornadaId]: _olvidada, ...resto } = estadoVisto;
      estadoVisto = resto;
    }
    guardarLocal(userId, "estadoVisto", estadoVisto);
    // Si no hay conexión, la copia local sigue valiendo y el SDK reintenta la escritura
    setDoc(
      doc(db, "users", userId),
      { jornadasVistas: { [jornadaId]: instantanea || deleteField() } },
      { merge: true }
    ).catch(() => {});
  };

  // Crea la notificación del usuario y la muestra en el dispositivo. true si quedó registrada.
  const registrarNotificacion = async (jornadaId, cambio, datosJornada) => {
    const notifId = `${userId}_${jornadaId}_${cambio.tipo}_${Date.now()}`;
    try {
      await conTiempoLimite(
        setDoc(doc(db, "notificaciones", notifId), {
          userId,
          jornadaId,
          tipo: cambio.tipo,
          titulo: cambio.titulo,
          mensaje: cambio.mensaje,
          leida: false,
          creadaEn: serverTimestamp(),
          datosJornada,
        }),
        ESPERA_NOTIFICACION_MS
      );
    } catch (e) {
      // Sin conexión la escritura queda en cola del SDK; cualquier otro error se reintenta
      if (e?.name !== "ErrorRed") {
        console.error("Error registrando notificación:", e);
        return false;
      }
    }
    mostrarNotificacionLocal(cambio.titulo, cambio.mensaje, { jornadaId, tipo: cambio.tipo });
    return true;
  };

  // Jornadas cuyo estado se buscó con éxito en el servidor
  const consultadasEnServidor = new Set();

  const procesarJornada = async (jornadaId, jornadaSnap) => {
    if (!activo) return;

    // Una inscripción nueva deja anotado el estado en el servidor; si aún no se conoce aquí, se lee.
    // Sin conexión no cuenta como consultada: se vuelve a intentar en la siguiente lectura.
    if (!estadoVisto[jornadaId] && !consultadasEnServidor.has(jornadaId)) {
      const remoto = await leerEstadoVistoRemoto(userId);
      if (remoto) {
        consultadasEnServidor.add(jornadaId);
        if (remoto[jornadaId] && !estadoVisto[jornadaId]) {
          estadoVisto = { ...estadoVisto, [jornadaId]: remoto[jornadaId] };
        }
      }
    }
    const anterior = estadoVisto[jornadaId];

    if (!jornadaSnap.exists()) {
      // Sin conexión y sin la jornada en caché el SDK informa "no existe": no es una eliminación
      if (jornadaSnap.metadata?.fromCache) return;
      const cambio = detectarEliminacion(anterior);
      if (!cambio) return;
      const registrada = await registrarNotificacion(jornadaId, cambio, {
        titulo: anterior.titulo || "",
        lugar: anterior.lugar || "",
        fecha: null,
      });
      if (registrada) recordar(jornadaId, null);
      return;
    }

    const datosActuales = jornadaSnap.data();
    const instantanea = instantaneaDeJornada(datosActuales);

    if (anterior) {
      const cambio = detectarCambioJornada(anterior, datosActuales);
      if (cambio) {
        const registrada = await registrarNotificacion(jornadaId, cambio, {
          titulo: datosActuales.titulo || "",
          lugar: datosActuales.lugar || "",
          fecha: datosActuales.fecha || null,
        });
        // Si no se pudo avisar se conserva el estado anterior: se reintenta en la próxima lectura
        if (!registrada) return;
      }
    }

    if (!mismaInstantanea(anterior, instantanea)) recordar(jornadaId, instantanea);
  };

  // El estado conocido debe cargarse ANTES de procesar la primera lectura del servidor
  (async () => {
    // Del servidor; sin conexión, la copia local de la última vez
    const remoto = await leerEstadoVistoRemoto(userId);
    if (remoto) {
      estadoVisto = remoto;
      guardarLocal(userId, "estadoVisto", remoto);
    } else {
      estadoVisto = (await leerLocal(userId, "estadoVisto", null)) || {};
    }
    if (!activo) return;

    // 1. Escuchar inscripciones del usuario
    desuscribirInscripciones = onSnapshot(
      query(collection(db, "inscripciones"), where("userId", "==", userId)),
      (snapInscripciones) => {
        // Sin conexión y sin datos en caché el SDK entrega una lista vacía: no es "sin inscripciones"
        if (!activo || (snapInscripciones.metadata?.fromCache && snapInscripciones.empty)) return;

        const jornadaIds = [
          ...new Set(snapInscripciones.docs.map((d) => d.data().jornadaId).filter(Boolean)),
        ];

        // Limpiar oyentes anteriores de jornadas
        desuscribirJornadas.forEach((unsub) => unsub());
        desuscribirJornadas = [];

        // Se olvidan las jornadas en las que ya no está inscrito
        if (!snapInscripciones.metadata?.fromCache) {
          enSerie(async () => {
            for (const id of Object.keys(estadoVisto)) {
              if (!jornadaIds.includes(id)) recordar(id, null);
            }
          });
        }

        // 2. Escuchar cada jornada a la que el usuario está inscrito
        jornadaIds.forEach((jornadaId) => {
          const unsub = onSnapshot(
            doc(db, "jornadas", jornadaId),
            (jornadaSnap) => enSerie(() => procesarJornada(jornadaId, jornadaSnap)),
            (err) => {
              console.warn(`Error en snapshot de jornada ${jornadaId}:`, err);
            }
          );
          desuscribirJornadas.push(unsub);
        });
      },
      (err) => {
        console.warn("Error en snapshot de inscripciones:", err);
      }
    );
  })();

  return () => {
    activo = false;
    desuscribirInscripciones();
    desuscribirJornadas.forEach((unsub) => unsub());
  };
}

/**
 * Marca una notificación como leída
 */
export async function marcarNotificacionLeida(notificacionId) {
  try {
    if (usaApi("notificaciones")) {
      await llamarApi("PATCH", `/v1/me/notificaciones/${encodeURIComponent(notificacionId)}`, { cuerpo: { leida: true } });
      return;
    }
    await updateDoc(doc(db, "notificaciones", notificacionId), {
      leida: true,
      leidaEn: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error al marcar notificación como leída:", error);
    throw error;
  }
}

/**
 * Marca todas las notificaciones de un usuario como leídas
 */
export async function marcarTodasNotificacionesLeidas(notificaciones) {
  try {
    const noLeidas = notificaciones.filter((n) => !n.leida);
    if (usaApi("notificaciones")) {
      if (noLeidas.length > 0) {
        await llamarApi("POST", "/v1/me/notificaciones/leer-todas", { cuerpo: { ids: noLeidas.map((n) => n.id) } });
      }
      return;
    }
    await Promise.all(
      noLeidas.map((n) =>
        updateDoc(doc(db, "notificaciones", n.id), {
          leida: true,
          leidaEn: serverTimestamp(),
        })
      )
    );
  } catch (error) {
    console.error("Error marcando todas como leídas:", error);
    throw error;
  }
}

/**
 * Elimina una notificación
 */
export async function eliminarNotificacion(notificacionId) {
  try {
    if (usaApi("notificaciones")) {
      await llamarApi("DELETE", `/v1/me/notificaciones/${encodeURIComponent(notificacionId)}`);
      return;
    }
    await deleteDoc(doc(db, "notificaciones", notificacionId));
  } catch (error) {
    console.error("Error al eliminar notificación:", error);
    throw error;
  }
}

