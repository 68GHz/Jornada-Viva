import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  DIA, coleccion, iniciarApi, leer, limpiar, reloj, sembrar, sembrarPerfiles,
} from "./entorno.mjs";

const auditoria = async () => (await coleccion("auditoria")).map((a) => a.accion);

describe("FE-02 · préstamo y devolución de objetos", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("users/baja", { uid: "baja", nombre: "Baja", email: "baja@x.co", rol: "estudiante", activo: false });
  });

  const cuerpo = (extra = {}) => ({
    codigo: "LIB-001",
    nombre: "Cálculo de una variable",
    tipo: "libro",
    correo: "ana@x.co",
    vence: reloj.ahora + 7 * DIA,
    ...extra,
  });
  const prestar = (uid, extra) => api.llamar(uid, "POST", "/v1/prestamos", cuerpo(extra));
  const devolver = (uid, id) => api.llamar(uid, "POST", `/v1/prestamos/${id}/devolucion`);

  describe("registrar un préstamo", () => {
    it("un gestor presta un objeto a un estudiante: queda activo, con quién lo prestó y hasta cuándo", async () => {
      const r = await prestar("gestorA");
      assert.equal(r.estado, 201);
      const p = await leer(`prestamos/${r.cuerpo.id}`);
      assert.equal(p.codigo, "LIB-001");
      assert.equal(p.codigoNormalizado, "LIB-001");
      assert.equal(p.nombre, "Cálculo de una variable");
      assert.equal(p.tipo, "libro");
      assert.equal(p.userId, "est1");
      assert.equal(p.nombreUsuario, "Ana");
      assert.equal(p.emailUsuario, "ana@x.co");
      assert.equal(p.prestadoPor, "gestorA");
      assert.equal(p.activo, true);
      assert.equal(p.devueltoEn, null);
      assert.equal(p.vence.toMillis(), reloj.ahora + 7 * DIA);
      assert.ok(p.prestadoEn);
      assert.deepEqual(await auditoria(), [], "las acciones del gestor no se auditan");
    });

    it("el administrador también presta, y queda en la auditoría", async () => {
      assert.equal((await prestar("admin1")).estado, 201);
      assert.deepEqual(await auditoria(), ["prestamo.crear"]);
    });

    it("el correo se reconoce sin importar mayúsculas ni espacios, y el código también", async () => {
      const r = await prestar("gestorA", { correo: "  ANA@x.co ", codigo: "  lib  001 " });
      assert.equal(r.estado, 201);
      const p = await leer(`prestamos/${r.cuerpo.id}`);
      assert.equal(p.codigo, "LIB 001");
      assert.equal(p.codigoNormalizado, "LIB 001");
    });

    it("un estudiante, quien no tiene sesión o un usuario sin perfil no pueden prestar", async () => {
      assert.equal((await prestar("est1")).estado, 403);
      assert.equal((await prestar("sinPerfil")).estado, 403);
      assert.equal((await prestar(null)).estado, 401);
      assert.equal((await coleccion("prestamos")).length, 0);
    });

    it("valida cada campo con su mensaje y no guarda nada", async () => {
      const casos = [
        [{ codigo: "" }, "codigo"], [{ nombre: "  " }, "nombre"], [{ tipo: "mueble" }, "tipo"], [{ tipo: undefined }, "tipo"],
        [{ correo: "" }, "correo"], [{ correo: "no-es-correo" }, "correo"],
        [{ vence: undefined }, "vence"], [{ vence: "mañana" }, "vence"], [{ vence: reloj.ahora - 1000 }, "vence"],
        [{ vence: reloj.ahora + 91 * DIA }, "vence"], [{ codigo: "x".repeat(41) }, "codigo"], [{ nombre: "x".repeat(121) }, "nombre"],
        [{ nota: "x".repeat(301) }, "nota"], [{ nota: 5 }, "nota"],
      ];
      for (const [extra, campo] of casos) {
        const r = await prestar("gestorA", extra);
        assert.equal(r.estado, 400, JSON.stringify(extra).slice(0, 60));
        assert.ok(r.cuerpo.error.campos[campo], `${campo}: ${JSON.stringify(extra).slice(0, 60)}`);
      }
      assert.equal((await coleccion("prestamos")).length, 0);
    });

    it("el límite de 90 días todavía se acepta", async () => {
      assert.equal((await prestar("gestorA", { vence: reloj.ahora + 90 * DIA })).estado, 201);
    });

    it("solo se presta a estudiantes con cuenta activa: correo desconocido, cuenta desactivada o de un gestor se rechazan", async () => {
      for (const correo of ["nadie@x.co", "baja@x.co", "ga@x.co", "admin@x.co"]) {
        const r = await prestar("gestorA", { correo });
        assert.equal(r.estado, 409, correo);
        assert.equal(r.cuerpo.error.codigo, "ESTUDIANTE_NO_ENCONTRADO", correo);
      }
      assert.equal((await coleccion("prestamos")).length, 0);
    });

    it("un objeto no puede estar prestado a dos personas a la vez (aunque se escriba distinto el código)", async () => {
      assert.equal((await prestar("gestorA")).estado, 201);
      for (const codigo of ["LIB-001", "lib-001", "  Lib-001  "]) {
        const r = await prestar("gestorB", { codigo, correo: "beto@x.co" });
        assert.equal(r.estado, 409, codigo);
        assert.equal(r.cuerpo.error.codigo, "OBJETO_YA_PRESTADO");
        assert.match(r.cuerpo.error.mensaje, /ya está prestado a Ana/);
      }
      assert.equal((await coleccion("prestamos")).length, 1);
    });

    it("otro objeto sí se puede prestar, y el mismo después de devolverlo", async () => {
      const primero = (await prestar("gestorA")).cuerpo.id;
      assert.equal((await prestar("gestorA", { codigo: "LIB-002" })).estado, 201);
      assert.equal((await devolver("gestorA", primero)).cuerpo.resultado, "devuelto");
      assert.equal((await prestar("gestorB", { correo: "beto@x.co" })).estado, 201);
      assert.equal((await coleccion("prestamos")).length, 3);
    });

    it("con 6 envíos simultáneos del mismo objeto solo uno se registra", async () => {
      const respuestas = await Promise.all(
        Array.from({ length: 6 }, (_, i) => prestar("gestorA", { correo: i % 2 ? "beto@x.co" : "ana@x.co" }))
      );
      assert.equal(respuestas.filter((r) => r.estado === 201).length, 1);
      assert.equal(respuestas.filter((r) => r.cuerpo?.error?.codigo === "OBJETO_YA_PRESTADO").length, 5);
      assert.equal((await coleccion("prestamos")).length, 1);
    });
  });

  describe("devolver", () => {
    it("el gestor que prestó lo marca como devuelto; repetirlo es idempotente y no cambia la fecha", async () => {
      const id = (await prestar("gestorA")).cuerpo.id;
      const r = await devolver("gestorA", id);
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo, { resultado: "devuelto" });
      const p = await leer(`prestamos/${id}`);
      assert.equal(p.activo, false);
      assert.ok(p.devueltoEn);
      assert.equal(p.devueltoPor, "gestorA");

      const fecha = p.devueltoEn.toMillis();
      reloj.ahora += 1000;
      assert.deepEqual((await devolver("gestorA", id)).cuerpo, { resultado: "ya-devuelto" });
      assert.equal((await leer(`prestamos/${id}`)).devueltoEn.toMillis(), fecha);
    });

    it("un gestor no gestiona los préstamos de otro gestor; el administrador sí, y queda en la auditoría", async () => {
      const id = (await prestar("gestorA")).cuerpo.id;
      assert.equal((await devolver("gestorB", id)).estado, 403);
      assert.equal((await leer(`prestamos/${id}`)).activo, true);
      assert.equal((await devolver("admin1", id)).cuerpo.resultado, "devuelto");
      assert.deepEqual(await auditoria(), ["prestamo.devolver"]);
    });

    it("un estudiante (ni siquiera el del préstamo) ni quien no tiene sesión pueden devolver", async () => {
      const id = (await prestar("gestorA")).cuerpo.id;
      assert.equal((await devolver("est1", id)).estado, 403);
      assert.equal((await devolver(null, id)).estado, 401);
      assert.equal((await leer(`prestamos/${id}`)).activo, true);
    });

    it("un préstamo que no existe es 404", async () => {
      assert.equal((await devolver("gestorA", "noExiste")).estado, 404);
    });
  });

  describe("consultar", () => {
    beforeEach(async () => {
      await prestar("gestorA", { codigo: "A-1" });
      await prestar("gestorA", { codigo: "A-2", correo: "beto@x.co" });
      await prestar("gestorB", { codigo: "B-1" });
    });

    it("el gestor ve solo los que registró; el administrador, todos", async () => {
      const ga = (await api.llamar("gestorA", "GET", "/v1/prestamos")).cuerpo.prestamos;
      assert.deepEqual(ga.map((p) => p.codigo).sort(), ["A-1", "A-2"]);
      const gb = (await api.llamar("gestorB", "GET", "/v1/prestamos")).cuerpo.prestamos;
      assert.deepEqual(gb.map((p) => p.codigo), ["B-1"]);
      const todos = (await api.llamar("admin1", "GET", "/v1/prestamos")).cuerpo.prestamos;
      assert.equal(todos.length, 3);
    });

    it("«estado=activos» deja fuera lo ya devuelto; la lista trae las fechas en milisegundos", async () => {
      const lista = (await api.llamar("gestorA", "GET", "/v1/prestamos")).cuerpo.prestamos;
      await devolver("gestorA", lista.find((p) => p.codigo === "A-1").id);
      const activos = (await api.llamar("gestorA", "GET", "/v1/prestamos?estado=activos")).cuerpo.prestamos;
      assert.deepEqual(activos.map((p) => p.codigo), ["A-2"]);
      assert.equal(typeof activos[0].vence, "number");
      assert.equal(activos[0].activo, true);
      assert.equal(activos[0].devueltoEn, null);
      const todos = (await api.llamar("gestorA", "GET", "/v1/prestamos")).cuerpo.prestamos;
      assert.equal(typeof todos.find((p) => p.codigo === "A-1").devueltoEn, "number");
    });

    it("el estudiante ve únicamente los suyos (incluidos los devueltos) y no puede listar los de todos", async () => {
      const mios = (await api.llamar("est1", "GET", "/v1/me/prestamos")).cuerpo.prestamos;
      assert.deepEqual(mios.map((p) => p.codigo).sort(), ["A-1", "B-1"]);
      assert.ok(mios.every((p) => p.userId === "est1"));
      assert.equal((await api.llamar("est1", "GET", "/v1/prestamos")).estado, 403);
      assert.equal((await api.llamar(null, "GET", "/v1/me/prestamos")).estado, 401);
      const deBeto = (await api.llamar("est2", "GET", "/v1/me/prestamos")).cuerpo.prestamos;
      assert.deepEqual(deBeto.map((p) => p.codigo), ["A-2"]);
    });
  });
});
