import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { generarPlanillaCsv, nombreArchivoPlanilla } from "../utils/planilla";

// Genera la planilla de inscritos (CSV compatible con Excel) y abre el menú de
// compartir del dispositivo para guardarla o abrirla en Excel / Hojas de cálculo.
export async function compartirPlanilla(jornada, inscritos) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Compartir archivos no está disponible en este dispositivo.");
  }

  const archivo = new File(Paths.cache, nombreArchivoPlanilla(jornada));
  archivo.create({ overwrite: true });
  await archivo.write(generarPlanillaCsv(jornada, inscritos));

  await Sharing.shareAsync(archivo.uri, {
    mimeType: "text/csv",
    dialogTitle: "Planilla de inscritos",
    UTI: "public.comma-separated-values-text",
  });
}
