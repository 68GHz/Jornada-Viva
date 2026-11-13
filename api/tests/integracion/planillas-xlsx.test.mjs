import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import ExcelJS from "exceljs";
import { DIA, Timestamp, docJornada, iniciarApi, limpiar, reloj, sembrar, sembrarPerfiles } from "./entorno.mjs";

const TIPO = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Planillas y reportes en Excel (.xlsx): legibles en cualquier programa, con español bien escrito
describe("planillas y reportes en Excel (.xlsx)", () => {
  let api;
  before(async () => { api = await iniciarApi(); });
  after(async () => { await api.cerrar(); });

  const pedir = async (uid, ruta) => {
    const r = await fetch(api.base + ruta, { headers: uid ? { Authorization: `Bearer ${uid}` } : {} });
    return { estado: r.status, tipo: r.headers.get("content-type"), disposicion: r.headers.get("content-disposition"), bytes: Buffer.from(await r.arrayBuffer()) };
  };
  const abrir = async (bytes) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    return wb.worksheets[0];
  };
  const textos = (hoja) => {
    const v = [];
    hoja.eachRow((fila) => fila.eachCell((c) => v.push(String(c.value?.result ?? c.value))));
    return v;
  };

  describe("planilla de inscritos", () => {
    beforeEach(async () => {
      await limpiar();
      await sembrarPerfiles();
      await sembrar("jornadas/jA", docJornada({
        creadoPor: "gestorA", titulo: "Jornada de salud: niñez y adolescencia",
        responsable: "María Núñez, José Peña", lugar: "Coliseo",
      }));
      await sembrar("inscripciones/est1_jA", { userId: "est1", jornadaId: "jA", nombreUsuario: "Ángela Muñoz", emailUsuario: "angela@x.co", asistio: true, inscritoEn: Timestamp.fromMillis(reloj.ahora - DIA) });
      await sembrar("inscripciones/est2_jA", { userId: "est2", jornadaId: "jA", nombreUsuario: "=CMD()", emailUsuario: "beto@x.co", asistio: false, inscritoEn: Timestamp.fromMillis(reloj.ahora) });
    });

    it("es un archivo .xlsx con nombre seguro y el tipo correcto", async () => {
      const r = await pedir("gestorA", "/v1/jornadas/jA/planilla.xlsx");
      assert.equal(r.estado, 200);
      assert.match(r.tipo, /spreadsheetml\.sheet/);
      assert.equal(r.tipo.split(";")[0], TIPO);
      assert.match(r.disposicion, /planilla-jornada-de-salud-ninez-y-adolescencia\.xlsx/);
      assert.deepEqual([...r.bytes.subarray(0, 2)], [0x50, 0x4b], "es un zip (xlsx)");
    });

    it("conserva tildes, ñ y comas tal cual, cada dato en su celda", async () => {
      const hoja = await abrir((await pedir("gestorA", "/v1/jornadas/jA/planilla.xlsx")).bytes);
      const t = textos(hoja);
      assert.ok(t.includes("Jornada de salud: niñez y adolescencia"));
      assert.ok(t.includes("María Núñez, José Peña"), "los responsables con coma siguen en una sola celda");
      assert.ok(t.includes("Ángela Muñoz"));
      assert.ok(t.includes("Fecha de inscripción") && t.includes("Asistió") && t.includes("Sí") && t.includes("No"));
    });

    it("la tabla va ordenada, con fecha real de Excel y los datos en sus columnas", async () => {
      const hoja = await abrir((await pedir("gestorA", "/v1/jornadas/jA/planilla.xlsx")).bytes);
      let filaEncabezado = 0;
      hoja.eachRow((f, n) => { if (f.getCell(1).value === "N°") filaEncabezado = n; });
      assert.ok(filaEncabezado > 0);
      const f1 = hoja.getRow(filaEncabezado + 1);
      assert.equal(f1.getCell(1).value, 1);
      assert.equal(f1.getCell(2).value, "Ángela Muñoz");
      assert.equal(f1.getCell(3).value, "angela@x.co");
      assert.ok(f1.getCell(4).value instanceof Date, "la fecha es una fecha, no un texto");
      assert.equal(f1.getCell(5).value, "Sí");
      assert.equal(hoja.getRow(filaEncabezado + 2).getCell(5).value, "No");
      assert.deepEqual(hoja.views[0].ySplit, filaEncabezado, "el encabezado queda fijo al desplazarse");
    });

    it("un nombre que parece fórmula es solo texto (no se ejecuta)", async () => {
      const hoja = await abrir((await pedir("gestorA", "/v1/jornadas/jA/planilla.xlsx")).bytes);
      let celda;
      hoja.eachRow((f) => f.eachCell((c) => { if (String(c.value).includes("CMD")) celda = c; }));
      assert.equal(celda.type, ExcelJS.ValueType.String);
      assert.equal(celda.formula, undefined);
    });

    it("sin inscritos genera el archivo con el aviso en lugar de una tabla vacía", async () => {
      await sembrar("jornadas/jVacia", docJornada({ creadoPor: "gestorA" }));
      const hoja = await abrir((await pedir("gestorA", "/v1/jornadas/jVacia/planilla.xlsx")).bytes);
      assert.ok(textos(hoja).includes("Aún no hay estudiantes inscritos."));
    });

    it("mismos permisos que la planilla en CSV: ajena 403, inexistente 404, estudiante 403, sin sesión 401", async () => {
      await sembrar("jornadas/jB", docJornada({ creadoPor: "gestorB" }));
      assert.equal((await pedir("gestorA", "/v1/jornadas/jB/planilla.xlsx")).estado, 403);
      assert.equal((await pedir("admin1", "/v1/jornadas/nada/planilla.xlsx")).estado, 404);
      assert.equal((await pedir("est1", "/v1/jornadas/jA/planilla.xlsx")).estado, 403);
      assert.equal((await pedir(null, "/v1/jornadas/jA/planilla.xlsx")).estado, 401);
      assert.equal((await pedir("admin1", "/v1/jornadas/jB/planilla.xlsx")).estado, 200);
    });

    it("el CSV anterior sigue disponible para las versiones de la app que lo piden", async () => {
      const r = await pedir("gestorA", "/v1/jornadas/jA/planilla.csv");
      assert.equal(r.estado, 200);
      assert.match(r.tipo, /text\/csv/);
    });
  });

  describe("reporte de jornadas", () => {
    beforeEach(async () => {
      await limpiar();
      await sembrarPerfiles();
      await sembrar("jornadas/j1", docJornada({ titulo: "Alfabetización digital", lugar: "Bloque 3", cuposTotales: 20, cuposOcupados: 10, creadoPor: "gestorA" }));
      await sembrar("jornadas/j2", docJornada({ titulo: "Taller de ñandú", activa: false, cuposTotales: 0, cuposOcupados: 0, creadoPor: "gestorB", fecha: Timestamp.fromMillis(reloj.ahora + 3 * DIA) }));
    });

    it("solo el administrador lo descarga, y el archivo es .xlsx", async () => {
      assert.equal((await pedir("gestorA", "/v1/admin/reporte-jornadas.xlsx")).estado, 403);
      assert.equal((await pedir("est1", "/v1/admin/reporte-jornadas.xlsx")).estado, 403);
      const r = await pedir("admin1", "/v1/admin/reporte-jornadas.xlsx");
      assert.equal(r.estado, 200);
      assert.equal(r.tipo.split(";")[0], TIPO);
      assert.match(r.disposicion, /reporte-jornadas\.xlsx/);
    });

    it("lleva el resumen, las jornadas con su estado y la ocupación como porcentaje (sin dividir por cero)", async () => {
      const hoja = await abrir((await pedir("admin1", "/v1/admin/reporte-jornadas.xlsx")).bytes);
      const t = textos(hoja);
      assert.ok(t.includes("Alfabetización digital") && t.includes("Taller de ñandú"));
      assert.ok(t.includes("Activa") && t.includes("Cancelada"));
      let filaEncabezado = 0;
      hoja.eachRow((f, n) => { if (f.getCell(1).value === "Jornada") filaEncabezado = n; });
      const filas = [1, 2].map((i) => hoja.getRow(filaEncabezado + i));
      const alfa = filas.find((f) => f.getCell(1).value === "Alfabetización digital");
      const nandu = filas.find((f) => f.getCell(1).value === "Taller de ñandú");
      assert.equal(alfa.getCell(8).value, 0.5);
      assert.equal(alfa.getCell(8).numFmt, "0%");
      assert.equal(nandu.getCell(8).value, 0);
      assert.ok(alfa.getCell(2).value instanceof Date);
    });

    it("descargarlo deja constancia en la auditoría, igual que el CSV", async () => {
      await pedir("admin1", "/v1/admin/reporte-jornadas.xlsx");
      const { coleccion } = await import("./entorno.mjs");
      assert.deepEqual((await coleccion("auditoria")).map((a) => a.accion), ["reporte.exportar"]);
    });
  });
});
