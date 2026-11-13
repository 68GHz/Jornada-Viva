import ExcelJS from "exceljs";
import { OFFSET_NEGOCIO_MIN, formatearFechaHoraNegocio } from "./zonaNegocio.js";

// Planillas y reportes en Excel (.xlsx). Reemplazan al CSV como formato principal porque un CSV
// depende de cómo cada programa interpreta el separador, la codificación y los números/fechas
// (en español: `;` vs `,`, tildes y ñ, coma decimal, comas dentro de un nombre o de «Ana, Luis»).
// Un .xlsx guarda cada dato en su celda con su tipo, así que se lee igual en Excel, Hojas de cálculo
// de Google, LibreOffice y los visores de los celulares, y permite dar formato legible:
// anchos de columna, encabezado en color, filas alternas, texto que se ajusta y filtros.
const VERDE = "FF1A6B4A";
const VERDE_PALIDO = "FFE8F5EF";
const GRIS_TEXTO = "FF5A7070";
const ZEBRA = "FFF7F8FA";
const BORDE = "FFD5DCE0";
const ROJO = "FFC0392B";
const AMBAR = "FF9A6700";

const COLOR_ESTADO = { Activa: "FF1D8A52", "En curso": AMBAR, Cancelada: ROJO, Finalizada: GRIS_TEXTO };

const borde = { style: "thin", color: { argb: BORDE } };
const bordes = { top: borde, left: borde, bottom: borde, right: borde };
const relleno = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// Los instantes se guardan como fecha real de Excel, mostrando la hora de la zona de negocio (UTC-5)
const aFechaExcel = (ms) =>
  ms == null || !Number.isFinite(ms) ? null : new Date(ms + OFFSET_NEGOCIO_MIN * 60000);

// Alto aproximado de una celda con texto que se ajusta (ExcelJS no lo calcula)
const altoPara = (texto, caracteresPorLinea) =>
  Math.max(1, Math.ceil(String(texto ?? "").length / caracteresPorLinea)) * 17 + 3;

function libro() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Jornada Viva";
  wb.created = new Date();
  return wb;
}

function titulo(hoja, texto, columnas) {
  hoja.mergeCells(1, 1, 1, columnas);
  const celda = hoja.getCell(1, 1);
  celda.value = texto;
  celda.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  celda.fill = relleno(VERDE);
  celda.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  hoja.getRow(1).height = 32;
}

function encabezado(hoja, fila, textos) {
  const r = hoja.getRow(fila);
  textos.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = relleno(VERDE);
    c.border = bordes;
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  r.height = 26;
}

function preparar(hoja, { ultimaColumna, filaEncabezado, ultimaFila, horizontal = false }) {
  hoja.views = [{ state: "frozen", ySplit: filaEncabezado, showGridLines: false }];
  if (ultimaFila > filaEncabezado) {
    hoja.autoFilter = { from: { row: filaEncabezado, column: 1 }, to: { row: filaEncabezado, column: ultimaColumna } };
  }
  hoja.pageSetup = {
    orientation: horizontal ? "landscape" : "portrait",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  hoja.headerFooter = { oddFooter: "&LJornada Viva&RPágina &P de &N" };
}

// Fila de datos del bloque informativo: etiqueta (columnas A:B) y valor (resto), todo con ajuste de texto
function datoInformativo(hoja, fila, etiqueta, valor, columnas, caracteresPorLinea) {
  hoja.mergeCells(fila, 1, fila, 2);
  hoja.mergeCells(fila, 3, fila, columnas);
  const e = hoja.getCell(fila, 1);
  const v = hoja.getCell(fila, 3);
  e.value = etiqueta;
  e.font = { bold: true, color: { argb: GRIS_TEXTO } };
  e.fill = relleno(VERDE_PALIDO);
  e.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true };
  v.value = valor;
  v.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: true };
  for (let c = 1; c <= columnas; c++) hoja.getCell(fila, c).border = bordes;
  hoja.getRow(fila).height = altoPara(valor, caracteresPorLinea);
}

