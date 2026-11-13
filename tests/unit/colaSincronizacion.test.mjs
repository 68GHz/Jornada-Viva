import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ESTADOS,
  TIPOS,
  efectoEnCupos,
  esAccionDeInscripcion,
  esContraria,
  etiquetaDeTipo,
  planificarEncolado,
} from "../../src/utils/sincronizacion.js";
import {
  aplicarPendientesAInscripciones,
  ajustarCupos,
  jornadasConAsistenciaPendiente,
  mapaPendientes,
} from "../../src/utils/jornadaEstado.js";

// Un tipo de acción que la cola no conoce (p. ej. de una versión futura de la app): no debe
// confundirse con una inscripción ni con una cancelación.
const ASISTENCIA = "TIPO_DESCONOCIDO";

const encolar = (cola, datos, ahora = 1000) => {
  const r = planificarEncolado(cola, datos, ahora, `id${cola.length + 1}`);
  return { cola: r.valor ?? cola, ...r.resultado };
};
const base = (extra) => ({ jornadaId: "j1", tituloJornada: "Jornada", ...extra });

describe("tipos de acción: reglas declaradas una por una", () => {
  it("solo INSCRIBIR y CANCELAR son acciones de inscripción y tocan los cupos", () => {
    assert.equal(efectoEnCupos(TIPOS.INSCRIBIR), 1);
    assert.equal(efectoEnCupos(TIPOS.CANCELAR), -1);
    assert.equal(esAccionDeInscripcion(TIPOS.INSCRIBIR), true);
    assert.equal(esAccionDeInscripcion(TIPOS.CANCELAR), true);
    for (const otro of [ASISTENCIA, TIPOS.REGISTRAR_ASISTENCIA, TIPOS.MARCAR_ASISTENCIA, TIPOS.QUITAR_ASISTENCIA, undefined, null, "toString", "constructor"]) {
      assert.equal(efectoEnCupos(otro), 0, String(otro));
      assert.equal(esAccionDeInscripcion(otro), false, String(otro));
    }
  });

  it("solo inscribir y cancelar son contrarias; nada más se anula con nada", () => {
    assert.equal(esContraria(TIPOS.INSCRIBIR, TIPOS.CANCELAR), true);
    assert.equal(esContraria(TIPOS.CANCELAR, TIPOS.INSCRIBIR), true);
    assert.equal(esContraria(TIPOS.INSCRIBIR, TIPOS.INSCRIBIR), false);
    assert.equal(esContraria(ASISTENCIA, TIPOS.INSCRIBIR), false);
    assert.equal(esContraria(ASISTENCIA, TIPOS.CANCELAR), false);
    assert.equal(esContraria(TIPOS.CANCELAR, ASISTENCIA), false);
    assert.equal(esContraria(undefined, undefined), false);
    assert.equal(esContraria("constructor", "constructor"), false);
  });

  it("cada tipo tiene su etiqueta y uno desconocido una genérica", () => {
    assert.equal(etiquetaDeTipo(TIPOS.INSCRIBIR), "Inscripción");
    assert.equal(etiquetaDeTipo(TIPOS.CANCELAR), "Cancelación de inscripción");
    assert.equal(etiquetaDeTipo(ASISTENCIA), "Acción pendiente");
    assert.equal(etiquetaDeTipo(TIPOS.REGISTRAR_ASISTENCIA), "Registro de asistencia");
    assert.equal(etiquetaDeTipo(TIPOS.MARCAR_ASISTENCIA), "Asistencia marcada");
    assert.equal(etiquetaDeTipo(TIPOS.QUITAR_ASISTENCIA), "Asistencia retirada");
    assert.equal(etiquetaDeTipo(undefined), "Acción pendiente");
  });
});

