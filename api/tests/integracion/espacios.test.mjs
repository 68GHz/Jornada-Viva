import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { DIA, MINUTO, Timestamp, docJornada, iniciarApi, limpiar, reloj, sembrar, sembrarPerfiles } from "./entorno.mjs";

// FE-01 · el servidor calcula qué espacios están ocupados / libres
describe("FE-01 · disponibilidad de espacios (calculada por la API)", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });

  const inicio = () => reloj.ahora + 5 * DIA;
  const jornada = (extra = {}) =>
    docJornada({ fecha: Timestamp.fromMillis(inicio()), duracionMin: 60, lugar: "Coliseo", ...extra });
  const consultar = (uid, desde, hasta, extra = "") =>
    api.llamar(uid, "GET", `/v1/espacios/disponibilidad?inicio=${desde}&fin=${hasta}${extra}`);

  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("jornadas/j1", jornada({ titulo: "Salud" }));
  });

  it("marca como ocupado el espacio de una jornada que se solapa y lista los demás como libres", async () => {
    const r = await consultar("gestorA", inicio() + 30 * MINUTO, inicio() + 90 * MINUTO);
    assert.equal(r.estado, 200);
    assert.deepEqual(Object.keys(r.cuerpo.ocupados), ["Coliseo"]);
    assert.equal(r.cuerpo.ocupados.Coliseo[0].titulo, "Salud");
    assert.equal(r.cuerpo.ocupados.Coliseo[0].id, "j1");
    assert.ok(!r.cuerpo.libres.includes("Coliseo"));
    assert.ok(r.cuerpo.libres.includes("Cancha"));
  });

  it("el borde exacto no choca: una termina cuando la otra empieza", async () => {
    const r = await consultar("gestorA", inicio() + 60 * MINUTO, inicio() + 120 * MINUTO);
    assert.deepEqual(r.cuerpo.ocupados, {});
  });

  it("no cuentan las jornadas canceladas ni las que no se solapan", async () => {
    await sembrar("jornadas/j2", jornada({ lugar: "Cancha", activa: false }));
    await sembrar("jornadas/j3", jornada({ lugar: "Auditorio", fecha: Timestamp.fromMillis(inicio() + 3 * DIA) }));
    const r = await consultar("gestorA", inicio(), inicio() + 60 * MINUTO);
    assert.deepEqual(Object.keys(r.cuerpo.ocupados), ["Coliseo"]);
  });

  it("detecta una jornada larga que empezó antes de la franja", async () => {
    await sembrar("jornadas/jLarga", jornada({ lugar: "Auditorio", fecha: Timestamp.fromMillis(inicio() - 5 * 60 * MINUTO), duracionMin: 600 }));
    const r = await consultar("gestorA", inicio(), inicio() + 60 * MINUTO);
    assert.ok(Object.keys(r.cuerpo.ocupados).includes("Auditorio"));
  });

  it("`excluirId` omite la jornada que se está editando", async () => {
    const r = await consultar("gestorA", inicio(), inicio() + 60 * MINUTO, "&excluirId=j1");
    assert.deepEqual(r.cuerpo.ocupados, {});
  });

  it("cualquier usuario con sesión puede consultarlo, y sin sesión no", async () => {
    assert.equal((await consultar("est1", inicio(), inicio() + 60 * MINUTO)).estado, 200);
    assert.equal((await consultar(null, inicio(), inicio() + 60 * MINUTO)).estado, 401);
  });

  it("rechaza franjas inválidas", async () => {
    assert.equal((await api.llamar("gestorA", "GET", "/v1/espacios/disponibilidad")).estado, 400);
    assert.equal((await consultar("gestorA", inicio(), inicio())).estado, 400);
    assert.equal((await consultar("gestorA", inicio(), inicio() - 1)).estado, 400);
    assert.equal((await consultar("gestorA", inicio(), inicio() + 2 * DIA)).estado, 400);
  });

  describe("espacios alternos de una jornada", () => {
    it("una jornada cancelada sugiere los espacios libres a su hora (sin el suyo)", async () => {
      await sembrar("jornadas/jc", jornada({ lugar: "Cancha", activa: false, titulo: "Cancelada" }));
      const r = await api.llamar("est1", "GET", "/v1/jornadas/jc/espacios-alternos");
      assert.equal(r.estado, 200);
      assert.equal(r.cuerpo.sugerencia.motivo, "cancelada");
      assert.ok(r.cuerpo.sugerencia.libres.includes("Auditorio"));
      assert.ok(!r.cuerpo.sugerencia.libres.includes("Cancha"));
      assert.ok(!r.cuerpo.sugerencia.libres.includes("Coliseo"), "Coliseo lo ocupa j1");
    });

    it("si otra jornada usa el mismo espacio a esa hora, lo avisa con quién lo ocupa", async () => {
      await sembrar("jornadas/j2", jornada({ titulo: "Otra en Coliseo" }));
      const r = await api.llamar("est1", "GET", "/v1/jornadas/j1/espacios-alternos");
      assert.equal(r.cuerpo.sugerencia.motivo, "ocupado");
      assert.equal(r.cuerpo.sugerencia.ocupantes[0].titulo, "Otra en Coliseo");
    });

    it("sin choque no hay sugerencia, y una jornada que no existe da 404", async () => {
      assert.equal((await api.llamar("est1", "GET", "/v1/jornadas/j1/espacios-alternos")).cuerpo.sugerencia, null);
      assert.equal((await api.llamar("est1", "GET", "/v1/jornadas/nope/espacios-alternos")).estado, 404);
    });
  });
});
