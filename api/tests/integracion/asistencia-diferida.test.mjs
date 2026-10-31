import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  DIA, MINUTO, SECRETO_ASISTENCIA, Timestamp, coleccion, docJornada, iniciarApi, leer, limpiar, reloj, sembrar,
  sembrarPerfiles,
} from "./entorno.mjs";
import { generarCodigo } from "../../src/dominio/codigoAsistencia.js";

// D5 (nivel mínimo): la asistencia hecha SIN conexión se envía después con la hora en que ocurrió y el
// servidor la valida con esa hora (acotada por la suya y por un máximo de 24 h).
const HORA = 60 * MINUTO;
const inscripcion = (uid, jornadaId, extra = {}) => ({
  userId: uid, jornadaId, nombreUsuario: uid, emailUsuario: `${uid}@x.co`, asistio: false,
  inscritoEn: Timestamp.fromMillis(reloj.ahora - DIA), ...extra,
});
const ms = (ts) => ts?.toMillis?.() ?? null;
const auditoria = async () => (await coleccion("auditoria")).map((a) => a.accion);

describe("asistencia sin conexión · el estudiante escanea y se sincroniza después", () => {
  let api;
  let T0; // hora del servidor cuando el gestor mostró el QR
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    T0 = reloj.ahora;
    // En curso: empezó hace 5 minutos y dura la hora por defecto
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(T0 - 5 * MINUTO) }));
    await sembrar("inscripciones/est1_jA", inscripcion("est1", "jA"));
  });

  const emitir = async (jornada = "jA") => {
    reloj.ahora = T0;
    return (await api.llamar("gestorA", "POST", `/v1/jornadas/${jornada}/asistencia/codigo`)).cuerpo.codigo;
  };
  // Envía como lo haría la cola al reconectar: `cuando` es la hora de la sincronización
  const enviar = (uid, codigo, escaneadoEn, cuando, jornada = "jA") => {
    reloj.ahora = cuando;
    return api.llamar(uid, "POST", `/v1/jornadas/${jornada}/asistencia`, {
      codigo,
      ...(escaneadoEn === undefined ? {} : { escaneadoEn }),
    });
  };

  it("un escaneo hecho sin conexión se registra horas después con la hora del escaneo y la de la sincronización", async () => {
    const codigo = await emitir();
    const r = await enviar("est1", codigo, T0 + 10_000, T0 + 3 * HORA);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo, { resultado: "registrada" });
    const i = await leer("inscripciones/est1_jA");
    assert.equal(i.asistio, true);
    assert.equal(i.metodoAsistencia, "qr");
    assert.equal(ms(i.asistioEn), T0 + 10_000, "asistioEn es cuándo ocurrió, no cuándo llegó");
    assert.ok(i.asistenciaSincronizadaEn, "queda cuándo se sincronizó");
  });

  it("enviar lo mismo otra vez no duplica nada: «ya-registrada» y no cambia la constancia", async () => {
    const codigo = await emitir();
    await enviar("est1", codigo, T0 + 10_000, T0 + HORA);
    const antes = await leer("inscripciones/est1_jA");
    const r = await enviar("est1", codigo, T0 + 10_000, T0 + 2 * HORA);
    assert.deepEqual(r.cuerpo, { resultado: "ya-registrada" });
    const despues = await leer("inscripciones/est1_jA");
    assert.equal(ms(despues.asistioEn), ms(antes.asistioEn));
    assert.equal(ms(despues.asistenciaSincronizadaEn), ms(antes.asistenciaSincronizadaEn));
  });

  it("la firma se verifica siempre: un código inventado no vale aunque la hora sea perfecta", async () => {
    const falso = generarCodigo({ jornadaId: "jA", ahoraMs: T0, vigenciaMs: 60_000, secreto: "otro-secreto" }).codigo;
    const r = await enviar("est1", falso, T0 + 5_000, T0 + HORA);
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "CODIGO_INVALIDO");
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("el código de otra jornada no vale", async () => {
    await sembrar("jornadas/jB", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(T0 - 5 * MINUTO) }));
    const deB = await emitir("jB");
    const r = await enviar("est1", deB, T0 + 5_000, T0 + HORA, "jA");
    assert.equal(r.cuerpo.error?.codigo, "CODIGO_INVALIDO");
  });

  it("la hora del escaneo debe caer en la vigencia del código (60 s + 2 min de tolerancia de reloj por lado)", async () => {
    const codigo = await emitir(); // vale de T0 a T0 + 60 s
    const limiteSuperior = T0 + 60_000 + 2 * MINUTO;
    const limiteInferior = T0 - 2 * MINUTO;

    assert.equal((await enviar("est1", codigo, limiteSuperior, T0 + HORA)).estado, 200, "justo en el borde superior");
    await sembrar("inscripciones/est1_jA", inscripcion("est1", "jA"));
    const tarde = await enviar("est1", codigo, limiteSuperior + 1, T0 + HORA);
    assert.equal(tarde.cuerpo.error?.codigo, "CODIGO_CADUCADO", "un milisegundo después: caducó");
    assert.match(tarde.cuerpo.error.mensaje, /caducó/);

    assert.equal((await enviar("est1", codigo, limiteInferior, T0 + HORA)).estado, 200, "justo en el borde inferior");
    await sembrar("inscripciones/est1_jA", inscripcion("est1", "jA"));
    const anticipado = await enviar("est1", codigo, limiteInferior - 1, T0 + HORA);
    assert.equal(anticipado.cuerpo.error?.codigo, "CODIGO_INVALIDO", "antes de que el código existiera");
    assert.match(anticipado.cuerpo.error.mensaje, /fecha y la hora de tu teléfono/);
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("atrasar el reloj del teléfono no sirve para usar un QR viejo: el servidor exige que el escaneo sea posterior a su emisión", async () => {
    const codigo = await emitir();
    reloj.ahora = T0 + 25 * MINUTO; // el estudiante se entera después y finge haber escaneado antes de que existiera
    const r = await enviar("est1", codigo, T0 - 30 * MINUTO, reloj.ahora);
    assert.equal(r.cuerpo.error?.codigo, "CODIGO_INVALIDO");
  });

  it("una hora del escaneo en el futuro no ayuda: manda la del servidor", async () => {
    const codigo = await emitir();
    const r = await enviar("est1", codigo, T0 + 5_000 + 10 * DIA, T0 + 10 * MINUTO + 1_000_000);
    assert.equal(r.cuerpo.error?.codigo, "CODIGO_CADUCADO");
  });

  it("más de 24 h de antigüedad se rechaza: 409 ACCION_DEMASIADO_ANTIGUA y no cambia nada", async () => {
    const codigo = await emitir();
    const r = await enviar("est1", codigo, T0 + 5_000, T0 + 5_000 + DIA + 1);
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "ACCION_DEMASIADO_ANTIGUA");
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
    // justo 24 h todavía se acepta
    assert.equal((await enviar("est1", codigo, T0 + 5_000, T0 + 5_000 + DIA)).estado, 200);
  });

  it("el máximo de antigüedad se puede configurar", async () => {
    const corta = await iniciarApi({ asistenciaAntiguedadMaxMs: HORA });
    try {
      const codigo = await emitir();
      reloj.ahora = T0 + 2 * HORA;
      const r = await corta.llamar("est1", "POST", "/v1/jornadas/jA/asistencia", { codigo, escaneadoEn: T0 + 5_000 });
      assert.equal(r.cuerpo.error?.codigo, "ACCION_DEMASIADO_ANTIGUA");
    } finally {
      await corta.cerrar();
    }
  });

  it("una hora de escaneo que no es un número válido es un error de validación (400)", async () => {
    const codigo = await emitir();
    for (const escaneadoEn of ["ayer", "1700000000000", -5, 0, true, {}, [1]]) {
      const r = await enviar("est1", codigo, escaneadoEn, T0 + 1000);
      assert.equal(r.estado, 400, JSON.stringify(escaneadoEn));
      assert.ok(r.cuerpo.error.campos.escaneadoEn);
    }
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("la ventana de 20 minutos se mide con la hora del escaneo, no con la de la sincronización", async () => {
    // Escaneó a los 5 min de empezar la jornada: dentro. Llega 2 h después (ventana ya cerrada): igual vale
    const codigo = await emitir();
    assert.equal((await enviar("est1", codigo, T0 + 1000, T0 + 2 * HORA)).estado, 200);
  });

  it("fuera de la ventana de 20 minutos (a la hora del escaneo) se rechaza aunque se haya hecho sin conexión", async () => {
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(T0 - 25 * MINUTO) }));
    const codigo = await emitir();
    const r = await enviar("est1", codigo, T0 + 1000, T0 + HORA);
    assert.equal(r.cuerpo.error?.codigo, "ASISTENCIA_FUERA_DE_VENTANA");
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("antes de que empiece la jornada tampoco, aunque llegue después", async () => {
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(T0 + 10 * MINUTO) }));
    const codigo = await emitir();
    const r = await enviar("est1", codigo, T0 + 1000, T0 + HORA);
    assert.equal(r.cuerpo.error?.codigo, "ASISTENCIA_FUERA_DE_VENTANA");
  });

  it("una jornada que el mantenimiento desactivó AL TERMINAR no invalida una asistencia hecha mientras estaba en curso", async () => {
    const codigo = await emitir();
    // terminó hace rato (empezó T0-5 min, dura 60 min) y quedó desactivada
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", activa: false, fecha: Timestamp.fromMillis(T0 - 5 * MINUTO) }));
    const diferida = await enviar("est1", codigo, T0 + 1000, T0 + 3 * HORA);
    assert.equal(diferida.cuerpo.resultado, "registrada");
  });

  it("pero una jornada cancelada antes de terminar sí rechaza (y una escaneada con conexión desactivada, también)", async () => {
    const codigo = await emitir();
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", activa: false, fecha: Timestamp.fromMillis(T0 - 5 * MINUTO) }));
    // diferida pero la jornada aún no terminó (llega 10 min después del QR): cancelada, no terminada
    const cancelada = await enviar("est1", codigo, T0 + 1000, T0 + 10 * MINUTO);
    assert.equal(cancelada.cuerpo.error?.codigo, "JORNADA_NO_DISPONIBLE");
    // con conexión (sin hora de origen) una desactivada nunca vale, haya terminado o no
    const enLinea = await enviar("est1", await emitir(), undefined, T0 + 3 * HORA);
    assert.equal(enLinea.cuerpo.error?.codigo, "CODIGO_CADUCADO", "el código ya no vale a esa hora");
    const enLinea2 = await enviar("est1", await emitir(), undefined, T0);
    assert.equal(enLinea2.cuerpo.error?.codigo, "JORNADA_NO_DISPONIBLE");
  });

  it("sin inscripción no se registra, y nunca se toca la de otro", async () => {
    const codigo = await emitir();
    const r = await enviar("est2", codigo, T0 + 1000, T0 + HORA);
    assert.equal(r.cuerpo.error?.codigo, "NO_INSCRITO");
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("sin la hora de origen se comporta como siempre (hora del servidor, un solo registro)", async () => {
    const codigo = await emitir();
    const r = await enviar("est1", codigo, undefined, T0 + 5_000);
    assert.equal(r.cuerpo.resultado, "registrada");
    const i = await leer("inscripciones/est1_jA");
    assert.equal(i.asistenciaSincronizadaEn, undefined, "no hay dato de sincronización diferida");
    assert.ok(i.asistioEn);
  });
});

