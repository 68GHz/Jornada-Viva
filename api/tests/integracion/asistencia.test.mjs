import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  DIA, MINUTO, Timestamp, coleccion, docJornada, iniciarApi, leer, limpiar, reloj, sembrar, sembrarPerfiles,
} from "./entorno.mjs";

const inscripcion = (uid, jornadaId, extra = {}) => ({
  userId: uid,
  jornadaId,
  nombreUsuario: uid === "est1" ? "Ana" : "Beto",
  emailUsuario: `${uid}@x.co`,
  asistio: false,
  inscritoEn: Timestamp.fromMillis(reloj.ahora - DIA),
  ...extra,
});
const auditoria = async () => (await coleccion("auditoria")).map((a) => ({ accion: a.accion, entidadId: a.entidadId, detalle: a.detalle, actorId: a.actorId }));

describe("asistencia · código firmado del QR", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(reloj.ahora - 5 * MINUTO) }));
  });
  const pedir = (uid, jornada = "jA") => api.llamar(uid, "POST", `/v1/jornadas/${jornada}/asistencia/codigo`);

  it("el gestor de la jornada y el administrador obtienen un código con su vigencia y cuándo renovarlo", async () => {
    for (const uid of ["gestorA", "admin1"]) {
      const r = await pedir(uid);
      assert.equal(r.estado, 200, uid);
      assert.equal(typeof r.cuerpo.codigo, "string");
      assert.equal(r.cuerpo.expiraEn, reloj.ahora + 60 * 1000);
      assert.equal(r.cuerpo.renovarEnMs, 30 * 1000);
    }
  });

  it("no lo obtiene un gestor ajeno, un estudiante ni quien no tiene sesión; ni de una jornada inexistente", async () => {
    assert.equal((await pedir("gestorB")).estado, 403);
    assert.equal((await pedir("est1")).estado, 403);
    assert.equal((await pedir(null)).estado, 401);
    assert.equal((await pedir("gestorA", "noExiste")).estado, 404);
  });

  it("cada solicitud emite un código nuevo cuando pasa el tiempo", async () => {
    const a = (await pedir("gestorA")).cuerpo.codigo;
    reloj.ahora += 30 * 1000;
    const b = (await pedir("gestorA")).cuerpo.codigo;
    assert.notEqual(a, b);
  });
});

