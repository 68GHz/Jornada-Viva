import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useConnectivity } from "../context/ConnectivityContext";
import { normalizarJornada } from "../utils/jornadaFecha";
import { ordenarParaMaestro } from "../utils/estadoJornada";
import { esPropietario } from "../utils/roles";
import { obtenerInscritos, mensajeDeError } from "../services/jornadaAdminService";

// Reloj para que una jornada pase a "Finalizada" sin salir de la pantalla
function useAhora(intervaloMs = 60000) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}

// Las jornadas creadas por el maestro con sesión iniciada (en tiempo real).
// La consulta ya filtra por `creadoPor`; firestore.rules protege lo demás.
export function useJornadasMaestro() {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const uid = usuario?.uid;
  const ahora = useAhora();

  const [jornadas, setJornadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) return;
    setCargando(true);
    const detener = onSnapshot(
      query(collection(db, "jornadas"), where("creadoPor", "==", uid)),
      (snapshot) => {
        setJornadas(snapshot.docs.map((d) => normalizarJornada(d.id, d.data())));
        setError(null);
        setCargando(false);
      },
      (err) => {
        console.warn("No se pudieron leer las jornadas del maestro:", err);
        setError(mensajeDeError(err));
        setCargando(false);
      }
    );
    return detener;
  }, [uid]);

  // Sin conexión no se queda cargando indefinidamente
  useEffect(() => {
    if (!enLinea) setCargando(false);
  }, [enLinea]);

  const ordenadas = useMemo(() => ordenarParaMaestro(jornadas, ahora), [jornadas, ahora]);
  return { jornadas: ordenadas, cargando, error, ahora };
}

// Una jornada concreta, en tiempo real, indicando si es del maestro con sesión iniciada.
// Aunque alguien abra una jornada ajena (p. ej. manipulando los parámetros de
// navegación), `propia` es false y la pantalla no ofrece ninguna acción; además,
// firestore.rules rechaza cualquier escritura o lectura de inscritos que no sea suya.
export function useJornadaMaestro(jornadaId) {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const uid = usuario?.uid;
  const ahora = useAhora();

  const [jornada, setJornada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [noExiste, setNoExiste] = useState(false);

  useEffect(() => {
    if (!jornadaId) {
      setCargando(false);
      setNoExiste(true);
      return;
    }
    setCargando(true);
    const detener = onSnapshot(
      doc(db, "jornadas", jornadaId),
      (snapshot) => {
        if (snapshot.metadata.fromCache && !snapshot.exists()) return;
        setNoExiste(!snapshot.exists());
        setJornada(snapshot.exists() ? normalizarJornada(snapshot.id, snapshot.data()) : null);
        setCargando(false);
      },
      (err) => {
        console.warn("No se pudo leer la jornada:", err);
        setNoExiste(true);
        setCargando(false);
      }
    );
    return detener;
  }, [jornadaId]);

  useEffect(() => {
    if (!enLinea) setCargando(false);
  }, [enLinea]);

  return { jornada, cargando, noExiste, propia: esPropietario(jornada, uid), ahora };
}

// Estudiantes inscritos en una jornada propia (se carga bajo demanda)
export function useInscritos(jornadaId, habilitado) {
  const [inscritos, setInscritos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    if (!jornadaId || !habilitado) return;
    setCargando(true);
    setError(null);
    try {
      setInscritos(await obtenerInscritos(jornadaId));
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }, [jornadaId, habilitado]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { inscritos, cargando, error, recargar };
}
