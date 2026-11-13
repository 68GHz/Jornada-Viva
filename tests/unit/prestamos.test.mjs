import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIAS_ALERTA_PRESTAMO,
  contarPrestamos,
  estadoPrestamo,
  normalizarCodigoObjeto,
  ordenarPrestamos,
  validarPrestamo,
} from "../../src/utils/prestamos.js";

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.UTC(2026, 10, 10, 15, 0);
const p = (extra) => ({ id: "x", activo: true, devueltoEn: null, vence: AHORA + 10 * DIA, ...extra });

describe("estadoPrestamo", () => {
  it("vigente, por vencer, vencido y devuelto", () => {
    assert.equal(estadoPrestamo(p(), AHORA), "vigente");
    assert.equal(estadoPrestamo(p({ vence: AHORA + 5 * DIA }), AHORA), "vigente");
    assert.equal(estadoPrestamo(p({ vence: AHORA + 1 * DIA }), AHORA), "por_vencer");
    assert.equal(estadoPrestamo(p({ vence: AHORA - 1 }), AHORA), "vencido");
    assert.equal(estadoPrestamo(p({ activo: false, devueltoEn: AHORA - DIA }), AHORA), "devuelto");
  });

  it("los bordes: exactamente 2 días antes ya es «por vencer»; justo en la hora de vencimiento todavía no venció", () => {
    assert.equal(DIAS_ALERTA_PRESTAMO, 2);
    assert.equal(estadoPrestamo(p({ vence: AHORA + 2 * DIA }), AHORA), "por_vencer");
    assert.equal(estadoPrestamo(p({ vence: AHORA + 2 * DIA + 1 }), AHORA), "vigente");
    assert.equal(estadoPrestamo(p({ vence: AHORA }), AHORA), "por_vencer");
    assert.equal(estadoPrestamo(p({ vence: AHORA - 1 }), AHORA), "vencido");
  });

  it("lo devuelto nunca está vencido, aunque la fecha haya pasado", () => {
    assert.equal(estadoPrestamo(p({ vence: AHORA - 30 * DIA, activo: false, devueltoEn: AHORA - 20 * DIA }), AHORA), "devuelto");
    assert.equal(estadoPrestamo(p({ vence: AHORA - 30 * DIA, devueltoEn: AHORA - 20 * DIA }), AHORA), "devuelto");
  });

  it("datos incompletos no rompen: sin fecha es vigente y sin préstamo, devuelto", () => {
    assert.equal(estadoPrestamo(p({ vence: null }), AHORA), "vigente");
    assert.equal(estadoPrestamo(undefined, AHORA), "devuelto");
  });
});

describe("contarPrestamos y ordenarPrestamos", () => {
  const lista = [
    p({ id: "a", vence: AHORA + 10 * DIA }),
    p({ id: "b", vence: AHORA - 3 * DIA }),
    p({ id: "c", vence: AHORA + 1 * DIA }),
    p({ id: "d", vence: AHORA - 1 * DIA }),
    p({ id: "e", activo: false, devueltoEn: AHORA - DIA, vence: AHORA - 5 * DIA }),
    p({ id: "f", activo: false, devueltoEn: AHORA - 2 * DIA, vence: AHORA - 2 * DIA }),
  ];

  it("cuenta solo los activos y separa vencidos y por vencer", () => {
    assert.deepEqual(contarPrestamos(lista, AHORA), { activos: 4, vencidos: 2, porVencer: 1 });
    assert.deepEqual(contarPrestamos([], AHORA), { activos: 0, vencidos: 0, porVencer: 0 });
    assert.deepEqual(contarPrestamos(undefined, AHORA), { activos: 0, vencidos: 0, porVencer: 0 });
  });

  it("ordena lo urgente primero: vencidos (el más atrasado antes), por vencer, vigentes y al final lo devuelto", () => {
    assert.deepEqual(ordenarPrestamos(lista, AHORA).map((x) => x.id), ["b", "d", "c", "a", "f", "e"]);
  });

  it("no modifica la lista original", () => {
    const copia = lista.map((x) => x.id);
    ordenarPrestamos(lista, AHORA);
    assert.deepEqual(lista.map((x) => x.id), copia);
  });
});

describe("normalizarCodigoObjeto y validarPrestamo", () => {
  const valido = (extra) => ({ codigo: "lib-001", nombre: " Cálculo ", tipo: "libro", correo: " Ana@X.co ", vence: AHORA + 7 * DIA, ...extra });

  it("el código se compara sin importar mayúsculas ni espacios sobrantes", () => {
    assert.equal(normalizarCodigoObjeto("  lib   001 "), "LIB 001");
    assert.equal(normalizarCodigoObjeto(undefined), "");
  });

  it("acepta un préstamo correcto y devuelve los datos limpios", () => {
    const { errores, datos } = validarPrestamo(valido(), { ahora: AHORA });
    assert.deepEqual(errores, {});
    assert.deepEqual(datos, { codigo: "LIB-001", nombre: "Cálculo", tipo: "libro", correo: "ana@x.co", vence: AHORA + 7 * DIA });
  });

  it("incluye la nota solo si se escribió", () => {
    assert.equal("nota" in validarPrestamo(valido(), { ahora: AHORA }).datos, false);
    assert.equal(validarPrestamo(valido({ nota: "  con carátula  " }), { ahora: AHORA }).datos.nota, "con carátula");
  });

  it("rechaza lo inválido, campo por campo, y no devuelve datos", () => {
    const malos = [
      [{ codigo: "" }, "codigo"], [{ nombre: "" }, "nombre"], [{ tipo: "silla" }, "tipo"], [{ correo: "x" }, "correo"],
      [{ vence: AHORA }, "vence"], [{ vence: AHORA + 91 * DIA }, "vence"], [{ vence: NaN }, "vence"], [{ nota: "x".repeat(301) }, "nota"],
    ];
    for (const [extra, campo] of malos) {
      const r = validarPrestamo(valido(extra), { ahora: AHORA });
      assert.ok(r.errores[campo], campo);
      assert.equal(r.datos, null);
    }
    assert.equal(validarPrestamo(undefined, { ahora: AHORA }).datos, null);
  });
});
