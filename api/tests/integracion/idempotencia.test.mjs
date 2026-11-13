import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { coleccion, cuerpoJornada, iniciarApi, leer, limpiar, sembrarPerfiles } from "./entorno.mjs";

// Reintentar «crear jornada» (la app solo vio un error de conexión pero el servidor sí la guardó)
// no debe crear un duplicado.
describe("crear jornada con clave de idempotencia", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
  });
  const crear = (uid, extra = {}) => api.llamar(uid, "POST", "/v1/jornadas", cuerpoJornada(extra));
  const jornadas = async () => coleccion("jornadas");
  const auditoria = async () => (await coleccion("auditoria")).filter((a) => a.accion === "jornada.crear");

  it("el primer intento la crea (201) y repetirlo con la misma clave devuelve la misma sin duplicar (200)", async () => {
    const primero = await crear("gestorA", { claveIdempotencia: "clave-intento-1" });
    assert.equal(primero.estado, 201);
    assert.equal(primero.cuerpo.repetida, undefined);

    const repetido = await crear("gestorA", { claveIdempotencia: "clave-intento-1" });
    assert.equal(repetido.estado, 200);
    assert.deepEqual(repetido.cuerpo, { id: primero.cuerpo.id, repetida: true });
    assert.equal((await jornadas()).length, 1);
    assert.equal((await leer(`jornadas/${primero.cuerpo.id}`)).creadoPor, "gestorA");
  });

  it("un doble toque simultáneo con la misma clave deja una sola jornada", async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 4 }, () => crear("gestorA", { claveIdempotencia: "doble-toque-123" }))
    );
    assert.ok(respuestas.every((r) => [200, 201].includes(r.estado)), respuestas.map((r) => r.estado).join());
    assert.equal(respuestas.filter((r) => r.estado === 201).length, 1, "solo una la crea");
    assert.equal(new Set(respuestas.map((r) => r.cuerpo.id)).size, 1, "todas devuelven el mismo ID");
    assert.equal((await jornadas()).length, 1);
  });

  it("otra clave es otra jornada, y sin clave se comporta como siempre", async () => {
    const a = await crear("gestorA", { claveIdempotencia: "clave-numero-uno" });
    const b = await crear("gestorA", { claveIdempotencia: "clave-numero-dos" });
    assert.notEqual(a.cuerpo.id, b.cuerpo.id);
    await crear("gestorA");
    await crear("gestorA");
    assert.equal((await jornadas()).length, 4);
  });

  it("la misma clave de otro usuario (o para otro gestor) no choca ni devuelve jornadas ajenas", async () => {
    const deA = await crear("gestorA", { claveIdempotencia: "clave-compartida" });
    const deB = await crear("gestorB", { claveIdempotencia: "clave-compartida" });
    assert.equal(deB.estado, 201);
    assert.notEqual(deA.cuerpo.id, deB.cuerpo.id);
    assert.equal((await leer(`jornadas/${deB.cuerpo.id}`)).creadoPor, "gestorB");

    const paraA = await crear("admin1", { creadoPor: "gestorA", claveIdempotencia: "clave-compartida" });
    const paraB = await crear("admin1", { creadoPor: "gestorB", claveIdempotencia: "clave-compartida" });
    assert.notEqual(paraA.cuerpo.id, paraB.cuerpo.id);
    assert.equal((await jornadas()).length, 4);
  });

  it("el administrador: el reintento no repite la auditoría", async () => {
    await crear("admin1", { creadoPor: "gestorA", claveIdempotencia: "clave-del-admin" });
    await crear("admin1", { creadoPor: "gestorA", claveIdempotencia: "clave-del-admin" });
    assert.equal((await jornadas()).length, 1);
    assert.equal((await auditoria()).length, 1);
  });

  it("repetir con la misma clave no modifica la jornada ya guardada (aunque los datos cambien)", async () => {
    const primero = await crear("gestorA", { claveIdempotencia: "clave-intento-2", titulo: "Original" });
    const repetido = await crear("gestorA", { claveIdempotencia: "clave-intento-2", titulo: "Cambiado" });
    assert.equal(repetido.cuerpo.id, primero.cuerpo.id);
    assert.equal((await leer(`jornadas/${primero.cuerpo.id}`)).titulo, "Original");
  });

  it("los datos inválidos se rechazan igual y no consumen la clave", async () => {
    const mala = await crear("gestorA", { claveIdempotencia: "clave-intento-3", titulo: "" });
    assert.equal(mala.estado, 400);
    assert.equal((await jornadas()).length, 0);
    const buena = await crear("gestorA", { claveIdempotencia: "clave-intento-3" });
    assert.equal(buena.estado, 201);
  });

  it("una clave mal formada se rechaza", async () => {
    for (const clave of ["", "corta", "con espacios aqui", "x".repeat(101), "raro/id/aqui", 12345678, null]) {
      const r = await crear("gestorA", { claveIdempotencia: clave });
      assert.equal(r.estado, 400, String(clave).slice(0, 20));
      assert.equal(r.cuerpo.error.campos.claveIdempotencia, "La clave de idempotencia no es válida.");
    }
    assert.equal((await jornadas()).length, 0);
  });

  it("sin permiso sigue sin poder crear, con o sin clave", async () => {
    assert.equal((await crear("est1", { claveIdempotencia: "clave-estudiante" })).estado, 403);
    assert.equal((await crear(null, { claveIdempotencia: "clave-sin-sesion" })).estado, 401);
    assert.equal((await jornadas()).length, 0);
  });
});
