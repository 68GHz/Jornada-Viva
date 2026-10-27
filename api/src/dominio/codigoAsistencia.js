import { createHmac, timingSafeEqual } from "node:crypto";

// Código del QR de asistencia. Lo emite el servidor para una jornada, lo firma con un secreto que
// nunca sale de aquí y caduca a los pocos segundos: la pantalla del gestor pide uno nuevo antes de
// que venza. Así el QR solo sirve a quien lo está viendo en ese momento (una captura compartida
// caduca antes de que alguien la use) y el estudiante no puede inventarlo.
//
// Formato: base64url("<jornadaId>|<expira en ms>") + "." + base64url(HMAC-SHA256 de lo anterior)
const firmar = (carga, secreto) => createHmac("sha256", secreto).update(carga).digest("base64url");

export function generarCodigo({ jornadaId, ahoraMs, vigenciaMs, secreto }) {
  const expiraEn = ahoraMs + vigenciaMs;
  const carga = Buffer.from(`${jornadaId}|${expiraEn}`).toString("base64url");
  return { codigo: `${carga}.${firmar(carga, secreto)}`, expiraEn };
}

// { valido: true } o { valido: false, motivo: "FORMATO" | "FIRMA" | "JORNADA" | "CADUCADO" }
export function verificarCodigo(codigo, { jornadaId, ahoraMs, secreto }) {
  if (typeof codigo !== "string" || codigo.length > 400) return { valido: false, motivo: "FORMATO" };
  const partes = codigo.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { valido: false, motivo: "FORMATO" };
  const [carga, firma] = partes;

  const esperada = Buffer.from(firmar(carga, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return { valido: false, motivo: "FIRMA" };
  }

  const texto = Buffer.from(carga, "base64url").toString("utf8");
  const corte = texto.lastIndexOf("|");
  const expiraEn = Number(texto.slice(corte + 1));
  if (corte < 1 || !Number.isFinite(expiraEn)) return { valido: false, motivo: "FORMATO" };

  if (texto.slice(0, corte) !== jornadaId) return { valido: false, motivo: "JORNADA" };
  if (ahoraMs > expiraEn) return { valido: false, motivo: "CADUCADO" };
  return { valido: true };
}
