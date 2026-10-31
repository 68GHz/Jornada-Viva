import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  DIA, Timestamp, coleccion, docJornada, existe, iniciarApi, leer, limpiar, reloj, sembrar, sembrarPerfiles,
} from "./entorno.mjs";

const inscribir = (api, uid, jornada = "j1", cuerpo) =>
  api.llamar(uid, "PUT", `/v1/jornadas/${jornada}/inscripcion`, cuerpo ?? { nombreUsuario: uid, emailUsuario: `${uid}@x.co` });
const cancelar = (api, uid, jornada = "j1") => api.llamar(uid, "DELETE", `/v1/jornadas/${jornada}/inscripcion`);

describe("M2 · inscribirse y cancelar la inscripción", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("jornadas/j1", docJornada({ cuposTotales: 2 }));
  });

  describe("inscribirse", () => {
    it("crea la inscripción con ID determinista, suma un cupo y anota el estado visto", async () => {
      const r = await inscribir(api, "est1", "j1", { nombreUsuario: "Ana", emailUsuario: "ana@x.co", tituloJornada: "Mi título" });
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo, { resultado: "completada" });

      const insc = await leer("inscripciones/est1_j1");
      assert.equal(insc.userId, "est1");
      assert.equal(insc.jornadaId, "j1");
      assert.equal(insc.nombreUsuario, "Ana");
      assert.equal(insc.emailUsuario, "ana@x.co");
      assert.equal(insc.tituloJornada, "Mi título");
      assert.equal(insc.asistio, false);
      assert.ok(insc.inscritoEn);
      assert.ok(insc.fechaJornada instanceof Timestamp);

      assert.equal((await leer("jornadas/j1")).cuposOcupados, 1);
      const visto = (await leer("users/est1")).jornadasVistas.j1;
      assert.deepEqual(
        { activa: visto.activa, titulo: visto.titulo, lugar: visto.lugar, responsable: visto.responsable, entidad: visto.entidad },
        { activa: true, titulo: "Jornada de salud", lugar: "Coliseo", responsable: "Gestor A", entidad: "TdeA" }
      );
      assert.equal(typeof visto.fecha, "number");
      assert.equal((await leer("users/est1")).rol, "estudiante", "el perfil conserva sus datos");
    });

    it("sin título en la solicitud usa el de la jornada; sin nombre/correo usa los del perfil", async () => {
      await inscribir(api, "est1", "j1", {});
      const insc = await leer("inscripciones/est1_j1");
      assert.equal(insc.tituloJornada, "Jornada de salud");
      assert.equal(insc.nombreUsuario, "Ana");
      assert.equal(insc.emailUsuario, "est1@x.co", "el correo de la cuenta autenticada");
    });

    it("es idempotente: repetirla devuelve ya-inscrito y no duplica ni descuenta otro cupo", async () => {
      await inscribir(api, "est1");
      const r = await inscribir(api, "est1");
      assert.deepEqual(r.cuerpo, { resultado: "ya-inscrito" });
      assert.equal((await coleccion("inscripciones")).length, 1);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 1);
    });

    it("reconoce una inscripción antigua (ID aleatorio) y no la duplica", async () => {
      await sembrar("inscripciones/viejaAleatoria", { userId: "est1", jornadaId: "j1", nombreUsuario: "Ana" });
      await sembrar("jornadas/j1", docJornada({ cuposTotales: 2, cuposOcupados: 1 }));
      const r = await inscribir(api, "est1");
      assert.deepEqual(r.cuerpo, { resultado: "ya-inscrito" });
      assert.equal((await coleccion("inscripciones")).length, 1);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 1);
    });

    it("sin cupos: 409 SIN_CUPOS con el mensaje de siempre y sin cambios", async () => {
      await sembrar("jornadas/j1", docJornada({ cuposTotales: 1, cuposOcupados: 1 }));
      const r = await inscribir(api, "est1");
      assert.equal(r.estado, 409);
      assert.equal(r.cuerpo.error.codigo, "SIN_CUPOS");
      assert.equal(r.cuerpo.error.mensaje, "La jornada ya no tiene cupos disponibles.");
      assert.equal(await existe("inscripciones/est1_j1"), false);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 1);
    });

    it("jornada desactivada, vencida, sin fecha o inexistente: 409 JORNADA_NO_DISPONIBLE con su motivo", async () => {
      const casos = [
        [docJornada({ activa: false }), "La jornada fue desactivada."],
        [docJornada({ fecha: Timestamp.fromMillis(reloj.ahora - 1000) }), "La jornada ya finalizó."],
        [docJornada({ fecha: Timestamp.fromMillis(reloj.ahora) }), "La jornada ya finalizó."],
        [(() => { const d = docJornada(); delete d.fecha; return d; })(), "La jornada ya finalizó."],
        [docJornada({ activa: "true" }), "La jornada fue desactivada."],
      ];
      for (const [datos, mensaje] of casos) {
        await sembrar("jornadas/j1", datos);
        const r = await inscribir(api, "est1");
        assert.equal(r.estado, 409, mensaje);
        assert.equal(r.cuerpo.error.codigo, "JORNADA_NO_DISPONIBLE");
        assert.equal(r.cuerpo.error.mensaje, mensaje);
      }
      const inexistente = await inscribir(api, "est1", "no-existe");
      assert.equal(inexistente.cuerpo.error.mensaje, "La jornada ya no existe.");
      assert.equal((await coleccion("inscripciones")).length, 0);
    });

    it("una jornada con la fecha en el formato anterior (texto + hora) se valida igual", async () => {
      const dia = new Date(reloj.ahora + 10 * DIA).toISOString().slice(0, 10);
      const d = docJornada({ fecha: dia, hora: "09:30" });
      await sembrar("jornadas/j1", d);
      const r = await inscribir(api, "est1");
      assert.equal(r.cuerpo.resultado, "completada");
    });

    it("la inscripción ya hecha sigue contando aunque la jornada se haya desactivado después", async () => {
      await inscribir(api, "est1");
      await sembrar("jornadas/j1", docJornada({ activa: false, cuposOcupados: 1, cuposTotales: 2 }));
      assert.equal((await inscribir(api, "est1")).cuerpo.resultado, "ya-inscrito");
    });

    it("requiere sesión y una cuenta activa", async () => {
      assert.equal((await api.llamar(null, "PUT", "/v1/jornadas/j1/inscripcion", {})).estado, 401);
      await sembrar("users/baja", { uid: "baja", rol: "estudiante", activo: false });
      assert.equal((await inscribir(api, "baja")).estado, 403);
      assert.equal((await coleccion("inscripciones")).length, 0);
    });

    it("solo los alumnos se inscriben: gestor, alias maestro y administrador reciben 403 SIN_PERMISO y no cambia nada", async () => {
      for (const uid of ["gestorB", "maestroViejo", "admin1"]) {
        const r = await inscribir(api, uid);
        assert.equal(r.estado, 403, uid);
        assert.equal(r.cuerpo.error.codigo, "SIN_PERMISO", uid);
      }
      assert.equal((await coleccion("inscripciones")).length, 0);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 0);
      assert.equal((await leer("users/gestorB")).jornadasVistas, undefined, "tampoco se anota estado visto");
    });

    it("quien aún no tiene perfil (recién registrado) se trata como alumno y sí se inscribe", async () => {
      const r = await inscribir(api, "recienRegistrado");
      assert.equal(r.estado, 200);
      assert.equal(r.cuerpo.resultado, "completada");
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 1);
    });

    it("rechaza un título de jornada que no sea texto", async () => {
      const r = await inscribir(api, "est1", "j1", { tituloJornada: { x: 1 } });
      assert.equal(r.estado, 400);
    });
  });

  describe("concurrencia (transacciones)", () => {
    it("con 2 cupos y 8 alumnos a la vez, se inscriben exactamente 2", async () => {
      const uids = Array.from({ length: 8 }, (_, i) => `alumno${i}`);
      const respuestas = await Promise.all(uids.map((u) => inscribir(api, u)));
      const completadas = respuestas.filter((r) => r.cuerpo.resultado === "completada");
      const sinCupo = respuestas.filter((r) => r.cuerpo.error?.codigo === "SIN_CUPOS");
      assert.equal(completadas.length, 2);
      assert.equal(sinCupo.length, 6);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 2);
      assert.equal((await coleccion("inscripciones")).length, 2);
    });

    it("el mismo alumno enviando 5 veces a la vez queda inscrito una sola vez", async () => {
      await sembrar("jornadas/j1", docJornada({ cuposTotales: 10 }));
      const respuestas = await Promise.all(Array.from({ length: 5 }, () => inscribir(api, "est1")));
      assert.ok(respuestas.every((r) => r.estado === 200));
      assert.equal(respuestas.filter((r) => r.cuerpo.resultado === "completada").length, 1);
      assert.equal((await coleccion("inscripciones")).length, 1);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 1);
    });

    it("inscribir y cancelar a la vez deja los cupos cuadrados con las inscripciones", async () => {
      await sembrar("jornadas/j1", docJornada({ cuposTotales: 50 }));
      const otros = Array.from({ length: 10 }, (_, i) => `otro${i}`);
      await Promise.all(otros.map((u) => inscribir(api, u)));
      await Promise.all([
        ...otros.slice(0, 5).map((u) => cancelar(api, u)),
        ...["n1", "n2", "n3"].map((u) => inscribir(api, u)),
      ]);
      const inscritos = (await coleccion("inscripciones")).length;
      assert.equal(inscritos, 8);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, inscritos);
    });
  });

  describe("cancelar la inscripción", () => {
    it("borra la inscripción, libera el cupo y olvida el estado visto", async () => {
      await inscribir(api, "est1");
      const r = await cancelar(api, "est1");
      assert.deepEqual(r.cuerpo, { resultado: "completada" });
      assert.equal(await existe("inscripciones/est1_j1"), false);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 0);
      assert.equal((await leer("users/est1")).jornadasVistas.j1, undefined);
      assert.equal((await leer("users/est1")).rol, "estudiante");
    });

    it("es idempotente: cancelar de nuevo devuelve ya-cancelada y no toca los cupos", async () => {
      await inscribir(api, "est1");
      await inscribir(api, "est2");
      await cancelar(api, "est1");
      const r = await cancelar(api, "est1");
      assert.deepEqual(r.cuerpo, { resultado: "ya-cancelada" });
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 1);
      assert.equal(await existe("inscripciones/est2_j1"), true, "no toca la de otro alumno");
    });

    it("sin inscripción es ya-cancelada (y no falla si la jornada no existe)", async () => {
      assert.deepEqual((await cancelar(api, "est1")).cuerpo, { resultado: "ya-cancelada" });
      assert.deepEqual((await cancelar(api, "est1", "no-existe")).cuerpo, { resultado: "ya-cancelada" });
    });

    it("encuentra y borra una inscripción antigua (ID aleatorio)", async () => {
      await sembrar("inscripciones/vieja", { userId: "est1", jornadaId: "j1" });
      await sembrar("jornadas/j1", docJornada({ cuposTotales: 2, cuposOcupados: 1 }));
      assert.equal((await cancelar(api, "est1")).cuerpo.resultado, "completada");
      assert.equal(await existe("inscripciones/vieja"), false);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 0);
    });

    it("si la jornada fue eliminada igual se borra la inscripción", async () => {
      await inscribir(api, "est1");
      await api.llamar("gestorA", "DELETE", "/v1/jornadas/j1");
      assert.equal((await cancelar(api, "est1")).cuerpo.resultado, "completada");
      assert.equal(await existe("inscripciones/est1_j1"), false);
    });

    it("el contador nunca baja de 0", async () => {
      await sembrar("inscripciones/est1_j1", { userId: "est1", jornadaId: "j1" });
      await sembrar("jornadas/j1", docJornada({ cuposTotales: 2, cuposOcupados: 0 }));
      await cancelar(api, "est1");
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 0);
    });

    it("sigue funcionando aunque la jornada esté desactivada o vencida (el plazo de 2 días solo lo valida la app)", async () => {
      await inscribir(api, "est1");
      await sembrar("jornadas/j1", docJornada({ activa: false, cuposOcupados: 1, cuposTotales: 2, fecha: Timestamp.fromMillis(reloj.ahora + 60000) }));
      assert.equal((await cancelar(api, "est1")).cuerpo.resultado, "completada");
    });

    it("cancelar no se restringe por rol: quien se inscribió como alumno y luego pasó a gestor puede liberar su cupo", async () => {
      await sembrar("inscripciones/gestorB_j1", { userId: "gestorB", jornadaId: "j1" });
      await sembrar("jornadas/j1", docJornada({ cuposTotales: 2, cuposOcupados: 1 }));
      assert.equal((await cancelar(api, "gestorB")).cuerpo.resultado, "completada");
      assert.equal(await existe("inscripciones/gestorB_j1"), false);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 0);
    });

    it("requiere sesión", async () => {
      assert.equal((await api.llamar(null, "DELETE", "/v1/jornadas/j1/inscripcion")).estado, 401);
    });
  });
});
