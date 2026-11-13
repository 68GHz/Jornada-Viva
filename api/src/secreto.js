import { createHmac, randomBytes } from "node:crypto";

// Secreto con el que se firma el código del QR de asistencia.
//   1. ASISTENCIA_SECRETO, si está definido (lo recomendado: una cadena larga y aleatoria).
//   2. Si no, se deriva de la clave de la cuenta de servicio, que ya es un secreto del servidor y
//      es la misma en cada reinicio y en cada instancia, así no hace falta configurar nada más.
//   3. Si tampoco la hay (credenciales por GOOGLE_APPLICATION_CREDENTIALS o emulador), uno al azar
//      por proceso: los códigos vigentes se invalidan al reiniciar y no valen entre instancias.
export function resolverSecretoAsistencia(config, registro = console) {
  if (config.secretoAsistencia) return config.secretoAsistencia;

  if (config.cuentaServicio) {
    try {
      const texto = config.cuentaServicio.trim();
      const json = texto.startsWith("{") ? texto : Buffer.from(texto, "base64").toString("utf8");
      const clave = JSON.parse(json).private_key;
      if (clave) return createHmac("sha256", "jornadaviva:asistencia").update(clave).digest("hex");
    } catch {
      /* una clave mal formada ya hace fallar el arranque en firebase.js */
    }
  }

  registro.warn?.(
    "[asistencia] No hay ASISTENCIA_SECRETO ni clave de cuenta de servicio: se usa un secreto al azar. " +
      "Los códigos QR se invalidan al reiniciar y no funcionan con varias instancias."
  );
  return randomBytes(32).toString("hex");
}
