import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  DIA, Timestamp, coleccion, cuerpoJornada, docJornada, existe, iniciarApi, leer, limpiar, reloj, sembrar, sembrarPerfiles,
} from "./entorno.mjs";

const inscribir = (api, uid, jornada = "j1") =>
  api.llamar(uid, "PUT", `/v1/jornadas/${jornada}/inscripcion`, { nombreUsuario: uid, emailUsuario: `${uid}@x.co` });
const avisosDe = async (uid) => (await coleccion("notificaciones")).filter((n) => n.userId === uid);
const tipos = async (uid) => (await avisosDe(uid)).map((n) => n.tipo).sort();

describe("M3/M4 · avisos de cambios creados por el servidor", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    await sembrar("jornadas/j1", docJornada({ cuposTotales: 30 }));
    await inscribir(api, "est1");
    await inscribir(api, "est2");
  });

  it("cancelar avisa a TODOS los inscritos, con el texto de siempre y datos de la jornada", async () => {
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    for (const uid of ["est1", "est2"]) {
      const [n, ...resto] = await avisosDe(uid);
      assert.equal(resto.length, 0);
      assert.equal(n.tipo, "cancelacion");
      assert.equal(n.titulo, "Jornada cancelada: Jornada de salud");
      assert.equal(n.mensaje, 'La jornada "Jornada de salud" ha sido cancelada por el organizador.');
      assert.equal(n.leida, false);
      assert.ok(n.creadaEn);
      assert.equal(n.jornadaId, "j1");
      assert.equal(n.datosJornada.titulo, "Jornada de salud");
      assert.equal(n.datosJornada.lugar, "Coliseo");
      assert.ok(n.datosJornada.fecha instanceof Timestamp);
    }
  });

  it("no avisa a quien no está inscrito", async () => {
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    assert.deepEqual(await avisosDe("gestorB"), []);
    assert.deepEqual(await avisosDe("admin1"), []);
  });

  it("reactivar avisa de la reactivación", async () => {
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/reactivar");
    assert.deepEqual(await tipos("est1"), ["cancelacion", "reactivacion"]);
    const r = (await avisosDe("est1")).find((n) => n.tipo === "reactivacion");
    assert.equal(r.titulo, "Jornada reactivada: Jornada de salud");
  });

  it("cambiar la fecha avisa de la reprogramación", async () => {
    await api.llamar("gestorA", "PUT", "/v1/jornadas/j1", cuerpoJornada({ fecha: reloj.ahora + 9 * DIA, cuposTotales: 30 }));
    assert.deepEqual(await tipos("est1"), ["reprogramacion"]);
    assert.equal((await avisosDe("est1"))[0].titulo, "Jornada reprogramada: Jornada de salud");
  });

  it("cambiar lugar, descripción, responsable, título o entidad avisa de la actualización", async () => {
    await api.llamar("gestorA", "PUT", "/v1/jornadas/j1", cuerpoJornada({ lugar: "Auditorio", titulo: "Otro título", cuposTotales: 30, fecha: (await leer("jornadas/j1")).fecha.toMillis() }));
    const [n] = await avisosDe("est1");
    assert.equal(n.tipo, "actualizacion");
    assert.equal(n.mensaje, 'Se ha modificado el lugar, el título en la jornada "Otro título".');
  });

  it("cambiar solo los cupos no genera aviso", async () => {
    await api.llamar("gestorA", "PUT", "/v1/jornadas/j1", cuerpoJornada({ cuposTotales: 40, fecha: (await leer("jornadas/j1")).fecha.toMillis() }));
    assert.deepEqual(await avisosDe("est1"), []);
    assert.equal((await leer("jornadas/j1")).cuposTotales, 40);
  });

  it("eliminar avisa con los datos que el alumno conocía y se olvida el estado visto", async () => {
    await api.llamar("gestorA", "DELETE", "/v1/jornadas/j1");
    const [n] = await avisosDe("est1");
    assert.equal(n.tipo, "eliminacion");
    assert.equal(n.titulo, "Jornada eliminada: Jornada de salud");
    assert.equal(n.mensaje, 'La jornada "Jornada de salud" fue eliminada por el organizador y ya no está disponible.');
    assert.equal(n.datosJornada.fecha, null);
    assert.equal((await leer("users/est1")).jornadasVistas.j1, undefined);
  });

  it("no repite el aviso: guardar de nuevo la misma jornada no crea otro", async () => {
    const datos = cuerpoJornada({ lugar: "Auditorio", cuposTotales: 30, fecha: (await leer("jornadas/j1")).fecha.toMillis() });
    await api.llamar("gestorA", "PUT", "/v1/jornadas/j1", datos);
    await api.llamar("gestorA", "PUT", "/v1/jornadas/j1", datos);
    assert.equal((await avisosDe("est1")).length, 1);
  });

  it("el estado visto se actualiza: tras un cambio, el siguiente aviso compara con el nuevo estado", async () => {
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    assert.equal((await leer("users/est1")).jornadasVistas.j1.activa, false);
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    assert.equal((await avisosDe("est1")).length, 1, "cancelar dos veces avisa una sola vez");
  });

  it("quien canceló su inscripción ya no recibe avisos", async () => {
    await api.llamar("est2", "DELETE", "/v1/jornadas/j1/inscripcion");
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    assert.deepEqual(await avisosDe("est2"), []);
    assert.equal((await avisosDe("est1")).length, 1);
  });

  it("un cambio hecho mientras el alumno tenía la sesión cerrada igual le llega (no depende del dispositivo)", async () => {
    // El estado visto vive en Firestore: no hay nada que perder al cerrar sesión
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/reactivar");
    assert.deepEqual(await tipos("est1"), ["cancelacion", "reactivacion"]);
  });

  it("una inscripción anterior a esta función (sin estado visto) no avisa, solo anota el estado", async () => {
    await sembrar("inscripciones/vieja", { userId: "est3", jornadaId: "j1" });
    await sembrar("users/est3", { uid: "est3", rol: "estudiante" });
    await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    assert.deepEqual(await avisosDe("est3"), []);
    assert.equal((await leer("users/est3")).jornadasVistas.j1.activa, false);
  });

  it("si el administrador cancela, el aviso es el mismo (y la acción queda auditada)", async () => {
    await api.llamar("admin1", "POST", "/v1/jornadas/j1/cancelar");
    assert.deepEqual(await tipos("est1"), ["cancelacion"]);
    assert.equal((await coleccion("auditoria")).length, 1);
  });

  it("con muchos inscritos (más de un lote) todos reciben su aviso", async () => {
    await sembrar("jornadas/grande", docJornada({ cuposTotales: 500, cuposOcupados: 230 }));
    const lote = [];
    for (let i = 0; i < 230; i++) {
      lote.push(sembrar(`users/m${i}`, { uid: `m${i}`, rol: "estudiante", jornadasVistas: { grande: { activa: true, fecha: 1, titulo: "Jornada de salud", lugar: "Coliseo", descripcion: "Chequeos médicos gratuitos", responsable: "Gestor A", entidad: "TdeA" } } }));
      lote.push(sembrar(`inscripciones/m${i}_grande`, { userId: `m${i}`, jornadaId: "grande" }));
    }
    await Promise.all(lote);
    const antes = (await coleccion("notificaciones")).length;
    await api.llamar("gestorA", "POST", "/v1/jornadas/grande/cancelar");
    assert.equal((await coleccion("notificaciones")).length - antes, 230);
  });

  it("datos de perfil inesperados de un inscrito no impiden el cambio de la jornada", async () => {
    // un inscrito con jornadasVistas que no es un mapa no debe impedir el cambio
    await sembrar("users/est2", { uid: "est2", rol: "estudiante", jornadasVistas: "roto" });
    const r = await api.llamar("gestorA", "POST", "/v1/jornadas/j1/cancelar");
    assert.equal(r.estado, 204);
    assert.equal((await leer("jornadas/j1")).activa, false);
  });
});

