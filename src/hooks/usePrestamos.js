import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useConnectivity } from "../context/ConnectivityContext";
import { guardarLocal, leerLocal } from "../services/localStore";
import { pedirMisPrestamos, pedirPrestamosGestionados, mensajeDeErrorPrestamo } from "../services/prestamoService";

// Lista de préstamos con copia en el dispositivo (por usuario; se borra al cerrar sesión): con conexión
// se descarga y se guarda; sin conexión, o si la red falla, se muestra la última copia y se avisa de
// cuándo es (`guardadoEn`). Nunca queda cargando indefinidamente sin red.
function usePrestamosGuardados(clave, pedir) {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const uid = usuario?.uid;
  const [prestamos, setPrestamos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [guardadoEn, setGuardadoEn] = useState(null);
  const pedirRef = useRef(pedir);
  pedirRef.current = pedir;

  const mostrarGuardados = useCallback(async () => {
    const guardados = uid ? await leerLocal(uid, clave, null) : null;
    if (!guardados?.datos) return false;
    setPrestamos(guardados.datos);
    setGuardadoEn(guardados.guardadoEn ?? null);
    return true;
  }, [uid, clave]);

  const recargar = useCallback(async () => {
    if (!uid) return;
    setCargando(true);
    setError(null);
    try {
      if (!enLinea) {
        if (!(await mostrarGuardados())) {
          setPrestamos([]);
          setError("Sin conexión y sin préstamos guardados en el dispositivo.");
        }
        return;
      }
      const lista = await pedirRef.current();
      setPrestamos(lista);
      setGuardadoEn(null);
      guardarLocal(uid, clave, { datos: lista, guardadoEn: Date.now() });
    } catch (err) {
      if (err?.name === "ErrorRed" && (await mostrarGuardados())) return;
      setError(mensajeDeErrorPrestamo(err));
    } finally {
      setCargando(false);
    }
  }, [uid, clave, enLinea, mostrarGuardados]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { prestamos, cargando, error, guardadoEn, recargar };
}

// Los préstamos del estudiante
export const useMisPrestamos = () => usePrestamosGuardados("prestamos:mios", pedirMisPrestamos);

// Los préstamos que gestiona el gestor o el administrador
export const usePrestamosGestionados = () => usePrestamosGuardados("prestamos:gestion", pedirPrestamosGestionados);
