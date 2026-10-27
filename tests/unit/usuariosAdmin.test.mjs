import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcularEstadisticas,
  cuentaActiva,
  filtrarJornadas,
  filtrarUsuarios,
  puedeModificarCuenta,
  validarUsuario,
} from "../../src/utils/usuariosAdmin.js";
import { generarReporteJornadasCsv } from "../../src/utils/planilla.js";
import { permisosJornada } from "../../src/utils/estadoJornada.js";

const AHORA = Date.UTC(2026, 10, 1, 12, 0);
const DIA = 24 * 3600 * 1000;

const usuarios = [
  { id: "a1", nombre: "Álvaro Admin", email: "alvaro@x.co", rol: "administrador" },
  { id: "g1", nombre: "Gina Gestora", email: "gina@x.co", rol: "gestor" },
  { id: "g2", nombre: "Hugo", email: "hugo@x.co", rol: "gestor", activo: false },
  { id: "e1", nombre: "Ana", email: "ana@x.co", rol: "estudiante" },
  { id: "e2", nombre: "Beto", email: "beto@x.co", rol: "estudiante", activo: false },
  { id: "m1", nombre: "Marta", email: "marta@x.co", rol: "maestro" }, // nombre anterior de gestor
];

const jornadas = [
  { id: "j1", titulo: "Salud", lugar: "Coliseo", fecha: AHORA + 5 * DIA, activa: true, creadoPor: "g1", cuposTotales: 10, cuposOcupados: 4 },
  { id: "j2", titulo: "Reciclaje", lugar: "Cancha", fecha: AHORA + 9 * DIA, activa: false, creadoPor: "g2", cuposTotales: 20, cuposOcupados: 5 },
  { id: "j3", titulo: "Cine foro", lugar: "Auditorio", fecha: AHORA - 3 * DIA, activa: false, creadoPor: "g1", cuposTotales: 30, cuposOcupados: 21 },
  { id: "j4", titulo: "Antigua", lugar: "Coliseo", fecha: AHORA + 2 * DIA, activa: true, cuposTotales: 10, cuposOcupados: 0 },
];

describe("usuarios: búsqueda y filtros", () => {
  const ids = (r) => r.map((u) => u.id);

  it("sin filtros devuelve todos, ordenados por nombre", () => {
    assert.deepEqual(ids(filtrarUsuarios(usuarios)), ["a1", "e1", "e2", "g1", "g2", "m1"]);
  });

  it("busca por nombre o correo sin distinguir mayúsculas ni tildes", () => {
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { texto: "alvaro" })), ["a1"]);
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { texto: "GINA@" })), ["g1"]);
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { texto: "zzz" })), []);
  });

  it("filtra por rol (el rol antiguo 'maestro' cuenta como gestor)", () => {
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { rol: "gestor" })), ["g1", "g2", "m1"]);
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { rol: "administrador" })), ["a1"]);
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { rol: "estudiante" })), ["e1", "e2"]);
  });

  it("filtra por estado de la cuenta y combina criterios", () => {
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { estado: "inactivos" })), ["e2", "g2"]);
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { estado: "activos", rol: "gestor" })), ["g1", "m1"]);
    assert.deepEqual(ids(filtrarUsuarios(usuarios, { estado: "inactivos", rol: "gestor", texto: "hugo" })), ["g2"]);
  });

  it("una cuenta sin el campo `activo` está activa; solo `activo: false` la desactiva", () => {
    assert.equal(cuentaActiva({}), true);
    assert.equal(cuentaActiva({ activo: true }), true);
    assert.equal(cuentaActiva({ activo: false }), false);
    assert.equal(cuentaActiva({ activo: 0 }), true, "solo false literal");
  });
});

describe("usuarios: formulario y reglas de la cuenta propia", () => {
  const valido = { nombre: "  Nuevo  ", correo: " Nuevo@Correo.CO ", clave: "secreta1", rol: "gestor" };

  it("acepta un alta correcta y la normaliza", () => {
    const { errores, datos } = validarUsuario(valido);
    assert.deepEqual(errores, {});
    assert.deepEqual(datos, { nombre: "Nuevo", correo: "nuevo@correo.co", clave: "secreta1", rol: "gestor" });
  });

  it("valida nombre, correo, contraseña y rol", () => {
    assert.ok(validarUsuario({ ...valido, nombre: "  " }).errores.nombre);
    assert.ok(validarUsuario({ ...valido, nombre: "x".repeat(101) }).errores.nombre);
    for (const correo of ["", "sin-arroba", "a@b", "a b@c.co", "@x.co"]) assert.ok(validarUsuario({ ...valido, correo }).errores.correo, correo);
    assert.ok(validarUsuario({ ...valido, clave: "12345" }).errores.clave);
    for (const rol of ["", "root", "maestro", undefined]) assert.ok(validarUsuario({ ...valido, rol }).errores.rol, String(rol));
    assert.equal(validarUsuario({ ...valido, nombre: "" }).datos, null);
  });

  it("en edición no se exige correo ni contraseña", () => {
    const { errores } = validarUsuario({ nombre: "Ana", rol: "estudiante" }, { esEdicion: true });
    assert.deepEqual(errores, {});
  });

  it("un administrador no puede modificar su propia cuenta (rol ni estado), solo las de otros", () => {
    assert.equal(puedeModificarCuenta("a1", { id: "a1" }), false);
    assert.equal(puedeModificarCuenta("a1", { id: "e1" }), true);
    assert.equal(puedeModificarCuenta(undefined, { id: "e1" }), false);
    assert.equal(puedeModificarCuenta("a1", null), false);
  });
});