describe("M3 · jornadas vencidas (tarea del servidor)", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
  });

  it("desactiva las activas cuya fecha ya pasó y deja el resto como está", async () => {
    await sembrar("jornadas/vencida", docJornada({ fecha: Timestamp.fromMillis(reloj.ahora - 1000) }));
    await sembrar("jornadas/futura", docJornada());
    await sembrar("jornadas/yaCancelada", docJornada({ activa: false, fecha: Timestamp.fromMillis(reloj.ahora - DIA) }));
    const sinFecha = docJornada();
    delete sinFecha.fecha;
    await sembrar("jornadas/sinFecha", sinFecha);
    await sembrar("jornadas/legadoVencida", docJornada({ fecha: new Date(reloj.ahora - 30 * DIA).toISOString().slice(0, 10), hora: "10:00" }));

    const r = await api.llamar("est1", "POST", "/v1/mantenimiento/vencidas");
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { desactivadas: 2 });
    assert.equal((await leer("jornadas/vencida")).activa, false);
    assert.equal((await leer("jornadas/legadoVencida")).activa, false);
    assert.equal((await leer("jornadas/futura")).activa, true);
    assert.equal((await leer("jornadas/sinFecha")).activa, true, "sin fecha no se desactiva");
  });

  it("vencer NO es cancelar: no genera aviso, pero sí actualiza el estado visto", async () => {
    await sembrar("jornadas/j1", docJornada({ cuposTotales: 5 }));
    await api.llamar("est1", "PUT", "/v1/jornadas/j1/inscripcion", { nombreUsuario: "Ana", emailUsuario: "ana@x.co" });
    reloj.ahora += 6 * DIA;
    await api.llamar("est2", "POST", "/v1/mantenimiento/vencidas");
    assert.equal((await leer("jornadas/j1")).activa, false);
    assert.deepEqual(await avisosDe("est1"), []);
    assert.equal((await leer("users/est1")).jornadasVistas.j1.activa, false);
  });

  it("es idempotente y lo puede pedir cualquier usuario con sesión (no sin ella)", async () => {
    await sembrar("jornadas/vencida", docJornada({ fecha: Timestamp.fromMillis(reloj.ahora - 1000) }));
    assert.equal((await api.llamar("est1", "POST", "/v1/mantenimiento/vencidas")).cuerpo.desactivadas, 1);
    assert.equal((await api.llamar("est1", "POST", "/v1/mantenimiento/vencidas")).cuerpo.desactivadas, 0);
    assert.equal((await api.llamar(null, "POST", "/v1/mantenimiento/vencidas")).estado, 401);
  });

  it("una jornada vencida desactivada no se puede reactivar sin cambiar antes la fecha", async () => {
    await sembrar("jornadas/vencida", docJornada({ fecha: Timestamp.fromMillis(reloj.ahora - 1000) }));
    await api.llamar("est1", "POST", "/v1/mantenimiento/vencidas");
    assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas/vencida/reactivar")).estado, 409);
    assert.equal((await api.llamar("gestorA", "PUT", "/v1/jornadas/vencida", cuerpoJornada({ fecha: reloj.ahora + 3 * DIA }))).estado, 204);
    assert.equal((await api.llamar("gestorA", "POST", "/v1/jornadas/vencida/reactivar")).estado, 204);
    assert.equal((await leer("jornadas/vencida")).activa, true);
  });
});

