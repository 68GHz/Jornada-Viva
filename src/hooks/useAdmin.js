import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { useConnectivity } from "../context/ConnectivityContext";
import { fechaAMillis, normalizarJornada } from "../utils/jornadaFecha";
import { normalizarRol } from "../utils/roles";
import { mensajeErrorAdmin } from "../services/adminService";

// Escucha en tiempo real una consulta del administrador. Sin conexión no se queda cargando.
function useColeccion(construirConsulta, convertir, clave, habilitado = true) {
  const { enLinea } = useConnectivity();
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

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
  }, [clave, habilitado]);

  useEffect(() => {
    if (!enLinea) setCargando(false);
  }, [enLinea]);

  return { datos, cargando, error, enLinea };
}

// Todos los usuarios (solo el administrador puede listarlos)
export function useUsuarios(habilitado = true) {
  const r = useColeccion(
    () => collection(db, "users"),
    (d) => {
      const x = d.data();
      return { id: d.id, ...x, rol: normalizarRol(x.rol), creadoEn: fechaAMillis(x.creadoEn) };
    },
    "users",
    habilitado
  );
  return { usuarios: r.datos, cargando: r.cargando, error: r.error, enLinea: r.enLinea };
}

// Todas las jornadas de la plataforma; `gestorId` limita a las asignadas a un gestor
export function useTodasJornadas(gestorId = null) {
  const r = useColeccion(
    () =>
      gestorId
        ? query(collection(db, "jornadas"), where("creadoPor", "==", gestorId))
        : collection(db, "jornadas"),
    (d) => normalizarJornada(d.id, d.data()),
    `jornadas:${gestorId || "todas"}`
  );
  return { jornadas: r.datos, cargando: r.cargando, error: r.error, enLinea: r.enLinea };
}

// Últimos registros de auditoría
export function useAuditoria(maximo = 100) {
  const r = useColeccion(
    () => query(collection(db, "auditoria"), orderBy("creadaEn", "desc"), limit(maximo)),
    (d) => ({ id: d.id, ...d.data(), creadaEn: fechaAMillis(d.data().creadaEn) }),
    `auditoria:${maximo}`
  );
  return { registros: r.datos, cargando: r.cargando, error: r.error, enLinea: r.enLinea };
}