describe("planificarEncolado (la cola con tres tipos)", () => {
  it("encola una acción nueva con su estado inicial", () => {
    const r = encolar([], base({ tipo: TIPOS.INSCRIBIR }), 5000);
    assert.equal(r.resultado, "encolada");
    assert.deepEqual(
      { ...r.accion },
      {
        id: "id1", jornadaId: "j1", tituloJornada: "Jornada", tipo: TIPOS.INSCRIBIR, creadaEn: 5000,
        estado: ESTADOS.PENDIENTE, intentos: 0, proximoIntento: null, ultimoError: null, codigoError: null,
      }
    );
  });

  it("inscribirse y cancelar sin haber enviado nada se anulan entre sí (y al revés)", () => {
    let q = encolar([], base({ tipo: TIPOS.INSCRIBIR }));
    const r = encolar(q.cola, base({ tipo: TIPOS.CANCELAR }));
    assert.equal(r.resultado, "anulada");
    assert.deepEqual(r.cola, []);

    q = encolar([], base({ tipo: TIPOS.CANCELAR }));
    assert.equal(encolar(q.cola, base({ tipo: TIPOS.INSCRIBIR })).resultado, "anulada");
  });

  it("si la contraria ya se intentó enviar NO se anula (podría haberse aplicado en el servidor)", () => {
    const intentada = { ...encolar([], base({ tipo: TIPOS.INSCRIBIR })).accion, intentos: 1 };
    const r = encolar([intentada], base({ tipo: TIPOS.CANCELAR }));
    assert.equal(r.resultado, "encolada");
    assert.equal(r.cola.length, 2);
  });

  it("si la contraria está sincronizando o rechazada tampoco se anula", () => {
    for (const estado of [ESTADOS.SINCRONIZANDO, ESTADOS.RECHAZADA]) {
      const existente = { ...encolar([], base({ tipo: TIPOS.INSCRIBIR })).accion, estado };
      assert.equal(encolar([existente], base({ tipo: TIPOS.CANCELAR })).resultado, "encolada", estado);
    }
  });

  it("repetir la misma acción en curso es «duplicada» y no cambia la cola", () => {
    const q = encolar([], base({ tipo: TIPOS.INSCRIBIR }));
    const r = encolar(q.cola, base({ tipo: TIPOS.INSCRIBIR }));
    assert.equal(r.resultado, "duplicada");
    assert.equal(r.accion.id, "id1");
    assert.equal(r.cola.length, 1);
  });

  it("una acción de asistencia NO anula una inscripción ni una cancelación pendientes (ni al revés)", () => {
    const inscripcion = encolar([], base({ tipo: TIPOS.INSCRIBIR })).cola;
    const conAsistencia = encolar(inscripcion, base({ tipo: ASISTENCIA, objetivoId: "insc1" }));
    assert.equal(conAsistencia.resultado, "encolada");
    assert.equal(conAsistencia.cola.length, 2, "siguen las dos");
    assert.deepEqual(conAsistencia.cola.map((a) => a.tipo), [TIPOS.INSCRIBIR, ASISTENCIA]);

    const cancelacion = encolar(conAsistencia.cola, base({ tipo: TIPOS.CANCELAR }));
    assert.equal(cancelacion.resultado, "anulada");
    assert.deepEqual(cancelacion.cola.map((a) => a.tipo), [ASISTENCIA], "solo se anuló la inscripción");
  });

  it("la asistencia de distintos inscritos de la misma jornada no se confunde: cada objetivo es una acción", () => {
    let cola = encolar([], base({ tipo: ASISTENCIA, objetivoId: "a" })).cola;
    const otro = encolar(cola, base({ tipo: ASISTENCIA, objetivoId: "b" }));
    assert.equal(otro.resultado, "encolada");
    cola = otro.cola;
    assert.equal(encolar(cola, base({ tipo: ASISTENCIA, objetivoId: "a" })).resultado, "duplicada");
    assert.equal(cola.length, 2);
  });

  it("las acciones de otra jornada no interfieren", () => {
    const q = encolar([], base({ tipo: TIPOS.INSCRIBIR }));
    const r = encolar(q.cola, base({ tipo: TIPOS.CANCELAR, jornadaId: "j2" }));
    assert.equal(r.resultado, "encolada");
    assert.equal(r.cola.length, 2);
  });
});

