import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ESTADOS_JORNADA,
  contarPorEstado,
  estadoJornada,
  ordenarParaMaestro,
  permisosJornada,
} from "../../src/utils/estadoJornada.js";

const AHORA = Date.UTC(2026, 10, 1, 12, 0);
const DIA = 24 * 3600 * 1000;
const MIN = 60 * 1000;
// Sin `duracionMin` una jornada dura 60 minutos (la duración por defecto)
const j = (extra) => ({ id: "x", activa: true, fecha: AHORA + 5 * DIA, creadoPor: "m1", ...extra });

describe("estado de una jornada", () => {
  it("activa, cancelada y finalizada según `activa` y la fecha", () => {
    assert.equal(estadoJornada(j(), AHORA), ESTADOS_JORNADA.ACTIVA);
    assert.equal(estadoJornada(j({ activa: false }), AHORA), ESTADOS_JORNADA.CANCELADA);
    assert.equal(estadoJornada(j({ fecha: AHORA - DIA }), AHORA), ESTADOS_JORNADA.FINALIZADA);
  });

  it("una jornada que ya terminó es finalizada aunque aún figure activa o ya esté desactivada", () => {
    assert.equal(estadoJornada(j({ fecha: AHORA - 61 * MIN, activa: true }), AHORA), ESTADOS_JORNADA.FINALIZADA);
    assert.equal(estadoJornada(j({ fecha: AHORA - 61 * MIN, activa: false }), AHORA), ESTADOS_JORNADA.FINALIZADA);
  });

  it("una jornada activa que ya empezó y no ha terminado está en curso", () => {
    assert.equal(estadoJornada(j({ fecha: AHORA - 1 }), AHORA), ESTADOS_JORNADA.EN_CURSO);
    assert.equal(estadoJornada(j({ fecha: AHORA - 59 * MIN }), AHORA), ESTADOS_JORNADA.EN_CURSO);
  });

  it("una cancelada cuya hora de inicio ya llegó figura finalizada: nunca llegó a realizarse", () => {
    assert.equal(estadoJornada(j({ fecha: AHORA - 1, activa: false }), AHORA), ESTADOS_JORNADA.FINALIZADA);
    assert.equal(estadoJornada(j({ fecha: AHORA + 1, activa: false }), AHORA), ESTADOS_JORNADA.CANCELADA);
  });

  it("en el instante exacto del inicio pasa a en curso y en el exacto del fin, a finalizada", () => {
    assert.equal(estadoJornada(j({ fecha: AHORA + 1 }), AHORA), ESTADOS_JORNADA.ACTIVA);
    assert.equal(estadoJornada(j({ fecha: AHORA }), AHORA), ESTADOS_JORNADA.EN_CURSO);
    assert.equal(estadoJornada(j({ fecha: AHORA - 60 * MIN + 1 }), AHORA), ESTADOS_JORNADA.EN_CURSO);
    assert.equal(estadoJornada(j({ fecha: AHORA - 60 * MIN }), AHORA), ESTADOS_JORNADA.FINALIZADA);
  });

  it("la duración de la jornada decide cuándo termina", () => {
    const empezo = AHORA - 90 * MIN;
    assert.equal(estadoJornada(j({ fecha: empezo, duracionMin: 120 }), AHORA), ESTADOS_JORNADA.EN_CURSO);
    assert.equal(estadoJornada(j({ fecha: empezo, duracionMin: 90 }), AHORA), ESTADOS_JORNADA.FINALIZADA);
    assert.equal(estadoJornada(j({ fecha: empezo, duracionMin: 30 }), AHORA), ESTADOS_JORNADA.FINALIZADA);
    // sin duración (o con una inválida) se usa la de por defecto: 60 minutos
    assert.equal(estadoJornada(j({ fecha: empezo }), AHORA), ESTADOS_JORNADA.FINALIZADA);
    assert.equal(estadoJornada(j({ fecha: empezo, duracionMin: "mucho" }), AHORA), ESTADOS_JORNADA.FINALIZADA);
    assert.equal(estadoJornada(j({ fecha: empezo, duracionMin: 1 }), AHORA), ESTADOS_JORNADA.FINALIZADA);
  });

  it("solo `activa: true` cuenta como activa", () => {
    assert.equal(estadoJornada(j({ activa: undefined }), AHORA), ESTADOS_JORNADA.CANCELADA);
    assert.equal(estadoJornada(j({ activa: "true" }), AHORA), ESTADOS_JORNADA.CANCELADA);
  });
});

