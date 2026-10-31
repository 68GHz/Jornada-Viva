import { llamarApi } from "./apiClient";
import { usaApi } from "../config/api";
import { mensajeDeRed } from "../utils/sincronizacion";

// FE-02 · Préstamo y devolución de objetos. Todo pasa por la API (el servidor decide y es el único
// que escribe). Registrar un préstamo y marcar una devolución exigen conexión; las listas se guardan
// en el dispositivo para poder consultarlas sin conexión (ver hooks/usePrestamos.js).
const ESPERA_MS = 15000;

function exigirApi() {
  if (!usaApi("prestamos")) {
    throw new Error("Los préstamos necesitan conexión con el servidor de Jornada Viva.");
  }
}

// Préstamos del propio estudiante
export async function pedirMisPrestamos() {
  exigirApi();
  return (await llamarApi("GET", "/v1/me/prestamos", { espera: ESPERA_MS })).prestamos;
}

// Préstamos que gestiona el usuario (el gestor, los que registró; el administrador, todos)
export async function pedirPrestamosGestionados() {
  exigirApi();
  return (await llamarApi("GET", "/v1/prestamos", { espera: ESPERA_MS })).prestamos;
}

// `datos`: { codigo, nombre, tipo, correo, vence (ms), nota? }. Devuelve { id }.
export function registrarPrestamo(datos) {
  exigirApi();
  return llamarApi("POST", "/v1/prestamos", { cuerpo: datos, espera: ESPERA_MS });
}

// Devuelve "devuelto" o "ya-devuelto" (repetirlo es seguro)
export async function marcarDevuelto(prestamoId) {
  exigirApi();
  const { resultado } = await llamarApi("POST", `/v1/prestamos/${encodeURIComponent(prestamoId)}/devolucion`, {
    espera: ESPERA_MS,
  });
  return resultado;
}

// Mensaje para el usuario según el error (los de negocio de la API ya vienen redactados)
export function mensajeDeErrorPrestamo(error) {
  if (error?.name === "ErrorRed") return mensajeDeRed(error);
  if (error?.code === "invalid-argument" && error.campos) {
    return Object.values(error.campos)[0] || "Revisa los datos e intenta de nuevo.";
  }
  if (error?.code === "permission-denied") return "No tienes permiso para realizar esta acción.";
  return error?.message || "No se pudo completar la operación. Intenta de nuevo.";
}
