import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { normalizarJornada } from "../../src/dominio/jornadaFecha.js";
import {
  MINUTO, Timestamp, cuerpoJornada, docJornada, iniciarApi, leer, limpiar, reloj, sembrar, sembrarPerfiles,
} from "./entorno.mjs";

describe("duración de las jornadas", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
  });

  describe("crear y editar", () => {
    it("crear guarda la duración que se indica", async () => {
      const r = await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada({ duracionMin: 135 }));
      assert.equal(r.estado, 201);
      assert.equal((await leer(`jornadas/${r.cuerpo.id}`)).duracionMin, 135);
    });

    it("una versión de la app sin el campo sigue funcionando: se guarda la duración por defecto", async () => {
      const r = await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada());
      assert.equal(r.estado, 201);
      assert.equal((await leer(`jornadas/${r.cuerpo.id}`)).duracionMin, 60);
    });

    it("el límite inferior (10) y el superior (1440) son válidos", async () => {
      for (const duracionMin of [10, 1440]) {
        assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas", cuerpoJornada({ duracionMin }))).estado, 201, String(duracionMin));
      }
    });

    it("editar cambia la duración", async () => {
      await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", duracionMin: 60 }));
      const r = await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada({ duracionMin: 90 }));
      assert.equal(r.estado, 204);
      assert.equal((await leer("jornadas/jA")).duracionMin, 90);
    });

    it("editar sin enviar la duración conserva la que ya tenía (versiones antiguas de la app)", async () => {
      await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", duracionMin: 150 }));
      assert.equal((await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada())).estado, 204);
      assert.equal((await leer("jornadas/jA")).duracionMin, 150);
    });

    it("editar una jornada anterior al campo le guarda la duración por defecto", async () => {
      await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA" }));
      assert.equal("duracionMin" in (await leer("jornadas/jA")), false);
      assert.equal((await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada())).estado, 204);
      assert.equal((await leer("jornadas/jA")).duracionMin, 60);
    });

    it("una duración inválida al editar se rechaza y no cambia nada", async () => {
      await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", duracionMin: 60 }));
      const r = await api.llamar("gestorA", "PUT", "/v1/jornadas/jA", cuerpoJornada({ duracionMin: 5 }));
      assert.equal(r.estado, 400);
      assert.equal(r.cuerpo.error.campos.duracionMin, "La duración mínima es de 10 minutos.");
      assert.equal((await leer("jornadas/jA")).duracionMin, 60);
    });
  });

  describe("lectura", () => {
    it("las jornadas sin el campo salen con la duración por defecto y las que lo tienen, con la suya", () => {
      assert.equal(normalizarJornada("a", { titulo: "Antigua", fecha: Timestamp.fromMillis(1000) }).duracionMin, 60);
      assert.equal(normalizarJornada("b", { titulo: "Nueva", fecha: Timestamp.fromMillis(1000), duracionMin: 45 }).duracionMin, 45);
      assert.equal(normalizarJornada("c", { titulo: "Dato dañado", duracionMin: "mucho" }).duracionMin, 60);
    });
  });

  describe("estados y estadísticas", () => {
    it("el panel del administrador cuenta las jornadas en curso aparte de las activas", async () => {
      await sembrar("jornadas/futura", docJornada({ creadoPor: "gestorA" }));
      await sembrar("jornadas/enCurso", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(reloj.ahora - 10 * MINUTO) }));
      await sembrar("jornadas/larga", docJornada({ creadoPor: "gestorA", duracionMin: 180, fecha: Timestamp.fromMillis(reloj.ahora - 100 * MINUTO) }));
      await sembrar("jornadas/terminada", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(reloj.ahora - 100 * MINUTO) }));
      const r = await api.llamar("admin1", "GET", "/v1/admin/estadisticas");
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo.porEstado, { activa: 1, en_curso: 2, cancelada: 0, finalizada: 1 });
    });
  });
});
