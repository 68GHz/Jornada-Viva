import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { iniciarApi, leer, limpiar, sembrar, sembrarPerfiles } from "./entorno.mjs";

describe("M1 · registro y perfil", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => { await limpiar(); await sembrarPerfiles(); });

  it("al registrarse se crea el perfil como estudiante, con el correo de la cuenta", async () => {
    const r = await api.llamar("nuevo", "POST", "/v1/me/perfil", { nombre: "  Nuevo Usuario " });
    assert.equal(r.estado, 201);
    const perfil = await leer("users/nuevo");
    assert.equal(perfil.uid, "nuevo");
    assert.equal(perfil.nombre, "Nuevo Usuario");
    assert.equal(perfil.email, "nuevo@x.co");
    assert.equal(perfil.rol, "estudiante");
    assert.ok(perfil.creadoEn);
    assert.equal("activo" in perfil, false, "igual que antes: el estado implícito es activo");
  });

  it("quien se registra NUNCA puede elegir su rol, aunque lo envíe", async () => {
    for (const rol of ["administrador", "gestor", "maestro"]) {
      await limpiar();
      await api.llamar("intruso", "POST", "/v1/me/perfil", { nombre: "Intruso", rol, activo: false, creadoPor: "x" });
      const perfil = await leer("users/intruso");
      assert.equal(perfil.rol, "estudiante", rol);
      assert.equal("activo" in perfil, false);
    }
  });

  it("es idempotente y jamás modifica un perfil existente (nadie cambia su rol por aquí)", async () => {
    const r = await api.llamar("admin1", "POST", "/v1/me/perfil", { nombre: "Otro nombre" });
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { creado: false });
    const perfil = await leer("users/admin1");
    assert.equal(perfil.rol, "administrador");
    assert.equal(perfil.nombre, "Admin");
  });

  it("valida el nombre", async () => {
    for (const nombre of [undefined, "", "   ", "x".repeat(101)]) {
      const r = await api.llamar("nuevo", "POST", "/v1/me/perfil", nombre === undefined ? {} : { nombre });
      assert.equal(r.estado, 400, String(nombre));
      assert.ok(r.cuerpo.error.campos.nombre);
    }
    assert.equal(await leer("users/nuevo"), null);
  });

  it("una cuenta desactivada no puede crear ni leer su perfil por la API", async () => {
    await sembrar("users/baja", { uid: "baja", nombre: "Baja", rol: "estudiante", activo: false });
    assert.equal((await api.llamar("baja", "POST", "/v1/me/perfil", { nombre: "Baja" })).estado, 403);
  });
});
