import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MODOS_HISTORIAL,
  construirMisJornadas,
  contarHistorial,
  distintivoHistorial,
  filtrarHistorial,
} from "../../src/utils/jornadaEstado.js";

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
const AHORA = Date.UTC(2026, 10, 10, 15, 0);

const jornada = (id, fecha, extra = {}) => ({ id, titulo: id, fecha, duracionMin: 60, activa: true, ...extra });
const inscripcion = (jornadaId, extra = {}) => ({ id: `i-${jornadaId}`, jornadaId, tituloJornada: jornadaId, asistio: false, ...extra });
const mapa = (...js) => new Map(js.map((j) => [j.id, j]));

describe("construirMisJornadas lleva «asistió» de cada inscripción", () => {
  it("distingue la inscrita, la asistida y la finalizada sin asistir", () => {
    const proxima = jornada("proxima", AHORA + 3 * DIA);
    const asistida = jornada("asistida", AHORA - 2 * DIA, { activa: false });
    const perdida = jornada("perdida", AHORA - 5 * DIA, { activa: false });
    const lista = construirMisJornadas(
      [inscripcion("proxima"), inscripcion("asistida", { asistio: true }), inscripcion("perdida")],
      mapa(proxima, asistida, perdida),
      AHORA
    );
    const por = Object.fromEntries(lista.map((j) => [j.id, j]));
    assert.equal(por.proxima.asistio, false);
    assert.equal(por.proxima.finalizada, false);
    assert.equal(por.asistida.asistio, true);
    assert.equal(por.asistida.finalizada, true);
    assert.equal(por.perdida.asistio, false);
    assert.equal(por.perdida.finalizada, true);
  });

  it("una inscripción sin el dato (guardada por una versión anterior) cuenta como no asistida", () => {
    const j = jornada("vieja", AHORA + DIA);
    const lista = construirMisJornadas([{ id: "i", jornadaId: "vieja", tituloJornada: "vieja" }], mapa(j), AHORA);
    assert.equal(lista[0].asistio, false);
  });

  it("una jornada eliminada conserva si se asistió", () => {
    const lista = construirMisJornadas([inscripcion("borrada", { asistio: true, fechaJornada: AHORA - DIA })], new Map(), AHORA);
    assert.equal(lista[0].noDisponible, true);
    assert.equal(lista[0].asistio, true);
  });
});

describe("distintivoHistorial", () => {
  const casos = [
    [{ pendiente: "INSCRIBIR" }, "pendiente", "Pendiente por sincronizar"],
    [{ pendiente: "CANCELAR", asistio: true }, "pendiente", "Cancelación pendiente"],
    [{ noDisponible: true, asistio: true }, "noDisponible", "No disponible"],
    [{ asistio: true, finalizada: true }, "asistio", "Asistió"],
    [{ asistio: true, enCurso: true }, "asistio", "Asistió"],
    [{ asistio: false, asistenciaPendiente: true, enCurso: true }, "pendiente", "Asistencia pendiente"],
    [{ asistio: true, asistenciaPendiente: true }, "asistio", "Asistió"],
    [{ asistio: false, finalizada: true }, "noAsistio", "No asistió"],
    [{ asistio: false, enCurso: true }, "enCurso", "En curso"],
    [{ asistio: false }, "inscrito", "Inscrito"],
    [{}, "inscrito", "Inscrito"],
  ];
  for (const [item, tipo, texto] of casos) {
    it(`${JSON.stringify(item)} → ${texto}`, () => {
      assert.deepEqual(distintivoHistorial(item), { tipo, texto });
    });
  }
});

describe("filtrar y contar el historial", () => {
  const lista = [
    { id: "a", asistio: true },
    { id: "b", asistio: false },
    { id: "c", asistio: true, pendiente: "CANCELAR" },
    { id: "d" },
  ];

  it("«Inscritas» muestra todas y «Asistidas» solo aquellas a las que asistió", () => {
    assert.deepEqual(filtrarHistorial(lista, MODOS_HISTORIAL.INSCRITAS).map((j) => j.id), ["a", "b", "c", "d"]);
    assert.deepEqual(filtrarHistorial(lista, MODOS_HISTORIAL.ASISTIDAS).map((j) => j.id), ["a", "c"]);
    assert.deepEqual(filtrarHistorial(lista, undefined).length, 4);
    assert.deepEqual(filtrarHistorial([], MODOS_HISTORIAL.ASISTIDAS), []);
  });

  it("los conteos no incluyen las inscripciones con la cancelación pendiente", () => {
    assert.deepEqual(contarHistorial(lista), { inscritas: 3, asistidas: 1 });
    assert.deepEqual(contarHistorial([]), { inscritas: 0, asistidas: 0 });
  });
});
