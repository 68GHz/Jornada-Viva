import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectarCambioJornada, detectarEliminacion } from "../../src/utils/cambiosJornada.js";
import { instantaneaDeJornada, mismaInstantanea } from "../../src/utils/instantaneaJornada.js";

const DIA = 24 * 3600 * 1000;
const AHORA = Date.UTC(2026, 10, 1, 12, 0);
// Timestamp de Firestore simulado
const ts = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0, toMillis: () => ms });

const datos = (extra = {}) => ({
  titulo: "Jornada de salud",
  descripcion: "Descripción",
  entidad: "TdeA",
  responsable: "Bienestar",
  lugar: "Bloque 1",
  fecha: ts(AHORA + 5 * DIA),
  cuposTotales: 10,
  cuposOcupados: 2,
  activa: true,
  ...extra,
});
// Lo que el estudiante ya conocía de la jornada
const vista = (extra = {}) => ({ ...instantaneaDeJornada(datos()), ...extra });
const cambio = (actual, anterior = vista()) => detectarCambioJornada(anterior, actual, AHORA);

describe("estado visto de una jornada (instantánea)", () => {
  it("guarda solo lo que se compara, con la fecha en segundos", () => {
    assert.deepEqual(instantaneaDeJornada(datos()), {
      activa: true,
      fecha: Math.floor((AHORA + 5 * DIA) / 1000),
      titulo: "Jornada de salud",
      lugar: "Bloque 1",
      descripcion: "Descripción",
      responsable: "Bienestar",
      entidad: "TdeA",
    });
  });

  it("completa lo que falte: sin `activa` cuenta como activa y los textos vacíos como ''", () => {
    const i = instantaneaDeJornada({ fecha: null });
    assert.equal(i.activa, true);
    assert.equal(i.titulo, "");
    assert.equal(i.fecha, null);
  });

  it("los cupos no forman parte del estado visto (no deben provocar avisos)", () => {
    assert.equal(mismaInstantanea(instantaneaDeJornada(datos()), instantaneaDeJornada(datos({ cuposOcupados: 9 }))), true);
    assert.equal("cuposOcupados" in instantaneaDeJornada(datos()), false);
  });

  it("detecta cualquier diferencia relevante y trata lo ausente como distinto", () => {
    const base = instantaneaDeJornada(datos());
    for (const extra of [{ activa: false }, { lugar: "Coliseo" }, { titulo: "Otro" }, { fecha: ts(AHORA) }, { entidad: "X" }]) {
      assert.equal(mismaInstantanea(base, instantaneaDeJornada(datos(extra))), false, JSON.stringify(extra));
    }
    assert.equal(mismaInstantanea(undefined, base), false);
    assert.equal(mismaInstantanea(base, undefined), false);
  });
});

describe("avisos al estudiante inscrito", () => {
  it("sin cambios o con solo cambios de cupos no hay aviso", () => {
    assert.equal(cambio(datos()), null);
    assert.equal(cambio(datos({ cuposOcupados: 9, cuposTotales: 50 })), null);
  });

  it("sin estado anterior (o sin datos actuales) no hay con qué comparar", () => {
    assert.equal(detectarCambioJornada(undefined, datos(), AHORA), null);
    assert.equal(detectarCambioJornada(vista(), undefined, AHORA), null);
  });

  it("cancelación: la jornada futura pasa a inactiva", () => {
    const aviso = cambio(datos({ activa: false }));
    assert.equal(aviso.tipo, "cancelacion");
    assert.match(aviso.titulo, /^Jornada cancelada: Jornada de salud$/);
    assert.match(aviso.mensaje, /cancelada por el organizador/);
  });

  it("una jornada que se desactiva por haber vencido NO es una cancelación", () => {
    const vencida = datos({ activa: false, fecha: ts(AHORA - 1000) });
    assert.equal(cambio(vencida, vista({ fecha: Math.floor((AHORA - 1000) / 1000) })), null);
    // en el instante exacto de la fecha ya cuenta como vencida
    assert.equal(cambio(datos({ activa: false, fecha: ts(AHORA) })), null);
    assert.equal(cambio(datos({ activa: false, fecha: ts(AHORA + 1) })).tipo, "cancelacion");
  });

  it("reactivación: la jornada vuelve a estar activa", () => {
    const aviso = cambio(datos({ activa: true }), vista({ activa: false }));
    assert.equal(aviso.tipo, "reactivacion");
    assert.match(aviso.titulo, /reactivada/);
  });

  it("reprogramación: cambia la fecha", () => {
    const aviso = cambio(datos({ fecha: ts(AHORA + 9 * DIA) }));
    assert.equal(aviso.tipo, "reprogramacion");
    assert.match(aviso.mensaje, /fecha y\/o hora/);
  });

  it("actualización: indica qué cambió (lugar, descripción, responsable, título o entidad)", () => {
    const aviso = cambio(datos({ lugar: "Coliseo", responsable: "Otra persona" }));
    assert.equal(aviso.tipo, "actualizacion");
    assert.match(aviso.mensaje, /el lugar, el responsable/);
    for (const [campo, etiqueta] of [["descripcion", "la descripción"], ["titulo", "el título"], ["entidad", "la entidad"]]) {
      assert.match(cambio(datos({ [campo]: "otro valor" })).mensaje, new RegExp(etiqueta), campo);
    }
  });

  it("ignora diferencias de espacios al inicio o al final", () => {
    assert.equal(cambio(datos({ lugar: "  Bloque 1  " })), null);
  });

  it("si cambian varias cosas a la vez, prevalece el aviso más importante", () => {
    assert.equal(cambio(datos({ activa: false, lugar: "Coliseo", fecha: ts(AHORA + 9 * DIA) })).tipo, "cancelacion");
    assert.equal(cambio(datos({ lugar: "Coliseo", fecha: ts(AHORA + 9 * DIA) })).tipo, "reprogramacion");
  });

  it("eliminación: avisa con el título que el estudiante conocía", () => {
    const aviso = detectarEliminacion(vista({ titulo: "Mi jornada" }));
    assert.equal(aviso.tipo, "eliminacion");
    assert.equal(aviso.titulo, "Jornada eliminada: Mi jornada");
    assert.match(aviso.mensaje, /fue eliminada por el organizador/);
    assert.equal(detectarEliminacion(vista({ titulo: "" })).titulo, "Jornada eliminada: Jornada");
  });

  it("no hay aviso de eliminación si nunca se conoció la jornada", () => {
    assert.equal(detectarEliminacion(undefined), null);
    assert.equal(detectarEliminacion(null), null);
  });
});
