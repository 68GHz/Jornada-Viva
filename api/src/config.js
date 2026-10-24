// Configuración por variables de entorno (nunca hay secretos en el repositorio).
//
//   PORT                       Puerto HTTP (por defecto 8080)
//   FIREBASE_PROJECT_ID        Proyecto de Firebase (jornadaviva-476ff)
//   FIREBASE_SERVICE_ACCOUNT   JSON (o JSON en base64) de la clave de la cuenta de servicio.
//                              Alternativa: GOOGLE_APPLICATION_CREDENTIALS = ruta del archivo.
//   CORS_ORIGINS               Orígenes web permitidos, separados por coma (vacío = ninguno;
//                              la app móvil no usa CORS)
//   MANTENIMIENTO_MINUTOS      Cada cuántos minutos se desactivan las jornadas vencidas (0 = no)
//   FIRESTORE_EMULATOR_HOST    Solo desarrollo/pruebas: usa el emulador en vez de producción
export function leerConfig(env = process.env) {
  const minutos = Number(env.MANTENIMIENTO_MINUTOS ?? 5);
  return {
    puerto: Number(env.PORT || 8080),
    proyecto: env.FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT || "",
    cuentaServicio: env.FIREBASE_SERVICE_ACCOUNT || "",
    origenesCors: String(env.CORS_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    mantenimientoMs: Number.isFinite(minutos) && minutos > 0 ? minutos * 60000 : 0,
  };
}
