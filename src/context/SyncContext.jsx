import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { useConnectivity } from "./ConnectivityContext";
import { guardarLocal, leerLocal } from "../services/localStore";
import {
  actualizarAccion,
  cargarCola,
  encolarAccion,
  quitarAccion,
  recuperarInterrumpidas,
  reintentarAccion,
  suscribirCola,
} from "../services/syncQueueService";
import { procesarCola } from "../services/syncEngine";
import { ejecutarAccion } from "../services/inscripcionService";
import {
  DURACION_AVISO_CONEXION_MS,
  ESTADOS,
  accionActiva,
} from "../utils/sincronizacion";
import { mapaPendientes } from "../utils/jornadaEstado";

const SyncContext = createContext(null);

const describirRechazadas = (rechazadas) =>
  rechazadas
    .map((a) => `• ${a.tituloJornada || "Jornada"}: ${a.ultimoError}`)
    .join("\n");

export function SyncProvider({ children }) {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const uid = usuario?.uid;

  const [cola, setCola] = useState([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [ultimaSync, setUltimaSync] = useState(null);
  // Avisos de estado (ver elegirAviso): el de conexión dura DURACION_AVISO_CONEXION_MS
  const [avisoConexion, setAvisoConexion] = useState(null);
  const [errorSync, setErrorSync] = useState(false);

  const uidRef = useRef(uid);
  uidRef.current = uid;
  const enLineaRef = useRef(enLinea);
  enLineaRef.current = enLinea;
  const avisadas = useRef(new Set());
  const temporizadorAviso = useRef(null);
  const enLineaPrevia = useRef(enLinea);

  const ocultarAvisoConexion = useCallback(() => {
    clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = null;
    setAvisoConexion(null);
  }, []);

  // Cada cambio de conexión reemplaza al aviso anterior y reinicia su cuenta de 10 s
  const mostrarAvisoConexion = useCallback((tipo) => {
    clearTimeout(temporizadorAviso.current);
    setAvisoConexion(tipo);
    temporizadorAviso.current = setTimeout(() => {
      temporizadorAviso.current = null;
      setAvisoConexion(null);
    }, DURACION_AVISO_CONEXION_MS);
  }, []);

  useEffect(() => () => clearTimeout(temporizadorAviso.current), []);

  // Carga la cola y la última sincronización del usuario al iniciar sesión
  useEffect(() => {
    setCola([]);
    setUltimaSync(null);
    setErrorSync(false);
    avisadas.current.clear();
    if (!uid) return;

    let activo = true;
    (async () => {
      await recuperarInterrumpidas(uid);
      const [colaGuardada, meta] = await Promise.all([
        cargarCola(uid),
        leerLocal(uid, "meta", null),
      ]);
      if (!activo) return;
      setCola(colaGuardada);
      if (meta?.ultimaSync) setUltimaSync(meta.ultimaSync);
    })();

    const detener = suscribirCola((usuarioCola, nuevaCola) => {
      if (usuarioCola === uid) setCola(nuevaCola);
    });
    return () => {
      activo = false;
      detener();
    };
  }, [uid]);

  const registrarSync = useCallback((momento = Date.now()) => {
    const usuarioActual = uidRef.current;
    if (!usuarioActual) return;
    setUltimaSync(momento);
    guardarLocal(usuarioActual, "meta", { ultimaSync: momento });
  }, []);

  // Envía lo pendiente. Las acciones marcadas `interactiva` (el usuario espera la
  // respuesta en pantalla) no generan avisos aquí: la pantalla informa el resultado.
  // "Sincronizando datos" se muestra desde que empieza el primer envío hasta que el
  // ciclo completo termina (incluidas las acciones que se agreguen mientras tanto).
  const procesar = useCallback(
    async ({ forzar = false } = {}) => {
      const usuarioActual = uidRef.current;
      if (!usuarioActual) return null;

      const resumen = await procesarCola({
        uid: usuarioActual,
        ejecutar: (accion) => ejecutarAccion(usuarioActual, accion),
        forzar,
        alProcesar: (accion) => {
          // Si se perdió la conexión a mitad del ciclo, se detiene: lo que falta queda
          // guardado y el aviso "Sin conexión" sigue su curso
          if (!enLineaRef.current) return false;
          if (accion.interactiva) return true;
          // El aviso de sincronización toma el relevo del de conexión
          ocultarAvisoConexion();
          setErrorSync(false);
          setSincronizando(true);
          return true;
        },
        alTerminar: () => setSincronizando(false),
      });
      if (uidRef.current !== usuarioActual) return resumen;

      if (resumen.exitosas > 0) registrarSync();

      // Fallo por la red con conexión aparente: los datos siguen guardados y se
      // reintentarán solos. Sin conexión ya informa el aviso "Sin conexión".
      if (resumen.pausada && !resumen.pausadaPor?.interactiva && enLineaRef.current) {
        setErrorSync(true);
      }

      const nuevas = resumen.rechazadas.filter(
        (a) => !a.interactiva && !avisadas.current.has(a.id)
      );
      if (nuevas.length > 0) {
        nuevas.forEach((a) => avisadas.current.add(a.id));
        Alert.alert(
          "No se pudo completar una acción",
          `${describirRechazadas(nuevas)}\n\nPuedes revisarla en la sección de sincronización.`
        );
      }
      return resumen;
    },
    [registrarSync, ocultarAvisoConexion]
  );

  // Hay algo por enviar (pendiente o en pleno envío). Incluir "sincronizando" evita que
  // una acción que falla y vuelve a pendiente relance el envío sin esperar el reintento.
  const hayAcciones = cola.some(accionActiva);
  const hayAccionesRef = useRef(hayAcciones);
  hayAccionesRef.current = hayAcciones;

  // Avisos de conexión: solo cuando CAMBIA el estado (no al abrir la app con conexión)
  useEffect(() => {
    if (enLineaPrevia.current === enLinea) return;
    enLineaPrevia.current = enLinea;

    if (!enLinea) {
      setErrorSync(false);
      mostrarAvisoConexion("sin-conexion");
    } else if (hayAccionesRef.current) {
      // Hay cambios por enviar: "Sincronizando datos" toma el relevo (sin superponerse)
      ocultarAvisoConexion();
    } else {
      mostrarAvisoConexion("conectado");
    }
  }, [enLinea, mostrarAvisoConexion, ocultarAvisoConexion]);

  // Dispara el envío al recuperar la conexión o al aparecer acciones pendientes
  useEffect(() => {
    // forzar: al recuperar la conexión se reintenta ya, sin esperar la espera previa
    if (uid && enLinea && hayAcciones) procesar({ forzar: true });
  }, [uid, enLinea, hayAcciones, procesar]);

  // Reintento automático cuando vence la espera de una acción que falló por la red
  useEffect(() => {
    if (!uid || !enLinea) return;
    const proximos = cola
      .filter((a) => a.estado === ESTADOS.PENDIENTE && a.proximoIntento)
      .map((a) => a.proximoIntento);
    if (proximos.length === 0) return;

    const espera = Math.max(1000, Math.min(...proximos) - Date.now());
    const temporizador = setTimeout(() => procesar(), espera);
    return () => clearTimeout(temporizador);
  }, [uid, enLinea, cola, procesar]);

  // Al volver a la app desde segundo plano
  useEffect(() => {
    const suscripcion = AppState.addEventListener("change", (estado) => {
      if (estado === "active" && enLinea) procesar({ forzar: true });
    });
    return () => suscripcion.remove();
  }, [enLinea, procesar]);

  const encolar = useCallback(
    (datos) => encolarAccion(uidRef.current, datos),
    []
  );
  const reintentar = useCallback(async (id) => {
    await reintentarAccion(uidRef.current, id);
    avisadas.current.delete(id);
  }, []);
  const descartar = useCallback((id) => quitarAccion(uidRef.current, id), []);
  // Una acción interactiva que quedó pendiente pasa a informarse como cualquier otra
  const liberarAviso = useCallback(
    (id) => actualizarAccion(uidRef.current, id, { interactiva: false }),
    []
  );

  const pendientesPorJornada = useMemo(() => mapaPendientes(cola), [cola]);
  const pendientes = useMemo(() => cola.filter(accionActiva), [cola]);
  const rechazadas = useMemo(
    () => cola.filter((a) => a.estado === ESTADOS.RECHAZADA),
    [cola]
  );

  return (
    <SyncContext.Provider
      value={{
        cola,
        pendientes,
        rechazadas,
        pendientesPorJornada,
        sincronizando,
        ultimaSync,
        avisoConexion,
        errorSync,
        procesar,
        encolar,
        reintentar,
        descartar,
        liberarAviso,
        registrarSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync debe usarse dentro de un SyncProvider");
  }
  return context;
};