describe("efecto de la cola en los cupos y en la inscripción que ve el usuario", () => {
  const accion = (tipo, extra = {}) => ({
    id: `${tipo}-${Math.random()}`, jornadaId: "j1", tipo, estado: ESTADOS.PENDIENTE, intentos: 0, ...extra,
  });

  it("inscribir ocupa un cupo y cancelar libera uno", () => {
    assert.equal(mapaPendientes([accion(TIPOS.INSCRIBIR)]).get("j1").delta, 1);
    assert.equal(mapaPendientes([accion(TIPOS.CANCELAR)]).get("j1").delta, -1);
  });

  it("una asistencia pendiente NO descuenta ni suma ningún cupo y no aparece como inscripción pendiente", () => {
    const mapa = mapaPendientes([accion(ASISTENCIA, { objetivoId: "x" })]);
    assert.equal(mapa.size, 0);
    const jornadas = [{ id: "j1", cuposTotales: 5, cuposOcupados: 3 }];
    assert.equal(ajustarCupos(jornadas, mapa)[0].cuposOcupados, 3);
  });

  it("con una inscripción y una asistencia pendientes solo cuenta la inscripción", () => {
    const mapa = mapaPendientes([accion(TIPOS.INSCRIBIR), accion(ASISTENCIA, { objetivoId: "x" })]);
    assert.equal(mapa.get("j1").delta, 1);
    assert.equal(mapa.get("j1").tipo, TIPOS.INSCRIBIR);
    const jornadas = [{ id: "j1", cuposTotales: 5, cuposOcupados: 3 }];
    assert.equal(ajustarCupos(jornadas, mapa)[0].cuposOcupados, 4);
  });

  it("las acciones ya enviadas con error (rechazadas) no cuentan", () => {
    const mapa = mapaPendientes([accion(TIPOS.INSCRIBIR, { estado: ESTADOS.RECHAZADA })]);
    assert.equal(mapa.size, 0);
  });

  it("una cancelación pendiente marca la inscripción; una asistencia pendiente no la toca", () => {
    const inscripciones = [{ id: "i1", jornadaId: "j1" }];
    const conCancelacion = aplicarPendientesAInscripciones(inscripciones, mapaPendientes([accion(TIPOS.CANCELAR)]));
    assert.equal(conCancelacion[0].pendiente, TIPOS.CANCELAR);
    const conAsistencia = aplicarPendientesAInscripciones(inscripciones, mapaPendientes([accion(ASISTENCIA)]));
    assert.deepEqual(conAsistencia, inscripciones);
  });
});