describe("permisos sobre una jornada (interfaz)", () => {
  const permisos = (rol, uid, jornada) => permisosJornada({ rol, uid, jornada, ahora: AHORA });
  const todoFalso = (p) => Object.values(p).every((v) => v === false);

  it("el estudiante no tiene ninguna acción de administración, ni siendo 'propietario'", () => {
    assert.ok(todoFalso(permisos("estudiante", "m1", j())));
    assert.ok(todoFalso(permisos(undefined, "m1", j())));
  });

  it("un maestro no tiene permisos sobre jornadas de otro ni anteriores a los roles", () => {
    assert.ok(todoFalso(permisos("maestro", "m2", j())));
    assert.ok(todoFalso(permisos("maestro", "m1", j({ creadoPor: undefined }))));
  });

  it("jornada activa: editar, cancelar, eliminar, ver inscritos y planilla (no reactivar)", () => {
    assert.deepEqual(permisos("maestro", "m1", j()), {
      verAdministracion: true,
      verInscritos: true,
      descargarPlanilla: true,
      editar: true,
      cancelar: true,
      reactivar: false,
      eliminar: true,
      reasignar: false, // solo el administrador reasigna jornadas
      generarQr: true, // se puede preparar antes de que empiece
      marcarAsistencia: false, // la asistencia se marca desde que empieza
    });
  });

  it("jornada en curso: no se edita ni se cancela; sí QR, asistencia manual, inscritos y planilla", () => {
    const p = permisos("maestro", "m1", j({ fecha: AHORA - 10 * MIN }));
    assert.equal(p.editar, false);
    assert.equal(p.cancelar, false);
    assert.equal(p.reactivar, false);
    assert.equal(p.generarQr, true);
    assert.equal(p.marcarAsistencia, true);
    assert.equal(p.verInscritos, true);
    assert.equal(p.descargarPlanilla, true);
    assert.equal(p.eliminar, true);
  });

  it("jornada cancelada: se puede reactivar, editar y eliminar (no cancelar)", () => {
    const p = permisos("maestro", "m1", j({ activa: false }));
    assert.equal(p.reactivar, true);
    assert.equal(p.cancelar, false);
    assert.equal(p.editar, true);
    assert.equal(p.eliminar, true);
    assert.equal(p.generarQr, false, "una cancelada no toma asistencia");
    assert.equal(p.marcarAsistencia, false);
  });

  it("jornada finalizada: solo consultar, descargar la planilla, corregir la asistencia y eliminar", () => {
    const p = permisos("maestro", "m1", j({ fecha: AHORA - DIA, activa: false }));
    assert.equal(p.editar, false);
    assert.equal(p.cancelar, false);
    assert.equal(p.reactivar, false);
    assert.equal(p.verInscritos, true);
    assert.equal(p.descargarPlanilla, true);
    assert.equal(p.eliminar, true);
    assert.equal(p.generarQr, false, "el QR ya no sirve");
    assert.equal(p.marcarAsistencia, true, "la asistencia se puede corregir después, sin límite");
  });
});

describe("orden y conteo para el maestro", () => {
  const lista = [
    j({ id: "fin-vieja", fecha: AHORA - 10 * DIA }),
    j({ id: "act-lejana", fecha: AHORA + 20 * DIA }),
    j({ id: "canc", activa: false, fecha: AHORA + 3 * DIA }),
    j({ id: "fin-reciente", fecha: AHORA - 1 * DIA }),
    j({ id: "act-cercana", fecha: AHORA + 2 * DIA }),
    j({ id: "en-curso", fecha: AHORA - 5 * MIN }),
  ];

  it("en curso primero, luego activas (la más próxima arriba), canceladas y al final finalizadas (la más reciente arriba)", () => {
    assert.deepEqual(
      ordenarParaMaestro(lista, AHORA).map((x) => x.id),
      ["en-curso", "act-cercana", "act-lejana", "canc", "fin-reciente", "fin-vieja"]
    );
  });

  it("no modifica la lista original", () => {
    const copia = lista.map((x) => x.id);
    ordenarParaMaestro(lista, AHORA);
    assert.deepEqual(lista.map((x) => x.id), copia);
  });

  it("cuenta las jornadas por estado", () => {
    assert.deepEqual(contarPorEstado(lista, AHORA), {
      total: 6,
      en_curso: 1,
      activa: 2,
      cancelada: 1,
      finalizada: 2,
    });
    assert.deepEqual(contarPorEstado([], AHORA), { total: 0, en_curso: 0, activa: 0, cancelada: 0, finalizada: 0 });
  });
});
