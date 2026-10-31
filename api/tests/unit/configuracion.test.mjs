import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { leerConfig } from "../../src/config.js";
import { credencial } from "../../src/firebase.js";

describe("configuración por variables de entorno", () => {
  it("valores por defecto: puerto 8080, mantenimiento cada 5 min, sin CORS", () => {
    const c = leerConfig({});
    assert.equal(c.puerto, 8080);
    assert.equal(c.mantenimientoMs, 5 * 60000);
    assert.deepEqual(c.origenesCors, []);
    assert.equal(c.cuentaServicio, "");
  });

  it("antigüedad máxima de una cancelación sin conexión: 7 días por defecto y configurable en horas", () => {
    assert.equal(leerConfig({}).cancelacionAntiguedadMaxMs, 7 * 24 * 3600000);
    assert.equal(leerConfig({ CANCELACION_ANTIGUEDAD_MAX_HORAS: "48" }).cancelacionAntiguedadMaxMs, 48 * 3600000);
    for (const invalido of ["0", "-3", "abc", ""]) {
      assert.equal(leerConfig({ CANCELACION_ANTIGUEDAD_MAX_HORAS: invalido }).cancelacionAntiguedadMaxMs, 7 * 24 * 3600000, invalido);
    }
  });

  it("lee puerto, proyecto, orígenes CORS y desactiva el mantenimiento con 0", () => {
    const c = leerConfig({ PORT: "3000", FIREBASE_PROJECT_ID: "p", CORS_ORIGINS: "https://a.com, https://b.com ,", MANTENIMIENTO_MINUTOS: "0" });
    assert.equal(c.puerto, 3000);
    assert.equal(c.proyecto, "p");
    assert.deepEqual(c.origenesCors, ["https://a.com", "https://b.com"]);
    assert.equal(c.mantenimientoMs, 0);
  });
});

describe("credenciales de la cuenta de servicio", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const clave = JSON.stringify({ project_id: "demo", client_email: "x@demo.iam.gserviceaccount.com", private_key: privateKey });

  it("sin clave configurada no hay credencial explícita (se usan las del entorno)", () => {
    assert.equal(credencial(""), undefined);
  });

  it("acepta la clave como JSON o como JSON en base64", () => {
    assert.ok(credencial(clave));
    assert.ok(credencial(Buffer.from(clave).toString("base64")));
  });

  it("una clave mal formada falla en el arranque (no en la primera solicitud)", () => {
    assert.throws(() => credencial("no es una clave"));
  });
});
