const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * AVISO: esta función NO está desplegada (requiere el plan Blaze). Hoy la propia app genera
 * los avisos de cambios de jornada (src/services/jornadaEventService.js) comparando con el
 * estado visto guardado en users/{uid}.jornadasVistas. Si se despliega, hay que desactivar
 * esa creación en la app (o deduplicar) para que el estudiante no reciba cada aviso dos veces.
 * Esta función tampoco cubre la eliminación de jornadas.
 *
 * Función que detecta cambios directos en la colección `jornadas` en Firestore.
 * Cuando una jornada es modificada directamente en Firestore:
 * - Detecta Cancelación (activa pasa de true a false).
 * - Detecta Reprogramación (fecha cambia).
 * - Detecta Actualización general (descripcion, lugar, titulo, responsable).
 *
 * Busca a los usuarios inscritos en `inscripciones` y:
 * 1. Crea un documento individual en `notificaciones` para cada usuario inscrito.
 * 2. Si el usuario tiene un pushToken registrado en `users/{userId}`, le envía una notificación Push por Expo.
 */
exports.onJornadaUpdated = functions.firestore
  .document("jornadas/{jornadaId}")
  .onUpdate(async (change, context) => {
    const jornadaId = context.params.jornadaId;
    const antes = change.before.data();
    const despues = change.after.data();

    // 1. Ignorar cambios que sean únicamente de cupos o irrelevantes
    // (cuposOcupados, cuposTotales, etc.)
    const camposRelevantes = [
      "activa",
      "fecha",
      "descripcion",
      "lugar",
      "titulo",
      "responsable",
      "entidad",
    ];

    let huboCambioRelevante = false;
    for (const campo of camposRelevantes) {
      if (campo === "fecha") {
        const fechaAntes = antes.fecha ? antes.fecha.toMillis() : null;
        const fechaDespues = despues.fecha ? despues.fecha.toMillis() : null;
        if (fechaAntes !== fechaDespues) {
          huboCambioRelevante = true;
          break;
        }
      } else if (antes[campo] !== despues[campo]) {
        huboCambioRelevante = true;
        break;
      }
    }

    if (!huboCambioRelevante) {
      return null;
    }

    // Desactivar una jornada ya vencida (lo hace la app al pasar la fecha) no es una cancelación
    if (
      antes.activa === true &&
      despues.activa === false &&
      despues.fecha &&
      despues.fecha.toMillis() <= Date.now()
    ) {
      return null;
    }

    // 2. Determinar el tipo de evento y el mensaje
    let tipoEvento = "actualizacion";
    let tituloNotif = `Actualización: ${despues.titulo || "Jornada"}`;
    let mensajeNotif = "";

    const fechaAntesMillis = antes.fecha ? antes.fecha.toMillis() : null;
    const fechaDespuesMillis = despues.fecha ? despues.fecha.toMillis() : null;

    if (antes.activa === true && despues.activa === false) {
      tipoEvento = "cancelacion";
      tituloNotif = `Jornada cancelada: ${despues.titulo}`;
      mensajeNotif = `La jornada "${despues.titulo}" ha sido cancelada por el organizador.`;
    } else if (antes.activa === false && despues.activa === true) {
      tipoEvento = "reactivacion";
      tituloNotif = `Jornada reactivada: ${despues.titulo}`;
      mensajeNotif = `La jornada "${despues.titulo}" volvió a estar disponible. Revisa los detalles en la app.`;
    } else if (fechaAntesMillis !== fechaDespuesMillis) {
      tipoEvento = "reprogramacion";
      tituloNotif = `Jornada reprogramada: ${despues.titulo}`;
      mensajeNotif = `La fecha de "${despues.titulo}" ha cambiado. Revisa los nuevos detalles en la app.`;
    } else {
      tipoEvento = "actualizacion";
      tituloNotif = `Jornada actualizada: ${despues.titulo}`;
      const cambios = [];
      if (antes.lugar !== despues.lugar) cambios.push("lugar");
      if (antes.descripcion !== despues.descripcion) cambios.push("descripción");
      if (antes.responsable !== despues.responsable) cambios.push("responsable");
      if (antes.titulo !== despues.titulo) cambios.push("título");

      mensajeNotif = `Se actualizaron datos (${cambios.join(", ") || "información general"}) en "${despues.titulo}".`;
    }

    // 3. Consultar usuarios inscritos en la jornada
    const inscripcionesSnap = await db
      .collection("inscripciones")
      .where("jornadaId", "==", jornadaId)
      .get();

    if (inscripcionesSnap.empty) {
      return null;
    }

    const userIds = [...new Set(inscripcionesSnap.docs.map((doc) => doc.data().userId))];

    // 4. Crear las notificaciones internas para cada usuario
    const batch = db.batch();
    const notificacionesRef = db.collection("notificaciones");
    const pushTokensToSend = [];

    for (const userId of userIds) {
      // Usamos un identificador idempotente basado en jornadaId, tipoEvento y timestamp
      const notifRef = notificacionesRef.doc();
      batch.set(notifRef, {
        userId,
        jornadaId,
        tipo: tipoEvento,
        titulo: tituloNotif,
        mensaje: mensajeNotif,
        leida: false,
        creadaEn: admin.firestore.FieldValue.serverTimestamp(),
        datosJornada: {
          titulo: despues.titulo || "",
          lugar: despues.lugar || "",
          fecha: despues.fecha || null,
        },
      });

      // Obtener push token del usuario
      try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists && userDoc.data().pushToken) {
          pushTokensToSend.push(userDoc.data().pushToken);
        }
      } catch (err) {
        console.error(`Error obteniendo pushToken de usuario ${userId}:`, err);
      }
    }

    await batch.commit();

    // 5. Enviar push notifications a través de Expo Push API
    if (pushTokensToSend.length > 0) {
      await enviarPushNotificationsExpo(pushTokensToSend, tituloNotif, mensajeNotif, {
        jornadaId,
        tipo: tipoEvento,
      });
    }

    return null;
  });

/**
 * Función auxiliar para enviar notificaciones Push a Expo
 */
async function enviarPushNotificationsExpo(tokens, title, body, data) {
  const messages = tokens.map((pushToken) => ({
    to: pushToken,
    sound: "default",
    title,
    body,
    data,
  }));

  try {
    const fetch = require("node-fetch");
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.error("Error enviando push notifications a Expo:", err);
  }
}

