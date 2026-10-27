import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generarCodigo, verificarCodigo } from "../../src/dominio/codigoAsistencia.js";
import { leerConfig } from "../../src/config.js";
import { resolverSecretoAsistencia } from "../../src/secreto.js";

const SECRETO = "secreto-de-prueba";
const AHORA = Date.UTC(2026, 10, 1, 15, 0);
const VIGENCIA = 60 * 1000;
const emitir = (extra = {}) =>
  generarCodigo({ jornadaId: "j1", ahoraMs: AHORA, vigenciaMs: VIGENCIA, secreto: SECRETO, ...extra });
const verificar = (codigo, extra = {}) =>
  verificarCodigo(codigo, { jornadaId: "j1", ahoraMs: AHORA, secreto: SECRETO, ...extra });

describe("código firmado del QR de asistencia", () => {
  it("un código recién emitido es válido para su jornada", () => {
    const { codigo, expiraEn } = emitir();
    assert.equal(expiraEn, AHORA + VIGENCIA);
    assert.deepEqual(verificar(codigo), { valido: true });
  });

  it("vale hasta el último instante de su vigencia y caduca después", () => {
    const { codigo } = emitir();
    assert.equal(verificar(codigo, { ahoraMs: AHORA + VIGENCIA }).valido, true);
    assert.deepEqual(verificar(codigo, { ahoraMs: AHORA + VIGENCIA + 1 }), { valido: false, motivo: "CADUCADO" });
  });

  it("no sirve para otra jornada", () => {
    const { codigo } = emitir();
    assert.deepEqual(verificar(codigo, { jornadaId: "j2" }), { valido: false, motivo: "JORNADA" });
  });

  it("firmado con otro secreto, o alterado, se rechaza (no se puede inventar ni extender)", () => {
    const ajeno = emitir({ secreto: "otro-secreto" }).codigo;
    assert.deepEqual(verificar(ajeno), { valido: false, motivo: "FIRMA" });

    // Alargar la vigencia: se cambia la carga conservando la firma original
    const { codigo } = emitir();
    const [, firma] = codigo.split(".");
    const cargaFalsa = Buffer.from(`j1|${AHORA + 10 * 365 * 24 * 3600 * 1000}`).toString("base64url");
    assert.deepEqual(verificar(`${cargaFalsa}.${firma}`), { valido: false, motivo: "FIRMA" });
  });

  it("rechaza lo que no tiene forma de código", () => {
    for (const malo of [undefined, null, 42, "", "sin-punto", "a.b.c", ".", "a.", ".b", "x".repeat(500)]) {
      assert.equal(verificar(malo).valido, false, String(malo).slice(0, 20));
    }
  });

  it("acepta identificadores con barras verticales", () => {
    const { codigo } = emitir({ jornadaId: "raro|id" });
    assert.equal(verificar(codigo, { jornadaId: "raro|id" }).valido, true);
    assert.equal(verificar(codigo, { jornadaId: "raro" }).valido, false);
  });
});

describe("secreto con el que se firma el QR", () => {
  const cuenta = JSON.stringify({ project_id: "demo", client_email: "x@demo.iam", private_key: "CLAVE-PRIVADA-DE-PRUEBA" });
  const silencioso = { warn() {} };

  it("ASISTENCIA_SECRETO tiene prioridad", () => {
    const config = leerConfig({ ASISTENCIA_SECRETO: "mi-secreto", FIREBASE_SERVICE_ACCOUNT: cuenta });
    assert.equal(resolverSecretoAsistencia(config, silencioso), "mi-secreto");
  });

  it("sin él se deriva de la clave de la cuenta de servicio: estable entre reinicios y en base64", () => {
    const a = resolverSecretoAsistencia(leerConfig({ FIREBASE_SERVICE_ACCOUNT: cuenta }), silencioso);
    const b = resolverSecretoAsistencia(leerConfig({ FIREBASE_SERVICE_ACCOUNT: cuenta }), silencioso);
    const c = resolverSecretoAsistencia(
      leerConfig({ FIREBASE_SERVICE_ACCOUNT: Buffer.from(cuenta).toString("base64") }),
      silencioso
    );
    assert.equal(a, b);
    assert.equal(a, c);
    assert.notEqual(a, "CLAVE-PRIVADA-DE-PRUEBA", "no expone la clave privada");
    assert.ok(!a.includes("CLAVE"));
  });

  it("sin nada de lo anterior usa uno al azar y lo avisa", () => {
    const avisos = [];
    const a = resolverSecretoAsistencia(leerConfig({}), { warn: (m) => avisos.push(m) });
    const b = resolverSecretoAsistencia(leerConfig({}), silencioso);
    assert.ok(a.length >= 32);
    assert.notEqual(a, b);
    assert.equal(avisos.length, 1);
  });
});