describe("asistencia sin conexión · el gestor y el administrador marcan y se sincroniza después", () => {
  let api;
  let T0;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });
  beforeEach(async () => {
    await limpiar();
    await sembrarPerfiles();
    T0 = reloj.ahora;
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(T0 - 20 * MINUTO) }));
    await sembrar("inscripciones/est1_jA", inscripcion("est1", "jA"));
  });
  const marcar = (uid, asistio, marcadaEn, cuando) => {
    reloj.ahora = cuando;
    return api.llamar(uid, "PUT", "/v1/jornadas/jA/inscritos/est1_jA/asistencia", {
      asistio,
      ...(marcadaEn === undefined ? {} : { marcadaEn }),
    });
  };

  it("lo marcado sin conexión se registra horas después con la hora de la marca y la de la sincronización", async () => {
    const r = await marcar("gestorA", true, T0, T0 + 5 * HORA);
    assert.equal(r.estado, 200);
    const i = await leer("inscripciones/est1_jA");
    assert.equal(i.asistio, true);
    assert.equal(i.metodoAsistencia, "manual");
    assert.equal(ms(i.asistioEn), T0);
    assert.equal(ms(i.asistenciaModificadaEn), T0);
    assert.equal(i.asistenciaModificadaPor, "gestorA");
    assert.ok(i.asistenciaSincronizadaEn);
  });

  it("repetir el envío no cambia nada (idempotente) y quitar la asistencia también se puede diferir", async () => {
    await marcar("gestorA", true, T0, T0 + HORA);
    const antes = await leer("inscripciones/est1_jA");
    await marcar("gestorA", true, T0, T0 + 2 * HORA);
    const igual = await leer("inscripciones/est1_jA");
    assert.equal(ms(igual.asistenciaSincronizadaEn), ms(antes.asistenciaSincronizadaEn), "no se pisa");
    await marcar("gestorA", false, T0 + 10 * MINUTO, T0 + 3 * HORA);
    const quitada = await leer("inscripciones/est1_jA");
    assert.equal(quitada.asistio, false);
    assert.equal(quitada.asistioEn, null);
  });

  it("«desde que empieza» se mide con la hora de la marca: una marca anterior al inicio se rechaza aunque llegue después", async () => {
    const r = await marcar("gestorA", true, T0 - 30 * MINUTO, T0 + HORA);
    assert.equal(r.estado, 409);
    assert.equal(r.cuerpo.error.codigo, "ASISTENCIA_NO_INICIADA");
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("una hora de marca en el futuro no ayuda: manda la del servidor (aún no empezó la jornada)", async () => {
    await sembrar("jornadas/jA", docJornada({ creadoPor: "gestorA", fecha: Timestamp.fromMillis(T0 + 30 * MINUTO) }));
    const r = await marcar("gestorA", true, T0 + HORA, T0);
    assert.equal(r.cuerpo.error?.codigo, "ASISTENCIA_NO_INICIADA");
  });

  it("más de 24 h de antigüedad se rechaza, y una hora inválida es un 400", async () => {
    const vieja = await marcar("gestorA", true, T0, T0 + DIA + 1);
    assert.equal(vieja.cuerpo.error?.codigo, "ACCION_DEMASIADO_ANTIGUA");
    for (const marcadaEn of ["hoy", -1, 0, true, {}]) {
      const r = await marcar("gestorA", true, marcadaEn, T0 + HORA);
      assert.equal(r.estado, 400, JSON.stringify(marcadaEn));
      assert.ok(r.cuerpo.error.campos.marcadaEn);
    }
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("los permisos no cambian: un gestor ajeno o un estudiante no pueden, ni diferido", async () => {
    assert.equal((await marcar("gestorB", true, T0, T0 + HORA)).estado, 403);
    assert.equal((await marcar("est1", true, T0, T0 + HORA)).estado, 403);
    assert.equal((await leer("inscripciones/est1_jA")).asistio, false);
  });

  it("el administrador también puede diferido y queda en la auditoría", async () => {
    assert.equal((await marcar("admin1", true, T0, T0 + 2 * HORA)).estado, 200);
    assert.deepEqual(await auditoria(), ["asistencia.marcar"]);
  });
});
