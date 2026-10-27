import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DURACION_POR_DEFECTO,
  LIMITES_DURACION,
  duracionJornadaMin,
  esDuracionValida,
  finJornadaMs,
  formatearDuracion,
  jornadaTerminada,
} from "../../src/utils/duracion.js";

const INICIO = Date.UTC(2026, 10, 1, 15, 0);
const MIN = 60 * 1000;

describe("duración de una jornada", () => {
  it("acepta enteros dentro de los límites", () => {
    assert.equal(esDuracionValida(LIMITES_DURACION.minimo), true);
    assert.equal(esDuracionValida(LIMITES_DURACION.maximo), true);
    for (const malo of [0, 9, 1441, -5, 30.5, NaN, Infinity, "60", null, undefined]) {
      assert.equal(esDuracionValida(malo), false, String(malo));
    }
  });

  it("sin duración (jornadas anteriores al campo) o con una inválida se usa la de por defecto", () => {
    assert.equal(duracionJornadaMin({}), DURACION_POR_DEFECTO);
    assert.equal(duracionJornadaMin({ duracionMin: "90" }), DURACION_POR_DEFECTO);
    assert.equal(duracionJornadaMin({ duracionMin: 5 }), DURACION_POR_DEFECTO);
    assert.equal(duracionJornadaMin(null), DURACION_POR_DEFECTO);
    assert.equal(duracionJornadaMin({ duracionMin: 90 }), 90);
  });

  it("el fin es el inicio más la duración; sin fecha no hay fin", () => {
    assert.equal(finJornadaMs({ fecha: INICIO, duracionMin: 90 }), INICIO + 90 * MIN);
    assert.equal(finJornadaMs({ fecha: INICIO }), INICIO + DURACION_POR_DEFECTO * MIN);
    assert.equal(finJornadaMs({ fecha: null }), null);
    assert.equal(finJornadaMs({}), null);
  });

  it("termina exactamente al cumplirse la duración", () => {
    const j = { fecha: INICIO, duracionMin: 45 };
    assert.equal(jornadaTerminada(j, INICIO + 45 * MIN - 1), false);
    assert.equal(jornadaTerminada(j, INICIO + 45 * MIN), true);
    assert.equal(jornadaTerminada({ fecha: null }, INICIO), false, "sin fecha no se puede asegurar que terminó");
  });

  it("formatea la duración para mostrarla", () => {
    assert.equal(formatearDuracion(45), "45 min");
    assert.equal(formatearDuracion(60), "1 h");
    assert.equal(formatearDuracion(90), "1 h 30 min");
    assert.equal(formatearDuracion(1440), "24 h");
    assert.equal(formatearDuracion(0), "");
    assert.equal(formatearDuracion(undefined), "");
  });
});

describe("script de migración", () => {
  it("usa la misma duración por defecto y los mismos límites que la app", async () => {
    const { readFileSync } = await import("node:fs");
    const script = readFileSync(new URL("../../scripts/admin.js", import.meta.url), "utf8");
    const valor = (nombre) => Number(new RegExp(String.raw`const ${nombre} = (\d+);`).exec(script)?.[1]);
    assert.equal(valor("DURACION_POR_DEFECTO"), DURACION_POR_DEFECTO);
    assert.equal(valor("DURACION_MINIMA"), LIMITES_DURACION.minimo);
    assert.equal(valor("DURACION_MAXIMA"), LIMITES_DURACION.maximo);
  });
});
