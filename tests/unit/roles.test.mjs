import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  ROLES,
  esMaestro,
  esPropietario,
  normalizarRol,
  puedeAdministrarJornada,
} from "../../src/utils/roles.js";
import { ESPACIOS, esEspacioValido } from "../../src/utils/espacios.js";

describe("roles", () => {
  it("solo 'maestro' es maestro; cualquier otro valor o la ausencia de rol es estudiante", () => {
    assert.equal(normalizarRol("maestro"), ROLES.MAESTRO);
    for (const valor of [undefined, null, "", "estudiante", "MAESTRO", "admin", "Maestro ", 1, {}]) {
      assert.equal(normalizarRol(valor), ROLES.ESTUDIANTE, String(valor));
    }
    assert.equal(esMaestro("maestro"), true);
    assert.equal(esMaestro(undefined), false);
    assert.equal(esMaestro("admin"), false);
  });

  it("una jornada es de quien la creó; sin propietario no es de nadie", () => {
    assert.equal(esPropietario({ creadoPor: "m1" }, "m1"), true);
    assert.equal(esPropietario({ creadoPor: "m1" }, "m2"), false);
    assert.equal(esPropietario({}, "m1"), false);
    assert.equal(esPropietario({}, undefined), false, "undefined no puede 'coincidir' con undefined");
    assert.equal(esPropietario({ creadoPor: undefined }, undefined), false);
    assert.equal(esPropietario(null, "m1"), false);
    assert.equal(esPropietario({ creadoPor: "m1" }, ""), false);
  });

  it("solo el maestro propietario puede administrar una jornada", () => {
    const jornada = { creadoPor: "m1" };
    assert.equal(puedeAdministrarJornada("maestro", "m1", jornada), true);
    assert.equal(puedeAdministrarJornada("maestro", "m2", jornada), false, "maestro ajeno");
    assert.equal(puedeAdministrarJornada("estudiante", "m1", jornada), false, "estudiante, aunque coincida el uid");
    assert.equal(puedeAdministrarJornada(undefined, "m1", jornada), false);
    assert.equal(puedeAdministrarJornada("maestro", "m1", {}), false, "jornada anterior a los roles");
  });
});

describe("espacios", () => {
  it("son los bloques 1 al 13, auditorio, cancha y coliseo", () => {
    assert.equal(ESPACIOS.length, 16);
    assert.deepEqual(ESPACIOS.slice(0, 13), Array.from({ length: 13 }, (_, i) => `Bloque ${i + 1}`));
    assert.deepEqual(ESPACIOS.slice(13), ["Auditorio", "Cancha", "Coliseo"]);
    assert.equal(new Set(ESPACIOS).size, ESPACIOS.length);
  });

  it("solo acepta espacios de la lista", () => {
    for (const valido of ESPACIOS) assert.equal(esEspacioValido(valido), true);
    for (const invalido of ["Bloque 14", "bloque 1", "Bloque  1", "Cafetería", "", null, undefined]) {
      assert.equal(esEspacioValido(invalido), false, String(invalido));
    }
  });

  it("la lista de firestore.rules es exactamente la misma (cliente y servidor no se desfasan)", () => {
    const reglas = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    const bloque = /d\.lugar in \[([^\]]*)\]/.exec(reglas);
    assert.ok(bloque, "no se encontró la lista de espacios en firestore.rules");
    const enReglas = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(enReglas, ESPACIOS);
  });
});
