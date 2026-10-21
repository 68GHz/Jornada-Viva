import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COLUMNAS_PLANILLA,
  celdaCsv,
  generarPlanillaCsv,
  nombreArchivoPlanilla,
} from "../../src/utils/planilla.js";

const jornada = {
  titulo: "Jornada de Salud y Bienestar",
  fecha: Date.UTC(2026, 10, 4, 14, 15), // 09:15 hora de negocio
  lugar: "Coliseo",
  responsable: "Coordinación de Bienestar",
};

const inscritos = [
  { nombreUsuario: "Beto Pérez", emailUsuario: "beto@x.co", inscritoEn: Date.UTC(2026, 10, 2, 15, 0), asistio: false },
  { nombreUsuario: "Ana Gómez", emailUsuario: "ana@x.co", inscritoEn: Date.UTC(2026, 10, 1, 13, 30), asistio: true },
];

describe("planilla de inscritos (CSV para Excel)", () => {
  const csv = generarPlanillaCsv(jornada, inscritos);
  const lineas = csv.split("\r\n");

  it("empieza con BOM UTF-8 y la directiva sep=; para que Excel separe en columnas", () => {
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.equal(lineas[0], "﻿sep=;");
  });

  it("usa saltos de línea CRLF y termina con salto de línea", () => {
    assert.ok(csv.endsWith("\r\n"));
    assert.ok(!/(?<!\r)\n/.test(csv), "no debe haber LF sueltos");
  });

  it("incluye los datos de la jornada y el total", () => {
    assert.ok(lineas.includes("Jornada;Jornada de Salud y Bienestar"));
    assert.ok(lineas.includes("Fecha;04/11/2026 09:15"));
    assert.ok(lineas.includes("Lugar;Coliseo"));
    assert.ok(lineas.includes("Responsable;Coordinación de Bienestar"));
    assert.ok(lineas.includes("Total de inscritos;2"));
  });

  it("lista a los inscritos en orden de inscripción con encabezado de columnas", () => {
    const i = lineas.indexOf(COLUMNAS_PLANILLA.join(";"));
    assert.ok(i > 0);
    assert.equal(lineas[i + 1], "1;Ana Gómez;ana@x.co;01/11/2026 08:30;Sí");
    assert.equal(lineas[i + 2], "2;Beto Pérez;beto@x.co;02/11/2026 10:00;No");
  });

  it("sin inscritos genera igualmente una planilla válida", () => {
    const vacia = generarPlanillaCsv(jornada, []);
    assert.ok(vacia.includes("Total de inscritos;0"));
    assert.ok(vacia.includes(COLUMNAS_PLANILLA.join(";")));
  });
});

describe("seguridad de las celdas", () => {
  it("neutraliza las fórmulas (inyección CSV): un nombre no se ejecuta al abrir en Excel", () => {
    for (const peligroso of ["=1+1", "+cmd|' /C calc'!A0", "-2+3", "@SUM(A1)", "\t=1", '=HYPERLINK("http://malo")']) {
      const celda = celdaCsv(peligroso);
      assert.ok(celda.replace(/^"/, "").startsWith("'"), `${peligroso} -> ${celda}`);
    }
    const csv = generarPlanillaCsv(jornada, [
      { nombreUsuario: "=cmd|' /C calc'!A0", emailUsuario: "x@x.co", inscritoEn: 1, asistio: false },
    ]);
    assert.ok(csv.includes("1;'=cmd|' /C calc'!A0;x@x.co"), csv);
  });

  it("escapa separadores, comillas y saltos de línea dentro de una celda", () => {
    assert.equal(celdaCsv("a;b"), '"a;b"');
    assert.equal(celdaCsv('di "hola"'), '"di ""hola"""');
    assert.equal(celdaCsv("línea1\nlínea2"), '"línea1\nlínea2"');
  });

  it("deja tal cual los textos normales, números y vacíos", () => {
    assert.equal(celdaCsv("María Núñez"), "María Núñez");
    assert.equal(celdaCsv(7), "7");
    assert.equal(celdaCsv(null), "");
    assert.equal(celdaCsv(undefined), "");
    assert.equal(celdaCsv("a-b"), "a-b", "el guion solo importa al inicio");
  });
});

describe("nombre del archivo", () => {
  it("es seguro: sin tildes, espacios ni caracteres especiales", () => {
    assert.equal(nombreArchivoPlanilla({ titulo: "Jornada de Salud y Bienestar" }), "planilla-jornada-de-salud-y-bienestar.csv");
    assert.equal(nombreArchivoPlanilla({ titulo: "¡Ñandú/../..\\etc: <x>!" }), "planilla-nandu-etc-x.csv");
    assert.equal(nombreArchivoPlanilla({ titulo: "" }), "planilla-jornada.csv");
    assert.equal(nombreArchivoPlanilla({ titulo: "???" }), "planilla-jornada.csv");
    assert.ok(nombreArchivoPlanilla({ titulo: "x".repeat(200) }).length <= "planilla-.csv".length + 40);
  });
});
