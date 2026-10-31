// Configuración de la API de negocio. La app habla con la API solo si hay una URL configurada:
//
//   EXPO_PUBLIC_API_URL       Dirección base de la API (https://...). Vacía = lógica local anterior.
//   EXPO_PUBLIC_API_MODULOS   Módulos que usan la API, separados por coma (por defecto "todos"):
//                             sesion, inscripciones, jornadas, asistencia, prestamos, notificaciones, usuarios,
//                             reportes
//
// Cada módulo se puede apagar por separado: es el interruptor de recuperación de la migración
// (con el módulo apagado la app vuelve a la lógica local de antes, sin tocar el código).
export function crearConfigApi(env = {}) {
  const url = String(env.EXPO_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  const modulos = new Set(
    String(env.EXPO_PUBLIC_API_MODULOS || "todos")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
  );
  return {
    url,
    usaApi: (modulo) => !!url && (modulos.has("todos") || modulos.has(modulo)),
  };
}

const config = crearConfigApi({
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  EXPO_PUBLIC_API_MODULOS: process.env.EXPO_PUBLIC_API_MODULOS,
});

export const API_URL = config.url;
export const usaApi = config.usaApi;
