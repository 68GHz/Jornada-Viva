import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useConnectivity } from "../context/ConnectivityContext";
import { normalizarJornada } from "../utils/jornadaFecha";
import { normalizarRol } from "../utils/roles";
import { mensajeErrorAdmin } from "../services/adminService";
import { llamarApi } from "../services/apiClient";

// Escucha en tiempo real una consulta del administrador. Sin conexión no se queda cargando.
function useColeccion(construirConsulta, convertir, clave, habilitado = true) {
  const { enLinea } = useConnectivity();
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  // Cambiar este contador vuelve a abrir la escucha (reintentar tras un error)
  const [intento, setIntento] = useState(0);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    if (!habilitado) {
      setCargando(false);
      return undefined;
    }
    setCargando(true);
    return onSnapshot(
      construirConsulta(),
      (snapshot) => {
        setDatos(snapshot.docs.map((d) => convertir(d)));
        setError(null);
        setCargando(false);
      },
      (err) => {
        console.warn(`No se pudo leer ${clave}:`, err);
        setError(mensajeErrorAdmin(err));
        setCargando(false);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, habilitado, intento]);

  useEffect(() => {
    if (!enLinea) setCargando(false);
  }, [enLinea]);

  return { datos, cargando, error, enLinea, reintentar };
}

// Lectura de una lista del administrador por la API. Las cuentas y la auditoría ya no se leen
// directo de Firestore: el servidor las entrega solo a un administrador activo. Se piden al abrir la
// pantalla, cada vez que vuelve a primer plano y cada 30 s mientras está a la vista (ya no hay
// actualización en vivo). `reintentar` vuelve a pedirlas. Sin conexión no se queda cargando.
const REFRESCO_MS = 30000;
function useListaApi(ruta, extraer, habilitado = true) {
  const { enLinea } = useConnectivity();
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(!!habilitado);
  const [error, setError] = useState(null);
  const extraerRef = useRef(extraer);
  extraerRef.current = extraer;

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!habilitado) return;
      if (!silencioso) setCargando(true);
      try {
        setDatos(extraerRef.current(await llamarApi("GET", ruta)));
        setError(null);
      } catch (err) {
        console.warn(`No se pudo leer ${ruta}:`, err);
        setError(mensajeErrorAdmin(err));
      } finally {
        setCargando(false);
      }
    },
    [habilitado, ruta]
  );

  useFocusEffect(
    useCallback(() => {
      if (!habilitado || !enLinea) {
        setCargando(false);
        return undefined;
      }
      cargar();
      const temporizador = setInterval(() => cargar(true), REFRESCO_MS);
      return () => clearInterval(temporizador);
    }, [habilitado, enLinea, cargar])
  );

  return { datos, cargando, error, enLinea, reintentar: () => cargar(true) };
}

// Todos los usuarios (solo el administrador puede listarlos)
export function useUsuarios(habilitado = true) {
  const r = useListaApi(
    "/v1/admin/usuarios",
    (resp) => resp.usuarios.map((u) => ({ ...u, rol: normalizarRol(u.rol) })),
    habilitado
  );
  return { usuarios: r.datos, cargando: r.cargando, error: r.error, enLinea: r.enLinea, reintentar: r.reintentar };
}

// Todas las jornadas de la plataforma; `gestorId` limita a las asignadas a un gestor
export function useTodasJornadas(gestorId = null, habilitado = true) {
  const r = useColeccion(
    () =>
      gestorId
        ? query(collection(db, "jornadas"), where("creadoPor", "==", gestorId))
        : collection(db, "jornadas"),
    (d) => normalizarJornada(d.id, d.data()),
    `jornadas:${gestorId || "todas"}`,
    habilitado
  );
  return { jornadas: r.datos, cargando: r.cargando, error: r.error, enLinea: r.enLinea, reintentar: r.reintentar };
}

// Últimos registros de auditoría
export function useAuditoria(maximo = 100) {
  const r = useListaApi(`/v1/admin/auditoria?limite=${maximo}`, (resp) => resp.registros);
  return { registros: r.datos, cargando: r.cargando, error: r.error, enLinea: r.enLinea, reintentar: r.reintentar };
}

// Estadísticas globales calculadas por la API (módulo "reportes"): se piden al abrir la pantalla
// y cada vez que vuelve la conexión. `habilitado` false = no hace nada (se usa la lógica local).
export function useEstadisticasApi(habilitado) {
  const { enLinea } = useConnectivity();
  const [estadisticas, setEstadisticas] = useState(null);
  const [cargando, setCargando] = useState(!!habilitado);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    if (!habilitado) return;
    setCargando(true);
    try {
      setEstadisticas(await llamarApi("GET", "/v1/admin/estadisticas"));
      setError(null);
    } catch (err) {
      console.warn("No se pudieron leer las estadísticas:", err);
      setError(mensajeErrorAdmin(err));
    } finally {
      setCargando(false);
    }
  }, [habilitado]);

  useEffect(() => {
    if (enLinea) recargar();
    else setCargando(false);
  }, [recargar, enLinea]);

  return { estadisticas, cargando, error, enLinea, recargar };
}
