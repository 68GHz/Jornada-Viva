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
import { normalizarJornada } from "../utils/jornadaFecha";
import {
  jornadaDisponible,
  jornadaVencidaActiva,
  construirMisJornadas,
} from "../utils/jornadaEstado";
import { desactivarJornadas } from "../services/jornadaEstadoService";

const JornadasContext = createContext(null);

// Cada cuánto se reevalúa el vencimiento mientras la app está abierta
const INTERVALO_VENCIMIENTO_MS = 60 * 1000;

// Única fuente de verdad de las jornadas: todas las pantallas leen de aquí, así
// que activar, desactivar o vencer una jornada se refleja en todas a la vez.
export function JornadasProvider({ children }) {
  const { usuario } = useAuth();
  const uid = usuario?.uid;

  const [jornadas, setJornadas] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [jornadasListas, setJornadasListas] = useState(false);
  const [inscripcionesListas, setInscripcionesListas] = useState(false);
  const [error, setError] = useState(null);
  const [clave, setClave] = useState(0);
  const [ahora, setAhora] = useState(Date.now());

  const esperaRecarga = useRef(null);
  const desactivacionesIntentadas = useRef(new Set());

  // Reinicia el estado al cambiar de usuario (o cerrar sesión)
  useEffect(() => {
    setJornadas([]);
    setInscripciones([]);
    setJornadasListas(false);
    setInscripcionesListas(false);
    setError(null);
    desactivacionesIntentadas.current.clear();
  }, [uid]);

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
        setJornadas(snapshot.docs.map((d) => normalizarJornada(d.id, d.data())));
        setError(null);
        setJornadasListas(true);
        terminarRecarga();
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
        setInscripciones(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setInscripcionesListas(true);
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
  }, [uid, clave]);

  // Vencimiento: además de ocultarse, la jornada se desactiva en Firestore
  // para que el estado persistido coincida con lo que ve el usuario.
  useEffect(() => {
    if (!uid || !jornadasListas) return;

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
  }, [uid, jornadas, jornadasListas, ahora]);

  const jornadasPorId = useMemo(
    () => new Map(jornadas.map((j) => [j.id, j])),
    [jornadas]
  );

  // Listado público: activas y no vencidas, la más próxima primero
  const jornadasDisponibles = useMemo(
    () =>
      jornadas
        .filter((j) => jornadaDisponible(j, ahora))
        .sort((a, b) => a.fecha - b.fecha),
    [jornadas, ahora]
  );

  const misJornadas = useMemo(
    () => construirMisJornadas(inscripciones, jornadasPorId, ahora),
    [inscripciones, jornadasPorId, ahora]
  );

  // Vuelve a suscribirse y resuelve cuando llegan los datos (pull to refresh)
  const recargar = useCallback(
    () =>
      new Promise((resolve) => {
        desactivacionesIntentadas.current.clear();
        esperaRecarga.current = resolve;
        setClave((c) => c + 1);
      }),
    []
  );

  const cargando = !!uid && !(jornadasListas && inscripcionesListas);

  return (
    <JornadasContext.Provider
      value={{
        jornadasDisponibles,
        misJornadas,
        jornadasPorId,
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