describe("acciones de asistencia en la cola (asistencia sin conexión)", () => {
  const A = (tipo, objetivoId, extra = {}) => ({ tipo, jornadaId: "j1", objetivoId, ...extra });

  it("marcar y quitar la asistencia del MISMO inscrito sin haber enviado nada se anulan entre sí", () => {
    assert.equal(esContraria(TIPOS.MARCAR_ASISTENCIA, TIPOS.QUITAR_ASISTENCIA), true);
    assert.equal(esContraria(TIPOS.QUITAR_ASISTENCIA, TIPOS.MARCAR_ASISTENCIA), true);
    const q = encolar([], A(TIPOS.MARCAR_ASISTENCIA, "i1"));
    const r = encolar(q.cola, A(TIPOS.QUITAR_ASISTENCIA, "i1"));
    assert.equal(r.resultado, "anulada");
    assert.deepEqual(r.cola, []);
  });

  it("marcar a un inscrito y quitar a otro NO se anulan: son objetivos distintos", () => {
    const q = encolar([], A(TIPOS.MARCAR_ASISTENCIA, "i1"));
    const r = encolar(q.cola, A(TIPOS.QUITAR_ASISTENCIA, "i2"));
    assert.equal(r.resultado, "encolada");
    assert.equal(r.cola.length, 2);
  });

  it("marcar dos veces al mismo inscrito es «duplicada»; a inscritos distintos, no", () => {
    const q = encolar([], A(TIPOS.MARCAR_ASISTENCIA, "i1"));
    assert.equal(encolar(q.cola, A(TIPOS.MARCAR_ASISTENCIA, "i1")).resultado, "duplicada");
    assert.equal(encolar(q.cola, A(TIPOS.MARCAR_ASISTENCIA, "i2")).resultado, "encolada");
  });

  it("si la marca ya se intentó enviar, quitarla NO la anula (podría haberse aplicado)", () => {
    const intentada = { ...encolar([], A(TIPOS.MARCAR_ASISTENCIA, "i1")).accion, intentos: 2 };
    const r = encolar([intentada], A(TIPOS.QUITAR_ASISTENCIA, "i1"));
    assert.equal(r.resultado, "encolada");
    assert.deepEqual(r.cola.map((a) => a.tipo), [TIPOS.MARCAR_ASISTENCIA, TIPOS.QUITAR_ASISTENCIA]);
  });

  it("el registro del estudiante no interfiere con su inscripción ni con las marcas del gestor", () => {
    let cola = encolar([], { tipo: TIPOS.INSCRIBIR, jornadaId: "j1" }).cola;
    cola = encolar(cola, { tipo: TIPOS.REGISTRAR_ASISTENCIA, jornadaId: "j1", codigo: "abc" }).cola;
    cola = encolar(cola, A(TIPOS.MARCAR_ASISTENCIA, "i1")).cola;
    assert.equal(cola.length, 3);
    // cancelar la inscripción solo anula la inscripción, no el registro de asistencia
    const r = encolar(cola, { tipo: TIPOS.CANCELAR, jornadaId: "j1" });
    assert.equal(r.resultado, "anulada");
    assert.deepEqual(r.cola.map((a) => a.tipo), [TIPOS.REGISTRAR_ASISTENCIA, TIPOS.MARCAR_ASISTENCIA]);
  });

  it("escanear dos veces el QR sin conexión deja una sola acción pendiente", () => {
    const q = encolar([], { tipo: TIPOS.REGISTRAR_ASISTENCIA, jornadaId: "j1", codigo: "abc" });
    assert.equal(encolar(q.cola, { tipo: TIPOS.REGISTRAR_ASISTENCIA, jornadaId: "j1", codigo: "otro" }).resultado, "duplicada");
  });

  it("la asistencia pendiente no toca cupos ni el estado de inscripción", () => {
    const cola = [
      { id: "a", ...A(TIPOS.REGISTRAR_ASISTENCIA, undefined), estado: ESTADOS.PENDIENTE, intentos: 0 },
      { id: "b", ...A(TIPOS.MARCAR_ASISTENCIA, "i1"), estado: ESTADOS.PENDIENTE, intentos: 0 },
    ];
    assert.equal(mapaPendientes(cola).size, 0);
    assert.deepEqual([...jornadasConAsistenciaPendiente(cola)], ["j1"], "solo el registro del estudiante marca la jornada");
  });

  it("jornadasConAsistenciaPendiente ignora lo ya enviado con error y otras jornadas", () => {
    const cola = [
      { id: "a", tipo: TIPOS.REGISTRAR_ASISTENCIA, jornadaId: "j1", estado: ESTADOS.RECHAZADA },
      { id: "b", tipo: TIPOS.REGISTRAR_ASISTENCIA, jornadaId: "j2", estado: ESTADOS.SINCRONIZANDO },
    ];
    assert.deepEqual([...jornadasConAsistenciaPendiente(cola)], ["j2"]);
  });
});