describe("jornadas: filtros del administrador", () => {
  const dia = (ms) => new Date(ms).toISOString().slice(0, 10);
  const ids = (r) => r.map((j) => j.id);
  const f = (filtros) => ids(filtrarJornadas(jornadas, filtros, AHORA, dia));

  it("sin filtros devuelve todas", () => assert.deepEqual(f({}), ["j1", "j2", "j3", "j4"]));

  it("por estado", () => {
    assert.deepEqual(f({ estado: "activa" }), ["j1", "j4"]);
    assert.deepEqual(f({ estado: "cancelada" }), ["j2"]);
    assert.deepEqual(f({ estado: "finalizada" }), ["j3"]);
  });

  it("por gestor, incluidas las jornadas sin gestor asignado", () => {
    assert.deepEqual(f({ gestor: "g1" }), ["j1", "j3"]);
    assert.deepEqual(f({ gestor: "g2" }), ["j2"]);
    assert.deepEqual(f({ gestor: "sin-gestor" }), ["j4"]);
  });

  it("por rango de fechas (inclusive) y por texto", () => {
    assert.deepEqual(f({ desde: dia(AHORA + 2 * DIA), hasta: dia(AHORA + 5 * DIA) }), ["j1", "j4"]);
    assert.deepEqual(f({ desde: dia(AHORA + 6 * DIA) }), ["j2"]);
    assert.deepEqual(f({ texto: "COLISEO" }), ["j1", "j4"]);
    assert.deepEqual(f({ texto: "cine" }), ["j3"]);
  });

  it("combina criterios", () => {
    assert.deepEqual(f({ estado: "activa", gestor: "g1", texto: "salud" }), ["j1"]);
    assert.deepEqual(f({ estado: "cancelada", gestor: "g1" }), []);
  });
});

describe("panel de control: estadísticas", () => {
  const s = calcularEstadisticas(usuarios, jornadas, AHORA);

  it("cuenta usuarios por rol y cuentas inactivas", () => {
    assert.equal(s.totalUsuarios, 6);
    assert.equal(s.estudiantes, 2);
    assert.equal(s.gestores, 3);
    assert.equal(s.administradores, 1);
    assert.equal(s.cuentasInactivas, 2);
  });

  it("cuenta jornadas por estado, espacio y gestor", () => {
    assert.equal(s.totalJornadas, 4);
    assert.deepEqual(s.porEstado, { activa: 2, en_curso: 0, cancelada: 1, finalizada: 1 });
    assert.deepEqual(s.porEspacio, { Coliseo: 2, Cancha: 1, Auditorio: 1 });
    assert.deepEqual(s.porGestor, { g1: 2, g2: 1, "sin-gestor": 1 });
  });

  it("calcula la ocupación de cupos", () => {
    assert.equal(s.cuposTotales, 70);
    assert.equal(s.cuposOcupados, 30);
    assert.equal(s.ocupacion, 43);
  });

  it("con datos vacíos no falla ni divide entre cero", () => {
    const vacio = calcularEstadisticas([], [], AHORA);
    assert.equal(vacio.totalJornadas, 0);
    assert.equal(vacio.ocupacion, 0);
  });
});

describe("permisos del administrador sobre jornadas (interfaz)", () => {
  const p = (rol, uid, jornada) => permisosJornada({ rol, uid, jornada, ahora: AHORA });

  it("el administrador gestiona cualquier jornada, también las ajenas y las sin propietario, y puede reasignar", () => {
    for (const j of [jornadas[0], jornadas[3]]) {
      const permisos = p("administrador", "a1", j);
      assert.equal(permisos.verAdministracion, true);
      assert.equal(permisos.editar, true);
      assert.equal(permisos.eliminar, true);
      assert.equal(permisos.verInscritos, true);
      assert.equal(permisos.reasignar, true);
    }
    assert.equal(p("administrador", "a1", jornadas[1]).reactivar, true);
    assert.equal(p("administrador", "a1", jornadas[2]).editar, false, "una jornada finalizada no se edita");
  });

  it("el gestor no puede reasignar ni gestionar las de otros", () => {
    assert.equal(p("gestor", "g1", jornadas[0]).editar, true);
    assert.equal(p("gestor", "g1", jornadas[0]).reasignar, false);
    assert.equal(p("gestor", "g1", jornadas[1]).verAdministracion, false);
    assert.equal(p("estudiante", "g1", jornadas[0]).verAdministracion, false);
  });
});

describe("reporte de jornadas (CSV)", () => {
  it("genera un CSV para Excel con un renglón por jornada y neutraliza fórmulas", () => {
    const csv = generarReporteJornadasCsv([
      { titulo: "=1+1", fecha: Date.UTC(2026, 10, 4, 14, 15), lugar: "Coliseo", estado: "Activa", gestor: "Gina", cuposTotales: 10, cuposOcupados: 4 },
      { titulo: "Sin cupos", fecha: null, lugar: "Cancha", estado: "Cancelada", gestor: "Hugo", cuposTotales: 0, cuposOcupados: 0 },
    ]);
    const lineas = csv.split("\r\n");
    assert.equal(lineas[0], "﻿sep=;");
    assert.ok(lineas.includes("Total de jornadas;2"));
    assert.ok(lineas.includes("'=1+1;04/11/2026 09:15;Coliseo;Activa;Gina;10;4;40"));
    assert.ok(lineas.includes("Sin cupos;;Cancha;Cancelada;Hugo;0;0;0"));
  });
});
