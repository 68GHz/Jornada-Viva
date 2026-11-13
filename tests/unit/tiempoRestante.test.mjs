import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatearTiempoRestante } from "../../src/utils/tiempoRestante.js";

describe("formatearTiempoRestante", () => {
  it("minutos, horas y días en palabras cortas", () => {
    const casos = [
      [1, "1 min"], [45, "45 min"], [59, "59 min"],
      [60, "1 h"], [61, "1 h 1 min"], [135, "2 h 15 min"], [1439, "23 h 59 min"],
      [1440, "1 d"], [1500, "1 d 1 h"], [2880, "2 d"], [36707, "25 d 11 h"], [8754, "6 d 1 h"],
    ];
    for (const [minutos, esperado] of casos) assert.equal(formatearTiempoRestante(minutos), esperado, String(minutos));
  });

  it("menos de un minuto, cero, negativos y valores que no son un número", () => {
    for (const v of [0, 0.4, -5, NaN, undefined, null, "abc", Infinity]) {
      assert.equal(formatearTiempoRestante(v), "menos de 1 min", String(v));
    }
  });

  it("redondea hacia abajo los minutos con decimales y acepta números en texto", () => {
    assert.equal(formatearTiempoRestante(45.9), "45 min");
    assert.equal(formatearTiempoRestante("90"), "1 h 30 min");
  });

  it("nunca muestra el número de minutos crudo cuando es grande", () => {
    assert.doesNotMatch(formatearTiempoRestante(36707), /\d{4,}/);
  });
});
