import { formatearFechaHoraNegocio } from "./zonaNegocio.js";

// Planilla de inscritos en CSV compatible con Excel:
//  - separador `;` y una primera línea `sep=;` (Excel la usa para separar en columnas
//    sea cual sea la configuración regional)
//  - UTF-8 con BOM (tildes y ñ correctas) y saltos de línea CRLF
//  - las celdas que empiezan por = + - @ se neutralizan para que un nombre malicioso no
//    se ejecute como fórmula al abrir el archivo
const SEPARADOR = ";";
const BOM = "﻿";
const INICIOS_DE_FORMULA = /^[=+\-@\t\r]/;

export const COLUMNAS_PLANILLA = ["N°", "Nombre", "Correo", "Fecha de inscripción", "Asistió"];

export function celdaCsv(valor) {
  let t = valor == null ? "" : String(valor);
  if (INICIOS_DE_FORMULA.test(t)) t = `'${t}`;
  if (/[;"\r\n]/.test(t)) t = `"${t.replace(/"/g, '""')}"`;
  return t;
}

const fila = (celdas) => celdas.map(celdaCsv).join(SEPARADOR);

// `inscritos`: [{ nombreUsuario, emailUsuario, inscritoEn (ms), asistio }]
export function generarPlanillaCsv(jornada, inscritos) {
  const ordenados = [...inscritos].sort(
    (a, b) =>
      (a.inscritoEn ?? 0) - (b.inscritoEn ?? 0) ||
      String(a.nombreUsuario ?? "").localeCompare(String(b.nombreUsuario ?? ""), "es")
  );

  const lineas = [
    `sep=${SEPARADOR}`,
    fila(["Planilla de inscritos"]),
    fila(["Jornada", jornada.titulo]),
    fila(["Fecha", formatearFechaHoraNegocio(jornada.fecha)]),
    fila(["Lugar", jornada.lugar]),
    fila(["Responsable", jornada.responsable]),
    fila(["Total de inscritos", ordenados.length]),
    "",
    fila(COLUMNAS_PLANILLA),
    ...ordenados.map((i, n) =>
      fila([
        n + 1,
        i.nombreUsuario,
        i.emailUsuario,
        formatearFechaHoraNegocio(i.inscritoEn),
        i.asistio ? "Sí" : "No",
      ])
    ),
  ];
  return BOM + lineas.join("\r\n") + "\r\n";
}

// Nombre de archivo seguro: sin tildes ni caracteres especiales
export function nombreArchivoPlanilla(jornada) {
  const base = String(jornada.titulo || "jornada")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `planilla-${base || "jornada"}.csv`;
}