// jornada: { titulo, fecha (ms), lugar, responsable }; inscritos: [{ nombreUsuario, emailUsuario, inscritoEn (ms), asistio }]
export async function generarPlanillaXlsx(jornada, inscritos, { generadoEn = Date.now() } = {}) {
  const ordenados = [...inscritos].sort(
    (a, b) =>
      (a.inscritoEn ?? 0) - (b.inscritoEn ?? 0) ||
      String(a.nombreUsuario ?? "").localeCompare(String(b.nombreUsuario ?? ""), "es")
  );
  const asistentes = ordenados.filter((i) => i.asistio).length;
  const COLUMNAS = 5;

  const wb = libro();
  const hoja = wb.addWorksheet("Planilla", { properties: { defaultRowHeight: 18 } });
  hoja.columns = [{ width: 7 }, { width: 32 }, { width: 36 }, { width: 22 }, { width: 12 }];

  titulo(hoja, "Planilla de inscritos", COLUMNAS);
  const ancho = 70; // caracteres aproximados por línea del valor (columnas C:E)
  let f = 2;
  datoInformativo(hoja, f++, "Jornada", jornada.titulo, COLUMNAS, ancho);
  datoInformativo(hoja, f++, "Fecha y hora", formatearFechaHoraNegocio(jornada.fecha), COLUMNAS, ancho);
  datoInformativo(hoja, f++, "Lugar", jornada.lugar, COLUMNAS, ancho);
  datoInformativo(hoja, f++, "Responsables", jornada.responsable, COLUMNAS, ancho);
  datoInformativo(hoja, f++, "Total de inscritos", ordenados.length, COLUMNAS, ancho);
  datoInformativo(hoja, f++, "Asistieron", `${asistentes} de ${ordenados.length}`, COLUMNAS, ancho);
  datoInformativo(hoja, f++, "Generada el", formatearFechaHoraNegocio(generadoEn), COLUMNAS, ancho);
  hoja.getRow(f++).height = 10;

  const filaEncabezado = f;
  encabezado(hoja, filaEncabezado, ["N°", "Nombre", "Correo", "Fecha de inscripción", "Asistió"]);

  ordenados.forEach((i, n) => {
    const fila = filaEncabezado + 1 + n;
    const r = hoja.getRow(fila);
    r.getCell(1).value = n + 1;
    r.getCell(2).value = i.nombreUsuario || "Sin nombre";
    r.getCell(3).value = i.emailUsuario || "";
    r.getCell(4).value = aFechaExcel(i.inscritoEn);
    r.getCell(4).numFmt = "dd/mm/yyyy hh:mm";
    r.getCell(5).value = i.asistio ? "Sí" : "No";
    r.getCell(5).font = { bold: true, color: { argb: i.asistio ? "FF1D8A52" : GRIS_TEXTO } };
    for (let c = 1; c <= COLUMNAS; c++) {
      const celda = r.getCell(c);
      celda.border = bordes;
      if (n % 2 === 1) celda.fill = relleno(ZEBRA);
      celda.alignment = {
        vertical: "middle",
        horizontal: c === 1 || c === 4 || c === 5 ? "center" : "left",
        wrapText: true,
      };
    }
    r.height = altoPara(`${i.nombreUsuario}`, 30) > 20 || `${i.emailUsuario}`.length > 34 ? 34 : 20;
  });

  if (ordenados.length === 0) {
    const fila = filaEncabezado + 1;
    hoja.mergeCells(fila, 1, fila, COLUMNAS);
    const c = hoja.getCell(fila, 1);
    c.value = "Aún no hay estudiantes inscritos.";
    c.font = { italic: true, color: { argb: GRIS_TEXTO } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = bordes;
    hoja.getRow(fila).height = 28;
  }

  preparar(hoja, {
    ultimaColumna: COLUMNAS,
    filaEncabezado,
    ultimaFila: filaEncabezado + Math.max(ordenados.length, 1),
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// filas: [{ titulo, fecha (ms), lugar, estado, gestor, cuposTotales, cuposOcupados }]
export async function generarReporteJornadasXlsx(filas, { generadoEn = Date.now() } = {}) {
  const COLUMNAS = 8;
  const cuposTotales = filas.reduce((s, x) => s + (x.cuposTotales || 0), 0);
  const inscritos = filas.reduce((s, x) => s + (x.cuposOcupados || 0), 0);
  const ratio = (ocupados, total) => (total > 0 ? ocupados / total : 0);

  const wb = libro();
  const hoja = wb.addWorksheet("Jornadas", { properties: { defaultRowHeight: 18 } });
  hoja.columns = [
    { width: 38 }, { width: 18 }, { width: 14 }, { width: 13 }, { width: 28 }, { width: 10 }, { width: 11 }, { width: 14 },
  ];

  titulo(hoja, "Reporte de jornadas", COLUMNAS);
  let f = 2;
  const resumen = [
    ["Total de jornadas", filas.length],
    ["Cupos ofrecidos", cuposTotales],
    ["Inscripciones", inscritos],
    ["Ocupación general", ratio(inscritos, cuposTotales)],
    ["Generado el", formatearFechaHoraNegocio(generadoEn)],
  ];
  for (const [etiqueta, valor] of resumen) {
    hoja.mergeCells(f, 1, f, 1);
    const e = hoja.getCell(f, 1);
    const v = hoja.getCell(f, 2);
    e.value = etiqueta;
    e.font = { bold: true, color: { argb: GRIS_TEXTO } };
    e.fill = relleno(VERDE_PALIDO);
    e.alignment = { indent: 1, vertical: "middle" };
    v.value = valor;
    v.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    if (etiqueta === "Ocupación general") v.numFmt = "0%";
    e.border = bordes;
    v.border = bordes;
    f++;
  }
  hoja.getRow(f++).height = 10;

  const filaEncabezado = f;
  encabezado(hoja, filaEncabezado, ["Jornada", "Fecha y hora", "Espacio", "Estado", "Gestor", "Cupos", "Inscritos", "Ocupación"]);

  filas.forEach((x, n) => {
    const r = hoja.getRow(filaEncabezado + 1 + n);
    r.getCell(1).value = x.titulo;
    r.getCell(2).value = aFechaExcel(x.fecha);
    r.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
    r.getCell(3).value = x.lugar;
    r.getCell(4).value = x.estado;
    r.getCell(4).font = { bold: true, color: { argb: COLOR_ESTADO[x.estado] || GRIS_TEXTO } };
    r.getCell(5).value = x.gestor;
    r.getCell(6).value = x.cuposTotales || 0;
    r.getCell(7).value = x.cuposOcupados || 0;
    r.getCell(8).value = ratio(x.cuposOcupados || 0, x.cuposTotales || 0);
    r.getCell(8).numFmt = "0%";
    for (let c = 1; c <= COLUMNAS; c++) {
      const celda = r.getCell(c);
      celda.border = bordes;
      if (n % 2 === 1) celda.fill = relleno(ZEBRA);
      celda.alignment = {
        vertical: "middle",
        horizontal: c === 1 || c === 5 ? "left" : "center",
        wrapText: true,
      };
    }
    r.height = String(x.titulo).length > 40 || String(x.gestor).length > 30 ? 34 : 20;
  });

  if (filas.length === 0) {
    const fila = filaEncabezado + 1;
    hoja.mergeCells(fila, 1, fila, COLUMNAS);
    const c = hoja.getCell(fila, 1);
    c.value = "Aún no hay jornadas registradas.";
    c.font = { italic: true, color: { argb: GRIS_TEXTO } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = bordes;
    hoja.getRow(fila).height = 28;
  }

  preparar(hoja, {
    ultimaColumna: COLUMNAS,
    filaEncabezado,
    ultimaFila: filaEncabezado + Math.max(filas.length, 1),
    horizontal: true,
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Nombre de archivo seguro (mismo criterio que la planilla en CSV) con extensión .xlsx
export const aNombreXlsx = (nombreCsv) => nombreCsv.replace(/\.csv$/i, ".xlsx");
