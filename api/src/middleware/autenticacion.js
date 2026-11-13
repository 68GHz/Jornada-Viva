import { noAutenticado, ErrorApi, sinPermiso } from "../errores.js";
import { esAdministrador, esGestor, normalizarRol } from "../dominio/roles.js";

// Verifica el ID token de Firebase Auth (cabecera `Authorization: Bearer <token>`), lee el perfil
// `users/{uid}` y deja en `req.usuario` { uid, email, perfil, rol, nombre }.
//
// Mismas reglas que firestore.rules (`usuarioActivo`): una cuenta con `activo: false` no puede
// operar, y quien aún no tiene perfil (acaba de registrarse) se trata como estudiante activo.
export function autenticar({ db, verificarToken }) {
  return async (req, _res, next) => {
    try {
      const cabecera = req.get("authorization") || "";
      const token = /^Bearer\s+(.+)$/i.exec(cabecera)?.[1];
      if (!token) throw noAutenticado();

      let decodificado;
      try {
        decodificado = await verificarToken(token);
      } catch {
        throw noAutenticado("La sesión no es válida o expiró. Inicia sesión de nuevo.");
      }

      const snap = await db.collection("users").doc(decodificado.uid).get();
      const perfil = snap.exists ? snap.data() : null;
      if (perfil?.activo === false) {
        throw new ErrorApi(
          403,
          "CUENTA_DESACTIVADA",
          "Tu cuenta fue desactivada por un administrador."
        );
      }
      req.usuario = {
        uid: decodificado.uid,
        email: decodificado.email || perfil?.email || "",
        perfil,
        rol: normalizarRol(perfil?.rol),
        nombre: perfil?.nombre || decodificado.name || "",
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

const exigir = (permitido, mensaje) => (req, _res, next) =>
  permitido(req.usuario.rol) ? next() : next(sinPermiso(mensaje));

export const soloAdministrador = exigir(esAdministrador, "Solo un administrador puede realizar esta acción.");
export const soloGestorOAdministrador = exigir(
  (rol) => esGestor(rol) || esAdministrador(rol),
  "Solo un gestor de jornadas o un administrador puede realizar esta acción."
);
