import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../../firebaseConfig";
import { mostrarNotificacionLocal } from "./notificationService";

const STORAGE_KEY_SNAPSHOTS = "@jornadaviva_snapshots_v1";

/**
 * Normaliza y compara los datos de una jornada para determinar si hubo cambios importantes:
 * - Cancelación: 'activa' cambia a false
 * - Reprogramación: 'fecha' cambia
 * - Actualización: 'descripcion', 'lugar', 'titulo', 'responsable', 'entidad' cambian
 *
 * @param {Object} anterior - Datos guardados previamente
 * @param {Object} actual - Datos actuales recibidos de Firestore
 * @returns {Object|null} - Objeto con tipo, titulo y mensaje si hubo cambio relevante, null si no
 */
export function detectarCambioJornada(anterior, actual) {
  if (!anterior || !actual) return null;

  // 1. Cancelación
  if (anterior.activa === true && actual.activa === false) {
    return {
      tipo: "cancelacion",
      titulo: `Jornada cancelada: ${actual.titulo || "Jornada"}`,
      mensaje: `La jornada "${actual.titulo}" ha sido cancelada por el organizador.`,
    };
  }

  // 2. Reprogramación (cambio de fecha)
  const fechaAnt = anterior.fecha?.seconds || anterior.fecha || null;
  const fechaAct = actual.fecha?.seconds || actual.fecha || null;
  if (fechaAnt && fechaAct && fechaAnt !== fechaAct) {
    return {
      tipo: "reprogramacion",
      titulo: `Jornada reprogramada: ${actual.titulo || "Jornada"}`,
      mensaje: `La fecha y/o hora de "${actual.titulo}" han sido modificadas. Revisa los nuevos datos.`,
    };
  }

  // 3. Actualización general relevante
  const camposRevisar = [
    { campo: "lugar", etiqueta: "el lugar" },
    { campo: "descripcion", etiqueta: "la descripción" },
    { campo: "responsable", etiqueta: "el responsable" },
    { campo: "titulo", etiqueta: "el título" },
    { campo: "entidad", etiqueta: "la entidad" },
  ];

  const cambios = [];
  for (const { campo, etiqueta } of camposRevisar) {
    if (anterior[campo] !== undefined && actual[campo] !== undefined) {
      if (String(anterior[campo]).trim() !== String(actual[campo]).trim()) {
        cambios.push(etiqueta);
      }
    }
  }

  if (cambios.length > 0) {
    return {
      tipo: "actualizacion",
      titulo: `Jornada actualizada: ${actual.titulo || "Jornada"}`,
      mensaje: `Se ha modificado ${cambios.join(", ")} en la jornada "${actual.titulo}".`,
    };
  }

  // Si solo cambiaron cupos u otros datos internos, no notificar
  return null;
}

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
 * Sincronizador en tiempo real del lado del cliente:
 * Escucha las inscripciones del usuario y monitorea las jornadas asociadas directamente en Firestore.
 * Si un administrador edita la jornada en Firestore, este observador detecta la diferencia,
 * genera el registro persistente en `notificaciones` y muestra una notificación local de Expo.
 */
export function iniciarSincronizadorJornadas(userId) {
  if (!userId) return () => {};

  let desuscribirJornadas = [];
  let inscripcionesJornadaIds = new Set();
  let instantaneasGuardadas = {};

  // Cargar snapshots previos de almacenamiento local para persistencia entre sesiones
  AsyncStorage.getItem(`${STORAGE_KEY_SNAPSHOTS}_${userId}`)
    .then((val) => {
      if (val) {
        instantaneasGuardadas = JSON.parse(val);
      }
    })
    .catch(() => {});

  const guardarInstantaneas = (nuevas) => {
    instantaneasGuardadas = nuevas;
    AsyncStorage.setItem(
      `${STORAGE_KEY_SNAPSHOTS}_${userId}`,
      JSON.stringify(nuevas)
    ).catch(() => {});
  };

  // 1. Escuchar inscripciones del usuario
  const qInscripciones = query(
    collection(db, "inscripciones"),
    where("userId", "==", userId)
  );

  const unsubInscripciones = onSnapshot(
    qInscripciones,
    (snapInscripciones) => {
      const jornadaIds = [
        ...new Set(snapInscripciones.docs.map((d) => d.data().jornadaId).filter(Boolean)),
      ];
      inscripcionesJornadaIds = new Set(jornadaIds);

      // Limpiar oyentes anteriores de jornadas
      desuscribirJornadas.forEach((unsub) => unsub());
      desuscribirJornadas = [];

      // Si no tiene inscripciones, limpiar
      if (jornadaIds.length === 0) return;

      // 2. Escuchar cada jornada a la que el usuario está inscrito
      jornadaIds.forEach((jornadaId) => {
        const docRef = doc(db, "jornadas", jornadaId);
        const unsub = onSnapshot(
          docRef,
          async (jornadaSnap) => {
            if (!jornadaSnap.exists()) return;

            const datosActuales = jornadaSnap.data();
            const anterior = instantaneasGuardadas[jornadaId];

            if (anterior) {
              const cambio = detectarCambioJornada(anterior, datosActuales);
              if (cambio) {
                // Registrar notificación para el usuario en Firestore de forma idempotente
                const notifId = `${userId}_${jornadaId}_${cambio.tipo}_${Date.now()}`;
                try {
                  await setDoc(doc(db, "notificaciones", notifId), {
                    userId,
                    jornadaId,
                    tipo: cambio.tipo,
                    titulo: cambio.titulo,
                    mensaje: cambio.mensaje,
                    leida: false,
                    creadaEn: serverTimestamp(),
                    datosJornada: {
                      titulo: datosActuales.titulo || "",
                      lugar: datosActuales.lugar || "",
                      fecha: datosActuales.fecha || null,
                    },
                  });

                  // Disparar notificación local en el dispositivo
                  mostrarNotificacionLocal(cambio.titulo, cambio.mensaje, {
                    jornadaId,
                    tipo: cambio.tipo,
                  });
                } catch (e) {
                  console.error("Error registrando notificación:", e);
                }
              }
            }

            // Actualizar instantánea
            guardarInstantaneas({
              ...instantaneasGuardadas,
              [jornadaId]: {
                activa: datosActuales.activa !== undefined ? datosActuales.activa : true,
                fecha: datosActuales.fecha?.seconds || datosActuales.fecha || null,
                titulo: datosActuales.titulo || "",
                lugar: datosActuales.lugar || "",
                descripcion: datosActuales.descripcion || "",
                responsable: datosActuales.responsable || "",
                entidad: datosActuales.entidad || "",
              },
            });
          },
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

  return () => {
    unsubInscripciones();
    desuscribirJornadas.forEach((unsub) => unsub());
  };
}

/**
 * Marca una notificación como leída
 */
export async function marcarNotificacionLeida(notificacionId) {
  try {
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
    await deleteDoc(doc(db, "notificaciones", notificacionId));
  } catch (error) {
    console.error("Error al eliminar notificación:", error);
    throw error;
  }
}

