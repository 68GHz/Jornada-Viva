import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { usaApi } from "../config/api";
import { llamarApi } from "./apiClient";

// Detectar si la app está corriendo dentro de Expo Go
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Constants.appOwnership === "expo";

let Notifications = null;

// En Expo Go (SDK 53+), el soporte de remote push notifications de expo-notifications fue removido
// Cargamos Notifications de manera segura si está disponible
try {
  Notifications = require("expo-notifications");

  // Configuración del manejador de notificaciones
  if (Notifications?.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (e) {
  console.log("expo-notifications no disponible en este entorno o no soportado en Expo Go.");
}

/**
 * Solicita permisos de notificaciones y registra el Push Token de Expo en Firestore para el usuario.
 * Si se ejecuta en Expo Go, se omite de forma transparente y segura sin romper la aplicación.
 * @param {string} userId - ID del usuario autenticado
 * @returns {Promise<string|null>} - Retorna el push token o null si no se pudo registrar
 */
export async function registrarPushNotifications(userId) {
  if (!userId) return null;

  // Si estamos en Expo Go en Android/iOS o expo-notifications no está disponible, no ejecutar registro remoto
  if (isExpoGo) {
    console.log(
      "[Notificaciones] Ejecutando en Expo Go: las notificaciones push remotas requieren Development Build (SDK 53+). El sistema funcionará con notificaciones internas en tiempo real en la app."
    );
    return null;
  }

  if (!Notifications) return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("No se otorgaron permisos para notificaciones push");
      return null;
    }

    // Configurar canal en Android
    if (Platform.OS === "android" && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Jornada Viva",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1A6B4A",
      });
    }

    let token = null;
    try {
      if (Notifications.getExpoPushTokenAsync) {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        token = tokenData?.data;
      }
    } catch (e) {
      console.log("Expo Push Token no disponible en este entorno:", e?.message);
    }

    if (token) {
      // Guardar el token en el perfil de Firestore del usuario
      if (usaApi("notificaciones")) {
        await llamarApi("PUT", "/v1/me/push-token", { cuerpo: { token } });
      } else {
        await updateDoc(doc(db, "users", userId), {
          pushToken: token,
          pushTokenActualizadoEn: new Date(),
        });
      }
    }

    return token;
  } catch (error) {
    console.error("Error al registrar notificaciones push:", error);
    return null;
  }
}

/**
 * Dispara una notificación local inmediata en el dispositivo si el entorno lo soporta
 */
export async function mostrarNotificacionLocal(titulo, cuerpo, datos = {}) {
  if (!Notifications?.scheduleNotificationAsync) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: titulo,
        body: cuerpo,
        data: datos,
        sound: true,
      },
      trigger: null, // trigger null = inmediata
    });
  } catch (error) {
    console.log("Error mostrando notificación local:", error?.message);
  }
}
