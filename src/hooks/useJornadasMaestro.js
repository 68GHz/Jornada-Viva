import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useConnectivity } from "../context/ConnectivityContext";
import { normalizarJornada } from "../utils/jornadaFecha";
import { ordenarParaMaestro } from "../utils/estadoJornada";
import { puedeAdministrarJornada } from "../utils/roles";
import { obtenerInscritos, mensajeDeError, esErrorDeConexion } from "../services/jornadaAdminService";
import { guardarLocal, leerLocal } from "../services/localStore";

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
  const { usuario, rol } = useAuth();
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

  return { jornada, cargando, noExiste, propia: puedeAdministrarJornada(rol, uid, jornada), ahora };
}

// Estudiantes inscritos en una jornada propia (se carga bajo demanda).
// La lista se guarda en el dispositivo (por usuario; se borra al cerrar sesión) cada vez que se
// descarga con conexión. Sin conexión se muestra esa copia, para poder marcar la asistencia aunque no
// haya señal; `guardadoEn` indica de cuándo es (null = datos recién descargados del servidor).
export function useInscritos(jornadaId, habilitado) {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const uid = usuario?.uid;
  const [inscritos, setInscritos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [guardadoEn, setGuardadoEn] = useState(null);

  const clave = `inscritos:${jornadaId}`;

  const mostrarGuardados = useCallback(async () => {
    const guardados = uid ? await leerLocal(uid, clave, null) : null;
    if (!guardados?.datos) return false;
    setInscritos(guardados.datos);
    setGuardadoEn(guardados.guardadoEn ?? null);
    return true;
  }, [uid, clave]);

  const recargar = useCallback(async () => {
    if (!jornadaId || !habilitado) return;
    setCargando(true);
    setError(null);
    try {
      // Sin conexión no se espera al servidor: se muestra lo guardado, o un mensaje claro
      if (!enLinea) {
        if (!(await mostrarGuardados())) {
          setInscritos([]);
          setError("Sin conexión. Abre esta jornada con internet al menos una vez para poder marcar la asistencia sin conexión.");
        }
        return;
      }
      const lista = await obtenerInscritos(jornadaId);
      setInscritos(lista);
      setGuardadoEn(null);
      if (uid) guardarLocal(uid, clave, { datos: lista, guardadoEn: Date.now() });
    } catch (err) {
      // La red falló al pedirlos: si hay una copia guardada, se usa en vez de dejar la pantalla vacía
      if (esErrorDeConexion(err) && (await mostrarGuardados())) return;
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }, [jornadaId, habilitado, enLinea, uid, clave, mostrarGuardados]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { inscritos, cargando, error, recargar, guardadoEn };
}