describe("asistencia · el estudiante registra la suya con el QR", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    // En curso: empezó hace 5 minutos y dura la hora por defecto
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(reloj.ahora - 5 * MINUTO) }));
    await sembrar("inscripciones/est1_jA", inscripcion("est1", "jA"));
  });
  const codigoDe = async (jornada = "jA") => (await api.llamar("gestorA", "POST", `/v1/jornadas/${jornada}/asistencia/codigo`)).cuerpo.codigo;
  const registrar = (uid, codigo, jornada = "jA") =>
    api.llamar(uid, "POST", `/v1/jornadas/${jornada}/asistencia`, codigo === undefined ? {} : { codigo });

  it("con un código vigente queda registrada por QR y repetirlo no cambia nada (idempotente)", async () => {
    const codigo = await codigoDe();
    const r = await registrar("est1", codigo);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { resultado: "registrada" });
    const i = await leer("inscripciones/est1_jA");
    assert.equal(i.asistio, true);
    assert.equal(i.metodoAsistencia, "qr");
    assert.ok(i.asistioEn instanceof Timestamp);

    reloj.ahora += 10 * 1000;
    const otra = await registrar("est1", await codigoDe());
    assert.deepEqual(otra.cuerpo, { resultado: "ya-registrada" });
    assert.equal((await leer("inscripciones/est1_jA")).asistioEn.toMillis(), i.asistioEn.toMillis());
  });

  it("sin sesión no se puede; sin código o con uno que no es código, tampoco", async () => {
    assert.equal((await registrar(null, "x")).estado, 401);
    const sin = await registrar("est1", undefined);
    assert.equal(sin.estado, 400);
    assert.equal(sin.cuerpo.error.campos.codigo, "Falta el código del QR.");
    const basura = await registrar("est1", "esto-no-es-un-codigo");
    assert.equal(basura.estado, 409);
    assert.equal(basura.cuerpo.error.codigo, "CODIGO_INVALIDO");
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("un código vencido se rechaza con un mensaje que explica qué hacer", async () => {
    const codigo = await codigoDe();
    reloj.ahora += 61 * 1000;
    const r = await registrar("est1", codigo);
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "CODIGO_CADUCADO");
    assert.match(r.cuerpo.error.mensaje, /caducó/);
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("un código de otra jornada no vale", async () => {
    await sembrar("jornadas/jB", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(reloj.ahora - 5 * MINUTO) }));
    const deOtra = await codigoDe("jB");
    const r = await registrar("est1", deOtra, "jA");
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "CODIGO_INVALIDO");
    assert.match(r.cuerpo.error.mensaje, /otra jornada/);
  });

  it("un código inventado por el estudiante (firmado con otro secreto) no vale", async () => {
    const { generarCodigo } = await import("../../src/dominio/codigoAsistencia.js");
    const falso = generarCodigo({ jornadaId: "jA", ahoraMs: reloj.ahora, vigenciaMs: 60000, secreto: "adivinado" }).codigo;
    const r = await registrar("est1", falso);
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "CODIGO_INVALIDO");
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("quien no está inscrito no registra asistencia, y nunca se toca la de otro estudiante", async () => {
    const r = await registrar("est2", await codigoDe());
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "NO_INSCRITO");
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("solo dentro de la ventana: antes de empezar y pasados los 20 minutos se rechaza", async () => {
    await sembrar("jornadas/futura", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(reloj.ahora + 10 * MINUTO) }));
    await sembrar("inscripciones/est1_futura", inscripcion("est1", "futura"));
    const antes = await registrar("est1", await codigoDe("futura"), "futura");
    assert.equal(antes.estado, 409);
    assert.equal(antes.cuerpo.error.codigo, "ASISTENCIA_FUERA_DE_VENTANA");
    assert.match(antes.cuerpo.error.mensaje, /iniciará/);

    // Empezó hace 5 min: a los 20 min y 1 s de inicio la ventana ya cerró (aunque la jornada siga en curso)
    reloj.ahora += 15 * MINUTO + 1000;
    const tarde = await registrar("est1", await codigoDe());
    assert.equal(tarde.estado, 409);
    assert.equal(tarde.cuerpo.error.codigo, "ASISTENCIA_FUERA_DE_VENTANA");
    assert.match(tarde.cuerpo.error.mensaje, /20 minutos/);
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("el límite exacto de los 20 minutos todavía vale", async () => {
    reloj.ahora += 15 * MINUTO; // 20 min exactos desde el inicio
    const r = await registrar("est1", await codigoDe());
    assert.equal(r.estado, 200);
  });

  it("en una jornada de 10 minutos la ventana es toda la jornada", async () => {
    await sembrar("jornadas/corta", docJornada({ creadoPor: "gestorA", duracionMin: 10, fecha: Timestamp.fromMillis(reloj.ahora - 5 * MINUTO) }));
    await sembrar("inscripciones/est1_corta", inscripcion("est1", "corta"));
    assert.equal((await registrar("est1", await codigoDe("corta"), "corta")).estado, 200);

    await sembrar("inscripciones/est2_corta", inscripcion("est2", "corta"));
    reloj.ahora += 6 * MINUTO; // ya pasaron 11 min de una jornada de 10
    const r = await registrar("est2", await codigoDe("corta"), "corta");
    assert.equal(r.estado, 409);
    assert.match(r.cuerpo.error.mensaje, /10 minutos/);
  });

  it("una jornada cancelada o eliminada no registra asistencia", async () => {
    const codigo = await codigoDe();
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", activa: false, fecha: Timestamp.fromMillis(reloj.ahora - 5 * MINUTO) }));
    const cancelada = await registrar("est1", codigo);
    assert.equal(cancelada.estado, 409);
    assert.equal(cancelada.cuerpo.error.codigo, "JORNADA_NO_DISPONIBLE");

    // Un código bien firmado de una jornada que ya no existe tampoco sirve
    const { generarCodigo } = await import("../../src/dominio/codigoAsistencia.js");
    const { SECRETO_ASISTENCIA } = await import("./entorno.mjs");
    const huerfano = generarCodigo({ jornadaId: "fantasma", ahoraMs: reloj.ahora, vigenciaMs: 60000, secreto: SECRETO_ASISTENCIA }).codigo;
    const r = await registrar("est1", huerfano, "fantasma");
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "JORNADA_NO_DISPONIBLE");
  });
});

