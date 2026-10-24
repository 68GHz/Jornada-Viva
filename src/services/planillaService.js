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

// Genera la planilla de inscritos (CSV compatible con Excel) y abre el menú de
// compartir del dispositivo para guardarla o abrirla en Excel / Hojas de cálculo.
export async function compartirPlanilla(jornada, inscritos) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Compartir archivos no está disponible en este dispositivo.");
  }

  // Con la API, la planilla la genera el servidor (mismo formato, solo para quien administra la jornada)
  const csv = usaApi("jornadas")
    ? await llamarApi("GET", `/v1/jornadas/${encodeURIComponent(jornada.id)}/planilla.csv`, { texto: true })
    : generarPlanillaCsv(jornada, inscritos);

  const archivo = new File(Paths.cache, nombreArchivoPlanilla(jornada));
  archivo.create({ overwrite: true });
  await archivo.write(csv.startsWith(BOM) ? csv : BOM + csv);

  await Sharing.shareAsync(archivo.uri, {
    mimeType: "text/csv",
    dialogTitle: "Planilla de inscritos",
    UTI: "public.comma-separated-values-text",
  });
}
