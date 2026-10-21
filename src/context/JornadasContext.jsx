import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useAuth } from "./AuthContext";
import { useConnectivity } from "./ConnectivityContext";
import { useSync } from "./SyncContext";
import { fechaAMillis, normalizarJornada } from "../utils/jornadaFecha";
import {
  jornadaDisponible,
  jornadaVencidaActiva,
  construirMisJornadas,
  ajustarCupos,
  aplicarPendientesAInscripciones,
} from "../utils/jornadaEstado";
import { TIPOS } from "../utils/sincronizacion";
import { desactivarJornadas } from "../services/jornadaEstadoService";
import { guardarLocal, leerLocal } from "../services/localStore";

const JornadasContext = createContext(null);

// Cada cuánto se reevalúa el vencimiento mientras la app está abierta
const INTERVALO_VENCIMIENTO_MS = 60 * 1000;
// Si no llega nada del servidor en este tiempo, se muestra lo que haya (nunca carga infinita)
const ESPERA_MAXIMA_MS = 10 * 1000;

// Única fuente de verdad de las jornadas: todas las pantallas leen de aquí, así
// que activar, desactivar o vencer una jornada se refleja en todas a la vez.
//
// Modo offline: al iniciar se carga lo último guardado en AsyncStorage y, cuando
// el servidor responde, se actualiza y se vuelve a guardar. Las acciones
// pendientes de sincronizar se superponen para que el usuario vea su efecto.
export function JornadasProvider({ children }) {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const { pendientesPorJornada, registrarSync } = useSync();
  const uid = usuario?.uid;

  const [jornadas, setJornadas] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [jornadasListas, setJornadasListas] = useState(false);
  const [inscripcionesListas, setInscripcionesListas] = useState(false);
  const [hidratado, setHidratado] = useState(false);
  const [error, setError] = useState(null);
  const [clave, setClave] = useState(0);
  const [ahora, setAhora] = useState(Date.now());

  const esperaRecarga = useRef(null);
  const desactivacionesIntentadas = useRef(new Set());
  // Datos que ya llegaron del servidor (la caché local no debe pisarlos)
  const delServidor = useRef({ jornadas: false, inscripciones: false });

  // Reinicia el estado al cambiar de usuario (o cerrar sesión)
  useEffect(() => {
    setJornadas([]);
    setInscripciones([]);
    setJornadasListas(false);
    setInscripcionesListas(false);
    setHidratado(false);
    setError(null);
    delServidor.current = { jornadas: false, inscripciones: false };
    desactivacionesIntentadas.current.clear();
  }, [uid]);

  // Carga lo último guardado en el dispositivo para poder operar sin conexión
  useEffect(() => {
    if (!uid) return;
    let activo = true;
    (async () => {
      const [guardadasJ, guardadasI] = await Promise.all([
        leerLocal(uid, "jornadas", null),
        leerLocal(uid, "inscripciones", null),
      ]);
      if (!activo) return;
      if (guardadasJ?.datos && !delServidor.current.jornadas) {
        setJornadas(guardadasJ.datos);
        setJornadasListas(true);
      }
      if (guardadasI?.datos && !delServidor.current.inscripciones) {
        setInscripciones(guardadasI.datos);
        setInscripcionesListas(true);
      }
      setHidratado(true);
    })();
    return () => {
      activo = false;
    };
  }, [uid]);

  // Sin conexión (o servidor sin responder) no se espera indefinidamente:
  // se muestra lo guardado, o un estado vacío si no hay nada.
  useEffect(() => {
    if (!uid || !hidratado) return;
    const terminarCarga = () => {
      setJornadasListas(true);
      setInscripcionesListas(true);
    };
    if (!enLinea) {
      terminarCarga();
      return;
    }
    const temporizador = setTimeout(terminarCarga, ESPERA_MAXIMA_MS);
    return () => clearTimeout(temporizador);
  }, [uid, hidratado, enLinea]);

  // Reloj para reevaluar vencimientos sin necesidad de salir de la pantalla
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), INTERVALO_VENCIMIENTO_MS);
    return () => clearInterval(id);
  }, []);

  // Listeners en tiempo real: jornadas e inscripciones del usuario
  useEffect(() => {
    if (!uid) return;

    const terminarRecarga = () => {
      esperaRecarga.current?.();
      esperaRecarga.current = null;
    };

    const detenerJornadas = onSnapshot(
      collection(db, "jornadas"),
      (snapshot) => {
        // Sin conexión y sin datos en la caché de Firestore llega un snapshot vacío:
        // no debe borrar lo que ya se muestra
        if (snapshot.metadata.fromCache && snapshot.empty) return;

        const datos = snapshot.docs.map((d) => normalizarJornada(d.id, d.data()));
        setJornadas(datos);
        setError(null);
        setJornadasListas(true);
        terminarRecarga();

        if (!snapshot.metadata.fromCache) {
          delServidor.current.jornadas = true;
          guardarLocal(uid, "jornadas", { datos, guardadoEn: Date.now() });
          registrarSync();
        }
      },
      (err) => {
        console.error("Error escuchando jornadas:", err);
        setError("No se pudieron cargar las jornadas. Verifica tu conexión.");
        setJornadasListas(true);
        terminarRecarga();
      }
    );

    const detenerInscripciones = onSnapshot(
      query(collection(db, "inscripciones"), where("userId", "==", uid)),
      (snapshot) => {
        if (snapshot.metadata.fromCache && snapshot.empty) return;

        // Solo lo necesario, con la fecha en milisegundos (serializable)
        const datos = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            jornadaId: data.jornadaId,
            tituloJornada: data.tituloJornada,
            fechaJornada: fechaAMillis(data.fechaJornada),
            asistio: !!data.asistio,
          };
        });
        setInscripciones(datos);
        setInscripcionesListas(true);

        if (!snapshot.metadata.fromCache) {
          delServidor.current.inscripciones = true;
          guardarLocal(uid, "inscripciones", { datos, guardadoEn: Date.now() });
        }
      },
      (err) => {
        console.error("Error escuchando inscripciones:", err);
        setError("No se pudieron cargar tus jornadas. Verifica tu conexión.");
        setInscripcionesListas(true);
      }
    );

    return () => {
      detenerJornadas();
      detenerInscripciones();
    };
  }, [uid, clave, registrarSync]);

  // Vencimiento: además de ocultarse, la jornada se desactiva en Firestore
  // para que el estado persistido coincida con lo que ve el usuario.
  // Sin conexión se omite (queda oculta igualmente) y se hace al reconectar.
  useEffect(() => {
    if (!uid || !jornadasListas || !enLinea) return;

    const ids = jornadas
      .filter(
        (j) =>
          jornadaVencidaActiva(j, ahora) &&
          !desactivacionesIntentadas.current.has(j.id)
      )
      .map((j) => j.id);
    if (ids.length === 0) return;

    ids.forEach((id) => desactivacionesIntentadas.current.add(id));
    desactivarJornadas(ids).catch((err) => {
      // Se mantiene oculta en la app aunque no se pueda persistir
      console.warn("No se pudieron desactivar las jornadas vencidas:", err);
    });
  }, [uid, jornadas, jornadasListas, ahora, enLinea]);

  // Lo que ve el usuario: datos del servidor + efecto de sus acciones pendientes
  const jornadasEfectivas = useMemo(
    () => ajustarCupos(jornadas, pendientesPorJornada),
    [jornadas, pendientesPorJornada]
  );

  const jornadasPorId = useMemo(
    () => new Map(jornadasEfectivas.map((j) => [j.id, j])),
    [jornadasEfectivas]
  );

  // Listado público: activas y no vencidas, la más próxima primero
  const jornadasDisponibles = useMemo(
    () =>
      jornadasEfectivas
        .filter((j) => jornadaDisponible(j, ahora))
        .sort((a, b) => a.fecha - b.fecha),
    [jornadasEfectivas, ahora]
  );

  const misJornadas = useMemo(
    () =>
      construirMisJornadas(
        aplicarPendientesAInscripciones(inscripciones, pendientesPorJornada),
        jornadasPorId,
        ahora
      ),
    [inscripciones, pendientesPorJornada, jornadasPorId, ahora]
  );

  const inscritasEnServidor = useMemo(
    () => new Set(inscripciones.map((i) => i.jornadaId)),
    [inscripciones]
  );

  // Estado de inscripción del usuario en una jornada, incluyendo lo pendiente de sincronizar
  const estadoInscripcion = useCallback(
    (jornadaId) => {
      const pendiente = pendientesPorJornada.get(jornadaId)?.tipo ?? null;
      const inscrito =
        pendiente === TIPOS.INSCRIBIR
          ? true
          : pendiente === TIPOS.CANCELAR
          ? false
          : inscritasEnServidor.has(jornadaId);
      return { inscrito, pendiente };
    },
    [pendientesPorJornada, inscritasEnServidor]
  );

  // Vuelve a suscribirse y resuelve cuando llegan los datos (pull to refresh)
  const recargar = useCallback(
    () =>
      new Promise((resolve) => {
        if (!enLinea) {
          resolve();
          return;
        }
        desactivacionesIntentadas.current.clear();
        const temporizador = setTimeout(resolve, ESPERA_MAXIMA_MS);
        esperaRecarga.current = () => {
          clearTimeout(temporizador);
          resolve();
        };
        setClave((c) => c + 1);
      }),
    [enLinea]
  );

  const cargando = !!uid && !(jornadasListas && inscripcionesListas);

  return (
    <JornadasContext.Provider
      value={{
        jornadasDisponibles,
        misJornadas,
        jornadasPorId,
        estadoInscripcion,
        cargando,
        error,
        ahora,
        recargar,
      }}
    >
      {children}
    </JornadasContext.Provider>
  );
}

export const useJornadas = () => {
  const context = useContext(JornadasContext);
  if (!context) {
    throw new Error("useJornadas debe usarse dentro de un JornadasProvider");
  }
  return context;
};
