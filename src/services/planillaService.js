import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { generarPlanillaCsv, nombreArchivoPlanilla } from "../utils/planilla";
import { usaApi } from "../config/api";
import { llamarApi } from "./apiClient";

const BOM = "\uFEFF";

// Escribe un CSV en la caché y abre el menú de compartir del dispositivo
export async function compartirCsv(nombreArchivo, contenido, titulo = "Compartir archivo") {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Compartir archivos no está disponible en este dispositivo.");
  }
  const archivo = new File(Paths.cache, nombreArchivo);
  archivo.create({ overwrite: true });
  // UTF-8 con BOM para que Excel respete tildes y ñ (la lectura de la respuesta puede quitarlo)
  await archivo.write(contenido.startsWith(BOM) ? contenido : BOM + contenido);
  await Sharing.shareAsync(archivo.uri, {
    mimeType: "text/csv",
    dialogTitle: titulo,
    UTI: "public.comma-separated-values-text",
  });
}

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const UTI_XLSX = "org.openxmlformats.spreadsheetml.sheet";

// ¿La API respondió que no conoce la ruta? (servidor aún sin la versión que genera .xlsx)
const servidorSinXlsx = (e) => e?.codigoApi === "RUTA_NO_ENCONTRADA";

// Escribe un archivo binario (.xlsx) en la caché y abre el menú de compartir del dispositivo
export async function compartirXlsx(nombreArchivo, bytes, titulo = "Compartir archivo") {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Compartir archivos no está disponible en este dispositivo.");
  }
  const archivo = new File(Paths.cache, nombreArchivo);
  archivo.create({ overwrite: true });
  await archivo.write(bytes); // File.write acepta texto o bytes (writeBytes es de FileHandle, no de File)
  await Sharing.shareAsync(archivo.uri, { mimeType: MIME_XLSX, dialogTitle: titulo, UTI: UTI_XLSX });
}

// Descarga un archivo de la API en Excel (.xlsx). Si el servidor todavía no lo ofrece, usa el CSV de siempre.
export async function descargarYCompartir({ rutaXlsx, rutaCsv, nombreXlsx, nombreCsv, titulo }) {
  try {
    const bytes = await llamarApi("GET", rutaXlsx, { binario: true });
    await compartirXlsx(nombreXlsx, bytes, titulo);
  } catch (e) {
    if (!servidorSinXlsx(e)) throw e;
    const csv = await llamarApi("GET", rutaCsv, { texto: true });
    await compartirCsv(nombreCsv, csv, titulo);
  }
}

// Planilla de inscritos. Con la API se descarga en Excel (.xlsx, con formato legible); sin API se genera
// el CSV compatible con Excel en el dispositivo. Abre el menú de compartir para guardarla o abrirla.
export async function compartirPlanilla(jornada, inscritos) {
  if (usaApi("jornadas")) {
    const id = encodeURIComponent(jornada.id);
    const csvNombre = nombreArchivoPlanilla(jornada);
    await descargarYCompartir({
      rutaXlsx: `/v1/jornadas/${id}/planilla.xlsx`,
      rutaCsv: `/v1/jornadas/${id}/planilla.csv`,
      nombreXlsx: csvNombre.replace(/\.csv$/i, ".xlsx"),
      nombreCsv: csvNombre,
      titulo: "Planilla de inscritos",
    });
    return;
  }
  await compartirCsv(nombreArchivoPlanilla(jornada), generarPlanillaCsv(jornada, inscritos), "Planilla de inscritos");
}

// Reporte de jornadas del administrador (solo con la API)
export function compartirReporteJornadas() {
  return descargarYCompartir({
    rutaXlsx: "/v1/admin/reporte-jornadas.xlsx",
    rutaCsv: "/v1/admin/reporte-jornadas.csv",
    nombreXlsx: "reporte-jornadas.xlsx",
    nombreCsv: "reporte-jornadas.csv",
    titulo: "Reporte de jornadas",
  });
}
