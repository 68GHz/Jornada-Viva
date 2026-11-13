import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { conteoPlural, palabraPlural } from "../../src/utils/plural.js";

describe("palabraPlural (cupos y lugares)", () => {
  it("usa el singular solo con exactamente 1", () => {
    assert.equal(palabraPlural(1, "cupo disponible", "cupos disponibles"), "cupo disponible");
    assert.equal(palabraPlural(1, "lugar ocupado", "lugares ocupados"), "lugar ocupado");
    assert.equal(palabraPlural(1, "cupo", "cupos"), "cupo");
  });

  it("usa el plural con 0, 2 o más, y con valores que no son un número", () => {
    for (const n of [0, 2, 40, undefined, null, NaN]) {
      assert.equal(palabraPlural(n, "cupo", "cupos"), "cupos", String(n));
    }
  });

  it("arma las frases de las pantallas de jornada", () => {
    const lugares = (ocupados, total) =>
      `${ocupados} de ${total} ${palabraPlural(total, "lugar ocupado", "lugares ocupados")}`;
    assert.equal(lugares(0, 1), "0 de 1 lugar ocupado");
    assert.equal(lugares(1, 1), "1 de 1 lugar ocupado");
    assert.equal(lugares(3, 5), "3 de 5 lugares ocupados");

    const admin = (inscritos, total) =>
      `${conteoPlural(inscritos, "ocupado", "ocupados")} de ${total} (${conteoPlural(total - inscritos, "disponible", "disponibles")})`;
    assert.equal(admin(0, 1), "0 ocupados de 1 (1 disponible)");
    assert.equal(admin(1, 3), "1 ocupado de 3 (2 disponibles)");
    assert.equal(admin(3, 3), "3 ocupados de 3 (0 disponibles)");
  });
});

describe("conteoPlural", () => {
  it("usa el singular solo cuando la cantidad es exactamente 1", () => {
    assert.equal(conteoPlural(1, "inscripción", "inscripciones"), "1 inscripción");
    assert.equal(conteoPlural(1, "restante", "restantes"), "1 restante");
  });

  it("usa el plural con 0 y con 2 o más", () => {
    assert.equal(conteoPlural(0, "notificación", "notificaciones"), "0 notificaciones");
    assert.equal(conteoPlural(2, "inscripción", "inscripciones"), "2 inscripciones");
    assert.equal(conteoPlural(10, "restante", "restantes"), "10 restantes");
  });

  it("el plural de palabras con tilde no la conserva (acciones, no acciónes)", () => {
    assert.equal(
      conteoPlural(3, "acción pendiente", "acciones pendientes"),
      "3 acciones pendientes"
    );
  });
});

// Guarda contra la errata original: armar el plural pegando "es" a una palabra en -ción
// ("inscripción" + "es" = "inscripciónes"). Revisa todo el código fuente de la app.
describe("textos de la app", () => {
  const archivos = (dir) =>
    readdirSync(dir).flatMap((nombre) => {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) return archivos(ruta);
      return /\.(js|jsx)$/.test(nombre) ? [ruta] : [];
    });

  it("ningún texto arma el plural de una palabra en -ción pegándole 'es'", () => {
    const patron = /ción\s*(\$\{|\{)[^}]*\?\s*["']es["']/;
    const infractores = archivos("src").filter((f) => patron.test(readFileSync(f, "utf8")));
    assert.deepEqual(infractores, []);
  });

  it("no existen las formas incorrectas 'inscripciónes', 'notificaciónes' ni 'acciónes'", () => {
    const patron = /inscripciónes|notificaciónes|acciónes/i;
    const infractores = archivos("src").filter((f) => patron.test(readFileSync(f, "utf8")));
    assert.deepEqual(infractores, []);
  });
});
