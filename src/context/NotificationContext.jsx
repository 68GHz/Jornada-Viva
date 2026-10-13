import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  escucharNotificacionesUsuario,
  iniciarSincronizadorJornadas,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
  eliminarNotificacion,
} from "../services/jornadaEventService";
import { registrarPushNotifications } from "../services/notificationService";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { usuario } = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidasCount, setNoLeidasCount] = useState(0);
  const [cargando, setCargando] = useState(true);

  // 1. Registro de push token cuando el usuario inicia sesión
  useEffect(() => {
    if (usuario?.uid) {
      registrarPushNotifications(usuario.uid);
    }
  }, [usuario?.uid]);

  // 2. Sincronizador de jornadas en tiempo real (detecta cambios en Firestore)
  useEffect(() => {
    if (!usuario?.uid) return;
    const detenerSincronizador = iniciarSincronizadorJornadas(usuario.uid);
    return () => {
      detenerSincronizador();
    };
  }, [usuario?.uid]);

  // 3. Listener en tiempo real para las notificaciones del usuario
  useEffect(() => {
    if (!usuario?.uid) {
      setNotificaciones([]);
      setNoLeidasCount(0);
      setCargando(false);
      return;
    }

    setCargando(true);
    const desuscribir = escucharNotificacionesUsuario(
      usuario.uid,
      (lista) => {
        setNotificaciones(lista);
        const sinLeer = lista.filter((n) => !n.leida).length;
        setNoLeidasCount(sinLeer);
        setCargando(false);
      },
      (error) => {
        console.error("Error cargando notificaciones:", error);
        setCargando(false);
      }
    );

    return () => {
      desuscribir();
    };
  }, [usuario?.uid]);

  const marcarComoLeida = async (id) => {
    try {
      await marcarNotificacionLeida(id);
    } catch (e) {
      console.error(e);
    }
  };

  const marcarTodasComoLeidas = async () => {
    try {
      await marcarTodasNotificacionesLeidas(notificaciones);
    } catch (e) {
      console.error(e);
    }
  };

  const borrarNotificacion = async (id) => {
    try {
      await eliminarNotificacion(id);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notificaciones,
        noLeidasCount,
        cargando,
        marcarComoLeida,
        marcarTodasComoLeidas,
        borrarNotificacion,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications debe usarse dentro de un NotificationProvider");
  }
  return context;
};