describe("asistencia · marcado manual del gestor y del administrador", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(reloj.ahora - 5 * MINUTO) }));
    await sembrar("jornadas/jB", docJornada({ creadoPor: "gestorB", fecha: Timestamp.fromMillis(reloj.ahora - 5 * MINUTO) }));
    await sembrar("inscripciones/est1_jA", inscripcion("est1", "jA"));
    await sembrar("inscripciones/est2_jB", inscripcion("est2", "jB"));
  });
  const marcar = (uid, asistio, { jornada = "jA", inscripcion: id = "est1_jA" } = {}) =>
    api.llamar(uid, "PUT", `/v1/jornadas/${jornada}/inscritos/${id}/asistencia`, asistio === undefined ? {} : { asistio });

  it("el gestor marca y quita la asistencia, y queda quién y cuándo lo hizo", async () => {
    const r = await marcar("gestorA", true);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { asistio: true });
    const i = await leer("inscripciones/est1_jA");
    assert.equal(i.asistio, true);
    assert.equal(i.metodoAsistencia, "manual");
    assert.equal(i.asistenciaModificadaPor, "gestorA");
    assert.ok(i.asistioEn instanceof Timestamp);
    assert.ok(i.asistenciaModificadaEn instanceof Timestamp);
    assert.deepEqual(await auditoria(), [], "solo las acciones del administrador se auditan");

    assert.deepEqual((await marcar("gestorA", false)).cuerpo, { asistio: false });
    const quitada = await leer("inscripciones/est1_jA");
    assert.equal(quitada.asistio, false);
    assert.equal(quitada.asistioEn, null);
  });

  it("sin límite de tiempo: puede corregirla horas o días después de terminar la jornada", async () => {
    reloj.ahora += 3 * DIA;
    assert.equal((await marcar("gestorA", true)).estado, 200);
    assert.equal((await leer("inscripciones/est1_jA")).asistio, true);
  });

  it("desde que empieza: antes de la hora de inicio no se puede marcar", async () => {
    await sembrar("jornadas/futura", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(reloj.ahora + 10 * MINUTO) }));
    await sembrar("inscripciones/est1_futura", inscripcion("est1", "futura"));
    const r = await marcar("gestorA", true, { jornada: "futura", inscripcion: "est1_futura" });
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "ASISTENCIA_NO_INICIADA");
    assert.equal((await leer("inscripciones/est1_futura")).asistio, false);
  });

  it("marcar lo que ya está así no cambia nada (no pisa el método ni quién la registró)", async () => {
    const asistioEn = Timestamp.fromMillis(reloj.ahora - MINUTO);
    await sembrar("inscripciones/est1_jA", inscripcion("est1", "jA", { asistio: true, asistioEn, metodoAsistencia: "qr" }));
    assert.deepEqual((await marcar("gestorA", true)).cuerpo, { asistio: true });
    const i = await leer("inscripciones/est1_jA");
    assert.equal(i.metodoAsistencia, "qr");
    assert.equal("asistenciaModificadaPor" in i, false);
    assert.equal(i.asistioEn.toMillis(), asistioEn.toMillis());
  });

  it("un gestor ajeno, un estudiante o quien no tiene sesión no pueden", async () => {
    assert.equal((await marcar("gestorB", true)).estado, 403);
    assert.equal((await marcar("est1", true)).estado, 403);
    assert.equal((await marcar(null, true)).estado, 401);
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("el administrador puede con cualquier jornada y queda en la auditoría", async () => {
    assert.equal((await marcar("admin1", true)).estado, 200);
    assert.deepEqual(await auditoria(), [
      { accion: "asistencia.marcar", entidadId: "est1_jA", detalle: "Jornada de salud · Ana", actorId: "admin1" },
    ]);
    assert.equal((await marcar("admin1", false)).estado, 200);
    assert.equal((await auditoria()).length, 2);
    assert.equal((await coleccion("auditoria")).some((a) => a.accion === "asistencia.desmarcar"), true);
  });

  it("valida el cuerpo y que la inscripción exista en esa jornada", async () => {
    const mal = await marcar("gestorA", "si");
    assert.equal(mal.estado, 400);
    assert.equal(mal.cuerpo.error.campos.asistio, "Indica si asistió (true) o no (false).");
    assert.equal((await marcar("gestorA", undefined)).estado, 400);

    // La inscripción de otra jornada no se puede marcar usando la ruta de esta
    assert.equal((await marcar("gestorA", true, { inscripcion: "est2_jB" })).estado, 404);
    assert.equal((await marcar("gestorA", true, { inscripcion: "noExiste" })).estado, 404);
    assert.equal((await marcar("gestorA", true, { jornada: "noExiste" })).estado, 404);
    assert.equal((await leer("inscripciones/est2_jB")).asistio, false);
  });

  it("la lista de inscritos informa cómo se registró cada asistencia", async () => {
    await sembrar("inscripciones/est2_jA", inscripcion("est2", "jA", { asistio: true, metodoAsistencia: "qr" }));
    await marcar("gestorA", true);
    const r = await api.llamar("gestorA", "GET", "/v1/jornadas/jA/inscritos");
    const metodos = Object.fromEntries(r.cuerpo.inscritos.map((x) => [x.userId, x.metodoAsistencia]));
    assert.deepEqual(metodos, { est1: "manual", est2: "qr" });
  });
});
