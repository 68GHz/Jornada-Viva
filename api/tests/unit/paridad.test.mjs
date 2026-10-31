// Equivalencia entre la lógica de negocio de la API y la que todavía tiene la app móvil.
// Mientras la migración no termine (M7), ambas deben comportarse igual: si alguien cambia una
// regla en un lado y no en el otro, estas pruebas fallan. En M7 se retira la copia del móvil.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validarJornada } from "../../../src/utils/jornadaForm.js";
import { validarDatosJornada } from "../../src/dominio/jornada.js";
import { combinarFechaHora } from "../../src/dominio/zonaNegocio.js";
import { ESPACIOS } from "../../src/dominio/espacios.js";
import { fechaAMillis as fechaApi } from "../../src/dominio/jornadaFecha.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..", "..");
const leer = (...partes) => readFileSync(join(raiz, ...partes), "utf8");

describe("la API usa las mismas reglas puras que la app", () => {
  // Módulos copiados sin cambios: deben ser idénticos al de la app
  for (const modulo of ["roles", "espacios", "zonaNegocio", "cambiosJornada", "instantaneaJornada", "planilla", "usuariosAdmin", "estadoJornada", "duracion", "asistencia", "bannerJornada", "plazoCancelacion"]) {
    it(`${modulo}.js es idéntico en la app y en la API`, () => {
      assert.equal(
        leer("api", "src", "dominio", `${modulo}.js`).replace(/\r\n/g, "\n"),
        leer("src", "utils", `${modulo}.js`).replace(/\r\n/g, "\n")
      );
    });
  }

  it("la lista de espacios de la API es la que valida firestore.rules", () => {
    const reglas = leer("firestore.rules");
    const bloque = /d\.lugar in \[([\s\S]*?)\]/.exec(reglas)[1];
    const enReglas = [...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(enReglas, ESPACIOS);
  });

  describe("validarDatosJornada (API) = validarJornada (formulario de la app)", () => {
    const ahora = Date.UTC(2026, 5, 1, 12, 0);
    const base = {
      titulo: "Jornada", descripcion: "Descripción", entidad: "TdeA", responsable: "Ana",
      lugar: "Coliseo", dia: "2026-06-10", hora: "14:30", duracionMin: "60", cuposTotales: "20",
    };
    const casos = [
      {}, { titulo: "" }, { titulo: "x".repeat(121) }, { descripcion: "" }, { descripcion: "x".repeat(2001) },
      { entidad: "  " }, { responsable: "" }, { lugar: "Piscina" }, { lugar: "" },
      { duracionMin: "" }, { duracionMin: "9" }, { duracionMin: "10" }, { duracionMin: "1440" }, { duracionMin: "1441" },
      { duracionMin: "abc" }, { duracionMin: "45.5" }, { duracionMin: "-30" },
      { cuposTotales: "0" }, { cuposTotales: "1001" }, { cuposTotales: "2.5" }, { cuposTotales: "abc" }, { cuposTotales: "" },
      { dia: "2026-05-01" }, { dia: "2026-06-01", hora: "12:00" }, { dia: "2026-06-01", hora: "12:01" },
      { titulo: "  Con espacios  ", responsable: " Ana " },
      { bannerUrl: "https://tdea.edu.co/banner.jpg" }, { bannerUrl: "" }, { bannerUrl: "   " },
      { bannerUrl: "  https://tdea.edu.co/banner.jpg  " }, { bannerUrl: "http://tdea.edu.co/banner.jpg" },
      { bannerUrl: "javascript:alert(1)" }, { bannerUrl: "https://tdea.edu.co/mi banner.jpg" },
      { bannerUrl: "https://usuario:clave@tdea.edu.co/a.jpg" }, { bannerUrl: `https://tdea.edu.co/${"a".repeat(500)}` },
    ];
    for (const cambio of casos) {
      it(`mismos errores con ${JSON.stringify(cambio).slice(0, 70)}`, () => {
        const campos = { ...base, ...cambio };
        for (const opciones of [{ cuposOcupados: 0 }, { cuposOcupados: 25 }, { exigirFutura: false }]) {
          const app = validarJornada(campos, { ahora, ...opciones });
          const fecha = combinarFechaHora(campos.dia, campos.hora);
          const api = validarDatosJornada(
            {
              ...campos,
              fecha,
              duracionMin: /^\d+$/.test(campos.duracionMin) ? Number(campos.duracionMin) : NaN,
              cuposTotales: /^\d+$/.test(campos.cuposTotales) ? Number(campos.cuposTotales) : NaN,
            },
            { ahora, ...opciones }
          );
          // La app informa la fecha en `dia`/`hora`; la API, en `fecha`
          const { dia, hora, ...erroresApp } = app.errores;
          const { fecha: errorFecha, ...erroresApi } = api.errores;
          assert.deepEqual(erroresApi, erroresApp, JSON.stringify(opciones));
          assert.equal(!!errorFecha, !!(dia || hora), "error de fecha " + JSON.stringify(opciones));
          assert.deepEqual(api.datos, app.datos, JSON.stringify(opciones));
        }
      });
    }
  });

  it("fechaAMillis (API) interpreta los formatos de fecha como la app", async () => {
    const ts = { toMillis: () => 1234 };
    assert.equal(fechaApi(ts), 1234);
    assert.equal(fechaApi(new Date(5000)), 5000);
    assert.equal(fechaApi(99), 99);
    assert.equal(fechaApi(null), null);
    assert.equal(fechaApi(Number.NaN), null);
    assert.equal(fechaApi("no es fecha"), null);
    // formato anterior: 2026-06-10 + 09:30 hora de negocio (UTC-5)
    assert.equal(fechaApi("2026-06-10", "09:30"), Date.UTC(2026, 5, 10, 14, 30));
    assert.equal(fechaApi("2026-06-10"), Date.UTC(2026, 5, 11, 4, 59), "sin hora = 23:59 de negocio");
  });
});
