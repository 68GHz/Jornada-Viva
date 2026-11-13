import { auth } from "../../firebaseConfig";
import { API_URL } from "../config/api";
import { crearClienteApi } from "./apiClientCore";

export { ErrorApi } from "./apiClientCore";

// Único punto de salida hacia la API: añade el ID token de Firebase Auth a cada solicitud.
const cliente = crearClienteApi({
  url: API_URL,
  obtenerToken: () => {
    if (!auth.currentUser) throw Object.assign(new Error("Sin sesión"), { code: "auth/no-user" });
    return auth.currentUser.getIdToken();
  },
});

// llamarApi("PUT", "/v1/jornadas/abc/inscripcion", { cuerpo: {...} })
export const llamarApi = cliente.llamar;
