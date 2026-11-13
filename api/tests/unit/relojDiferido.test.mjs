import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANTIGUEDAD_MAX_ASISTENCIA_MS,
  TOLERANCIA_RELOJ_MS,
  esHoraDeOrigenValida,
  resolverInstante,
} from "../../src/dominio/relojDiferido.js";
import { leerConfig } from "../../src/config.js";

const AHORA = Date.UTC(2026, 10, 10, 15, 0);
const HORA = 3600_000;

describe("resolverInstante (política de reloj de las acciones diferidas)", () => {
  it("sin hora de origen usa la del servidor y no es diferida", () => {
    assert.deepEqual(resolverInstante({ ahora: AHORA }), { ok: true, instante: AHORA, diferida: false });
    assert.deepEqual(resolverInstante({ hechaEn: null, ahora: AHORA }), { ok: true, instante: AHORA, diferida: false });
  });

  it("con hora de origen usa la menor entre esa y la del servidor", () => {
    assert.deepEqual(resolverInstante({ hechaEn: AHORA - 2 * HORA, ahora: AHORA }), { ok: true, instante: AHORA - 2 * HORA, diferida: true });
    assert.deepEqual(resolverInstante({ hechaEn: AHORA + 5 * HORA, ahora: AHORA }), { ok: true, instante: AHORA, diferida: true });
  });

  it("rechaza lo que supera la antigüedad máxima (24 h por defecto), exacto en el borde", () => {
    assert.equal(ANTIGUEDAD_MAX_ASISTENCIA_MS, 24 * HORA);
    assert.equal(resolverInstante({ hechaEn: AHORA - 24 * HORA, ahora: AHORA }).ok, true);
    const r = resolverInstante({ hechaEn: AHORA - 24 * HORA - 1, ahora: AHORA });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, "ACCION_DEMASIADO_ANTIGUA");
    assert.equal(resolverInstante({ hechaEn: AHORA - 2 * HORA, ahora: AHORA, antiguedadMaxMs: HORA }).ok, false);
  });

  it("la tolerancia de reloj es de 2 minutos", () => {
    assert.equal(TOLERANCIA_RELOJ_MS, 2 * 60 * 1000);
  });

  it("valida la forma de la hora de origen", () => {
    for (const bueno of [1, 1700000000000, 0.5]) assert.equal(esHoraDeOrigenValida(bueno), true, String(bueno));
    for (const malo of [0, -1, NaN, Infinity, "123", true, {}, [5], undefined, null]) {
      assert.equal(esHoraDeOrigenValida(malo), false, String(malo));
    }
  });
});

describe("configuración de la antigüedad máxima de la asistencia", () => {
  it("24 horas por defecto y configurable con ASISTENCIA_ANTIGUEDAD_MAX_HORAS", () => {
    assert.equal(leerConfig({}).asistenciaAntiguedadMaxMs, 24 * HORA);
    assert.equal(leerConfig({ ASISTENCIA_ANTIGUEDAD_MAX_HORAS: "6" }).asistenciaAntiguedadMaxMs, 6 * HORA);
    for (const invalido of ["0", "-1", "abc", ""]) {
      assert.equal(leerConfig({ ASISTENCIA_ANTIGUEDAD_MAX_HORAS: invalido }).asistenciaAntiguedadMaxMs, 24 * HORA, invalido);
    }
  });
});
