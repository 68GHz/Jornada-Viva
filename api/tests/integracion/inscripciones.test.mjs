import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  DIA, MINUTO, Timestamp, coleccion, db, docJornada, existe, iniciarApi, leer, limpiar, reloj, sembrar, sembrarPerfiles,
} from "./entorno.mjs";
import { combinarFechaHora } from "../../src/dominio/zonaNegocio.js";

const inscribir = (api, uid, jornada = "j1", cuerpo) =>
  api.llamar(uid, "PUT", `/v1/jornadas/${jornada}/inscripcion`, cuerpo ?? { nombreUsuario: uid, emailUsuario: `${uid}@x.co` });
const cancelar = (api, uid, jornada = "j1", cuerpo) =>
  api.llamar(uid, "DELETE", `/v1/jornadas/${jornada}/inscripcion`, cuerpo);

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

    it("sigue funcionando aunque la jornada esté desactivada (si el plazo de 2 días no ha vencido)", async () => {
      await inscribir(api, "est1");
      await sembrar("jornadas/j1", docJornada({ activa: false, cuposOcupados: 1, cuposTotales: 2 })); // dentro de 5 días
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

  describe("plazo de cancelación (2 días, validado por el servidor)", () => {
    const D = "2026-11-20"; // día de la jornada de estas pruebas
    const jornadaEl = (dia, hora) => Timestamp.fromMillis(combinarFechaHora(dia, hora));
    const ahoraEs = (dia, hora) => {
      reloj.ahora = combinarFechaHora(dia, hora);
    };
    const relojOriginal = reloj.ahora;

    beforeEach(async () => {
      await sembrar("jornadas/j1", docJornada({ fecha: jornadaEl(D, "08:00"), cuposTotales: 2, cuposOcupados: 1 }));
      await sembrar("inscripciones/est1_j1", { userId: "est1", jornadaId: "j1", asistio: false });
    });
    after(() => {
      reloj.ahora = relojOriginal;
    });

    const sigueInscrito = async () => {
      assert.equal(await existe("inscripciones/est1_j1"), true, "la inscripción sigue");
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 1, "el cupo sigue ocupado");
    };

    it("dentro del plazo: se cancela y se libera el cupo", async () => {
      ahoraEs("2026-11-17", "12:00");
      assert.equal((await cancelar(api, "est1")).cuerpo.resultado, "completada");
      assert.equal(await existe("inscripciones/est1_j1"), false);
      assert.equal((await leer("jornadas/j1")).cuposOcupados, 0);
    });

    it("el último minuto del día límite (2 días antes) todavía se puede cancelar", async () => {
      ahoraEs("2026-11-18", "23:59");
      assert.equal((await cancelar(api, "est1")).estado, 200);
      assert.equal(await existe("inscripciones/est1_j1"), false);
    });

    it("desde el primer minuto del día siguiente: 409 PLAZO_VENCIDO y no cambia nada", async () => {
      ahoraEs("2026-11-19", "00:00");
      const r = await cancelar(api, "est1");
      assert.equal(r.estado, 409);
      assert.equal(r.cuerpo.error.codigo, "PLAZO_VENCIDO");
      assert.equal(r.cuerpo.error.mensaje, "Solo puedes cancelar hasta 2 días antes de la jornada.");
      await sigueInscrito();
    });

    it("el mismo día de la jornada, ya empezada o ya terminada: tampoco se puede", async () => {
      for (const [dia, hora] of [["2026-11-20", "07:00"], ["2026-11-20", "08:30"], ["2026-11-21", "10:00"]]) {
        ahoraEs(dia, hora);
        const r = await cancelar(api, "est1");
        assert.equal(r.cuerpo.error?.codigo, "PLAZO_VENCIDO", `${dia} ${hora}`);
      }
      await sigueInscrito();
    });

    it("una jornada desactivada también respeta el plazo (la regla es por fecha)", async () => {
      await sembrar("jornadas/j1", docJornada({ activa: false, fecha: jornadaEl(D, "08:00"), cuposTotales: 2, cuposOcupados: 1 }));
      ahoraEs("2026-11-19", "10:00");
      assert.equal((await cancelar(api, "est1")).cuerpo.error?.codigo, "PLAZO_VENCIDO");
      await sigueInscrito();
    });

    it("repetir una cancelación ya hecha sigue siendo «ya-cancelada», aunque el plazo haya vencido", async () => {
      ahoraEs("2026-11-17", "12:00");
      await cancelar(api, "est1");
      ahoraEs("2026-11-20", "12:00");
      const r = await cancelar(api, "est1");
      assert.equal(r.estado, 200);
      assert.equal(r.cuerpo.resultado, "ya-cancelada");
    });

    it("si la jornada fue eliminada, la inscripción huérfana se borra aunque el plazo ya hubiera vencido", async () => {
      await db.doc("jornadas/j1").delete();
      ahoraEs("2026-11-21", "12:00");
      assert.equal((await cancelar(api, "est1")).cuerpo.resultado, "completada");
      assert.equal(await existe("inscripciones/est1_j1"), false);
    });

    it("una jornada sin fecha no se puede evaluar: liberar el cupo se permite", async () => {
      const sinFecha = docJornada({ cuposTotales: 2, cuposOcupados: 1 });
      delete sinFecha.fecha;
      await sembrar("jornadas/j1", sinFecha);
      ahoraEs("2026-11-19", "10:00");
      assert.equal((await cancelar(api, "est1")).cuerpo.resultado, "completada");
    });

    describe("cancelación hecha sin conexión (hora del cliente)", () => {
      it("se valida con la hora en que se hizo, aunque llegue después de vencido el plazo", async () => {
        ahoraEs("2026-11-19", "09:00"); // el servidor la recibe cuando el plazo ya venció
        const r = await cancelar(api, "est1", "j1", { canceladaEn: combinarFechaHora("2026-11-18", "20:00") });
        assert.equal(r.cuerpo.resultado, "completada");
        assert.equal(await existe("inscripciones/est1_j1"), false);
        assert.equal((await leer("jornadas/j1")).cuposOcupados, 0);
      });

      it("pero si la hizo ya fuera de plazo, se rechaza igual", async () => {
        ahoraEs("2026-11-20", "09:00");
        const r = await cancelar(api, "est1", "j1", { canceladaEn: combinarFechaHora("2026-11-19", "20:00") });
        assert.equal(r.cuerpo.error?.codigo, "PLAZO_VENCIDO");
        await sigueInscrito();
      });

      it("una hora del cliente adelantada (en el futuro) no ayuda: manda la del servidor", async () => {
        ahoraEs("2026-11-19", "09:00");
        const r = await cancelar(api, "est1", "j1", { canceladaEn: reloj.ahora + 40 * DIA });
        assert.equal(r.cuerpo.error?.codigo, "PLAZO_VENCIDO");
        await sigueInscrito();
      });

      it("una hora demasiado antigua (más de 7 días) se rechaza: 409 ACCION_DEMASIADO_ANTIGUA", async () => {
        ahoraEs("2026-11-19", "09:00");
        const r = await cancelar(api, "est1", "j1", { canceladaEn: reloj.ahora - 8 * DIA });
        assert.equal(r.estado, 409);
        assert.equal(r.cuerpo.error.codigo, "ACCION_DEMASIADO_ANTIGUA");
        await sigueInscrito();
      });

      it("justo en el límite de antigüedad (7 días) todavía se acepta", async () => {
        ahoraEs("2026-11-19", "09:00"); // hace exactamente 7 días: el 12/11, dentro del plazo
        const r = await cancelar(api, "est1", "j1", { canceladaEn: reloj.ahora - 7 * DIA });
        assert.equal(r.estado, 200);
        assert.equal(r.cuerpo.resultado, "completada");
      });

      it("el límite de antigüedad se puede configurar", async () => {
        const corta = await iniciarApi({ cancelacionAntiguedadMaxMs: 60 * MINUTO });
        try {
          ahoraEs("2026-11-17", "12:00");
          const vieja = await corta.llamar("est1", "DELETE", "/v1/jornadas/j1/inscripcion", { canceladaEn: reloj.ahora - 2 * 60 * MINUTO });
          assert.equal(vieja.cuerpo.error?.codigo, "ACCION_DEMASIADO_ANTIGUA");
          const reciente = await corta.llamar("est1", "DELETE", "/v1/jornadas/j1/inscripcion", { canceladaEn: reloj.ahora - 30 * MINUTO });
          assert.equal(reciente.cuerpo.resultado, "completada");
        } finally {
          await corta.cerrar();
        }
      });

      it("una hora que no es un número válido es un error de validación (400) y no cambia nada", async () => {
        ahoraEs("2026-11-17", "12:00");
        for (const canceladaEn of ["ayer", "1700000000000", -5, 0, true, {}, [123]]) {
          const r = await cancelar(api, "est1", "j1", { canceladaEn });
          assert.equal(r.estado, 400, JSON.stringify(canceladaEn));
          assert.ok(r.cuerpo.error.campos.canceladaEn);
        }
        await sigueInscrito();
      });

      it("con conexión no hace falta enviar la hora: se usa la del servidor (compatible con la app anterior)", async () => {
        ahoraEs("2026-11-19", "09:00");
        assert.equal((await cancelar(api, "est1")).cuerpo.error?.codigo, "PLAZO_VENCIDO");
        ahoraEs("2026-11-17", "09:00");
        assert.equal((await cancelar(api, "est1", "j1", {})).cuerpo.resultado, "completada");
      });
    });
  });
});
