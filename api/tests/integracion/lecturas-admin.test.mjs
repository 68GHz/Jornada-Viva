import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Timestamp, iniciarApi, limpiar, sembrar, sembrarPerfiles } from "./entorno.mjs";

// Lecturas del administrador por la API (cuentas y auditoría): ya no se leen directo de Firestore
describe("lecturas del administrador por la API", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("users/est1", {
      uid: "est1", nombre: "Ana", email: "ana@x.co", rol: "estudiante",
      pushToken: "ExponentPushToken[secreto]", creadoEn: Timestamp.fromMillis(1700000000000),
    });
    await sembrar("users/baja", { uid: "baja", nombre: "Baja", email: "baja@x.co", rol: "maestro", activo: false });
    for (let i = 0; i < 3; i++) {
      await sembrar(`auditoria/a${i}`, {
        accion: "usuario.crear", entidad: "usuario", entidadId: `u${i}`, detalle: `d${i}`,
        actorId: "admin1", actorNombre: "Admin", creadaEn: Timestamp.fromMillis(1700000000000 + i * 1000),
      });
    }
  });

  describe("GET /v1/admin/usuarios", () => {
    it("el administrador recibe las cuentas con rol normalizado y estado, sin datos privados", async () => {
      const r = await api.llamar("admin1", "GET", "/v1/admin/usuarios");
      assert.equal(r.estado, 200);
      const ana = r.cuerpo.usuarios.find((u) => u.id === "est1");
      assert.deepEqual(ana, {
        id: "est1", nombre: "Ana", email: "ana@x.co", rol: "estudiante", activo: true, creadoEn: 1700000000000,
      });
      assert.ok(!JSON.stringify(r.cuerpo).includes("ExponentPushToken"), "nunca el token de notificaciones");
      const baja = r.cuerpo.usuarios.find((u) => u.id === "baja");
      assert.equal(baja.activo, false);
      assert.equal(baja.rol, "gestor", "el alias `maestro` se normaliza");
      assert.equal(r.cuerpo.usuarios.length, 8);
    });

    it("solo el administrador: estudiante y gestor reciben 403, sin sesión 401", async () => {
      assert.equal((await api.llamar("est1", "GET", "/v1/admin/usuarios")).estado, 403);
      assert.equal((await api.llamar("gestorA", "GET", "/v1/admin/usuarios")).estado, 403);
      assert.equal((await api.llamar(null, "GET", "/v1/admin/usuarios")).estado, 401);
    });
  });

  describe("GET /v1/admin/auditoria", () => {
    it("devuelve los registros más recientes primero y respeta el límite", async () => {
      const r = await api.llamar("admin1", "GET", "/v1/admin/auditoria?limite=2");
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo.registros.map((x) => x.entidadId), ["u2", "u1"]);
      assert.equal(r.cuerpo.registros[0].creadaEn, 1700000002000);
      assert.equal(r.cuerpo.registros[0].actorNombre, "Admin");
    });

    it("sin límite entrega hasta 100, y un límite absurdo se acota", async () => {
      assert.equal((await api.llamar("admin1", "GET", "/v1/admin/auditoria")).cuerpo.registros.length, 3);
      assert.equal((await api.llamar("admin1", "GET", "/v1/admin/auditoria?limite=999999")).estado, 200);
      assert.equal((await api.llamar("admin1", "GET", "/v1/admin/auditoria?limite=abc")).cuerpo.registros.length, 3);
    });

    it("solo el administrador", async () => {
      assert.equal((await api.llamar("est1", "GET", "/v1/admin/auditoria")).estado, 403);
      assert.equal((await api.llamar("gestorA", "GET", "/v1/admin/auditoria")).estado, 403);
      assert.equal((await api.llamar(null, "GET", "/v1/admin/auditoria")).estado, 401);
    });
  });
});
