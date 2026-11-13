import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  ETIQUETA_ROL,
  ROLES,
  esAdministrador,
  esEstudiante,
  esGestor,
  esPropietario,
  normalizarRol,
  puedeAdministrarJornada,
  puedeSerResponsable,
} from "../../src/utils/roles.js";
import { ESPACIOS, esEspacioValido } from "../../src/utils/espacios.js";

describe("roles", () => {
  it("hay tres roles con su nombre visible", () => {
    assert.deepEqual(Object.values(ROLES), ["estudiante", "gestor", "administrador"]);
    assert.equal(ETIQUETA_ROL.estudiante, "Usuario/Alumno");
    assert.equal(ETIQUETA_ROL.gestor, "Gestor de jornadas");
    assert.equal(ETIQUETA_ROL.administrador, "Administrador");
  });

  it("solo 'gestor' y 'administrador' dan permisos; cualquier otro valor es estudiante", () => {
    assert.equal(normalizarRol("gestor"), ROLES.GESTOR);
    assert.equal(normalizarRol("administrador"), ROLES.ADMINISTRADOR);
    for (const valor of [undefined, null, "", "estudiante", "GESTOR", "Administrador", "admin", "root", "gestor ", 1, {}, true]) {
      assert.equal(normalizarRol(valor), ROLES.ESTUDIANTE, String(valor));
    }
  });

  it("el nombre anterior 'maestro' se acepta como gestor (compatibilidad con cuentas existentes)", () => {
    assert.equal(normalizarRol("maestro"), ROLES.GESTOR);
    assert.equal(esGestor("maestro"), true);
    assert.equal(esAdministrador("maestro"), false);
  });

  it("las preguntas por rol son excluyentes", () => {
    for (const rol of [...Object.values(ROLES), undefined, "maestro"]) {
      const verdaderos = [esEstudiante(rol), esGestor(rol), esAdministrador(rol)].filter(Boolean);
      assert.equal(verdaderos.length, 1, String(rol));
    }
  });

  it("una jornada es del gestor que figura en `creadoPor`; sin propietario no es de nadie", () => {
    assert.equal(esPropietario({ creadoPor: "g1" }, "g1"), true);
    assert.equal(esPropietario({ creadoPor: "g1" }, "g2"), false);
    assert.equal(esPropietario({}, "g1"), false);
    assert.equal(esPropietario({}, undefined), false, "undefined no puede 'coincidir' con undefined");
    assert.equal(esPropietario({ creadoPor: undefined }, undefined), false);
    assert.equal(esPropietario(null, "g1"), false);
  });

  it("el gestor administra solo sus jornadas; el administrador, cualquiera; el estudiante, ninguna", () => {
    const propia = { creadoPor: "g1" };
    assert.equal(puedeAdministrarJornada("gestor", "g1", propia), true);
    assert.equal(puedeAdministrarJornada("gestor", "g2", propia), false, "gestor ajeno");
    assert.equal(puedeAdministrarJornada("gestor", "g1", {}), false, "jornada sin propietario");
    assert.equal(puedeAdministrarJornada("estudiante", "g1", propia), false, "estudiante aunque coincida el uid");
    assert.equal(puedeAdministrarJornada(undefined, "g1", propia), false);
    assert.equal(puedeAdministrarJornada("administrador", "a1", propia), true);
    assert.equal(puedeAdministrarJornada("administrador", "a1", {}), true, "el admin gestiona las jornadas sin propietario");
    assert.equal(puedeAdministrarJornada("administrador", "a1", null), false, "sin jornada no hay nada que gestionar");
  });

  it("solo gestores y administradores pueden tener jornadas asignadas", () => {
    assert.equal(puedeSerResponsable("gestor"), true);
    assert.equal(puedeSerResponsable("administrador"), true);
    assert.equal(puedeSerResponsable("estudiante"), false);
    assert.equal(puedeSerResponsable(undefined), false);
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

  it("los roles de firestore.rules coinciden con los de la app", () => {
    const reglas = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
    const listas = [...reglas.matchAll(/in \[('estudiante'[^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    assert.ok(listas.length >= 2);
    for (const lista of listas) assert.deepEqual(lista, Object.values(ROLES));
  });
});
