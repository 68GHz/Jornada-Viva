import { ANTIGUEDAD_MAX_CANCELACION_MS } from "./dominio/plazoCancelacion.js";
import { ANTIGUEDAD_MAX_ASISTENCIA_MS } from "./dominio/relojDiferido.js";

// Configuración por variables de entorno (nunca hay secretos en el repositorio).
//
//   PORT                       Puerto HTTP (por defecto 8080)
//   FIREBASE_PROJECT_ID        Proyecto de Firebase (jornadaviva-476ff)
//   FIREBASE_SERVICE_ACCOUNT   JSON (o JSON en base64) de la clave de la cuenta de servicio.
//                              Alternativa: GOOGLE_APPLICATION_CREDENTIALS = ruta del archivo.
//   CORS_ORIGINS               Orígenes web permitidos, separados por coma (vacío = ninguno;
//                              la app móvil no usa CORS)
//   MANTENIMIENTO_MINUTOS      Cada cuántos minutos se desactivan las jornadas vencidas (0 = no)
//   ASISTENCIA_SECRETO         (opcional) Secreto para firmar los códigos QR de asistencia. Si falta,
//                              se deriva de la clave de la cuenta de servicio (ver secreto.js)
//   CANCELACION_ANTIGUEDAD_MAX_HORAS  Antigüedad máxima (en horas) de una cancelación hecha sin
//                              conexión para que el servidor la valide con la hora en que se hizo
//                              (por defecto 168 = 7 días; ver dominio/plazoCancelacion.js)
//   ASISTENCIA_ANTIGUEDAD_MAX_HORAS  Antigüedad máxima (en horas) de una asistencia hecha sin conexión
//                              para que el servidor la valide con la hora en que se hizo
//                              (por defecto 24; ver dominio/relojDiferido.js)
//   FIRESTORE_EMULATOR_HOST    Solo desarrollo/pruebas: usa el emulador en vez de producción
export function leerConfig(env = process.env) {
  const minutos = Number(env.MANTENIMIENTO_MINUTOS ?? 5);
  const horasCancelacion = Number(env.CANCELACION_ANTIGUEDAD_MAX_HORAS);
  const horasAsistencia = Number(env.ASISTENCIA_ANTIGUEDAD_MAX_HORAS);
  return {
    asistenciaAntiguedadMaxMs:
      Number.isFinite(horasAsistencia) && horasAsistencia > 0
        ? horasAsistencia * 3600000
        : ANTIGUEDAD_MAX_ASISTENCIA_MS,
    cancelacionAntiguedadMaxMs:
      Number.isFinite(horasCancelacion) && horasCancelacion > 0
        ? horasCancelacion * 3600000
        : ANTIGUEDAD_MAX_CANCELACION_MS,
    puerto: Number(env.PORT || 8080),
    proyecto: env.FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT || "",
    cuentaServicio: env.FIREBASE_SERVICE_ACCOUNT || "",
    origenesCors: String(env.CORS_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    mantenimientoMs: Number.isFinite(minutos) && minutos > 0 ? minutos * 60000 : 0,
    secretoAsistencia: env.ASISTENCIA_SECRETO || "",
  };
}