describe("M4 · notificaciones del usuario", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    for (const id of ["n1", "n2"]) await sembrar(`notificaciones/${id}`, { userId: "est1", leida: false, titulo: id });
    await sembrar("notificaciones/n3", { userId: "est1", leida: true, titulo: "n3" });
    await sembrar("notificaciones/ajena", { userId: "est2", leida: false, titulo: "ajena" });
  });

  it("marca una como leída (con la hora) y no toca las demás", async () => {
    assert.equal((await api.llamar("est1", "PATCH", "/v1/me/notificaciones/n1", { leida: true })).estado, 204);
    const n1 = await leer("notificaciones/n1");
    assert.equal(n1.leida, true);
    assert.ok(n1.leidaEn);
    assert.equal(n1.titulo, "n1");
    assert.equal((await leer("notificaciones/n2")).leida, false);
  });

  it("solo se puede marcar como leída (no como no leída ni cambiar otros campos)", async () => {
    for (const cuerpo of [{ leida: false }, { titulo: "x" }, {}]) {
      assert.equal((await api.llamar("est1", "PATCH", "/v1/me/notificaciones/n1", cuerpo)).estado, 400);
    }
    assert.equal((await leer("notificaciones/n1")).titulo, "n1");
  });

  it("no puede tocar las notificaciones de otro usuario ni las inexistentes", async () => {
    assert.equal((await api.llamar("est1", "PATCH", "/v1/me/notificaciones/ajena", { leida: true })).estado, 403);
    assert.equal((await api.llamar("est1", "DELETE", "/v1/me/notificaciones/ajena")).estado, 403);
    assert.equal((await api.llamar("est1", "PATCH", "/v1/me/notificaciones/nada", { leida: true })).estado, 404);
    assert.equal((await leer("notificaciones/ajena")).leida, false);
    assert.equal(await existe("notificaciones/ajena"), true);
  });

  it("marcar todas como leídas solo afecta las del usuario", async () => {
    const r = await api.llamar("est1", "POST", "/v1/me/notificaciones/leer-todas", {});
    assert.deepEqual(r.cuerpo, { marcadas: 2 });
    assert.equal((await leer("notificaciones/n1")).leida, true);
    assert.equal((await leer("notificaciones/n2")).leida, true);
    assert.equal((await leer("notificaciones/ajena")).leida, false);
  });

  it("marcar una lista de ids: si alguno es ajeno se rechaza todo sin cambios", async () => {
    const mala = await api.llamar("est1", "POST", "/v1/me/notificaciones/leer-todas", { ids: ["n1", "ajena"] });
    assert.equal(mala.estado, 403);
    assert.equal((await leer("notificaciones/n1")).leida, false);
    const buena = await api.llamar("est1", "POST", "/v1/me/notificaciones/leer-todas", { ids: ["n1"] });
    assert.deepEqual(buena.cuerpo, { marcadas: 1 });
    assert.equal((await api.llamar("est1", "POST", "/v1/me/notificaciones/leer-todas", { ids: "n1" })).estado, 400);
  });

  it("elimina la suya", async () => {
    assert.equal((await api.llamar("est1", "DELETE", "/v1/me/notificaciones/n1")).estado, 204);
    assert.equal(await existe("notificaciones/n1"), false);
    assert.equal(await existe("notificaciones/n2"), true);
  });

  it("guarda el token de notificaciones push en el perfil (sin tocar el rol)", async () => {
    assert.equal((await api.llamar("est1", "PUT", "/v1/me/push-token", { token: "ExponentPushToken[abc]" })).estado, 204);
    const perfil = await leer("users/est1");
    assert.equal(perfil.pushToken, "ExponentPushToken[abc]");
    assert.ok(perfil.pushTokenActualizadoEn);
    assert.equal(perfil.rol, "estudiante");
    assert.equal((await api.llamar("est1", "PUT", "/v1/me/push-token", { token: "" })).estado, 400);
    assert.equal((await api.llamar("sinPerfil", "PUT", "/v1/me/push-token", { token: "t" })).estado, 404);
  });

  it("todo requiere sesión", async () => {
    assert.equal((await api.llamar(null, "PATCH", "/v1/me/notificaciones/n1", { leida: true })).estado, 401);
    assert.equal((await api.llamar(null, "PUT", "/v1/me/push-token", { token: "t" })).estado, 401);
  });
});
