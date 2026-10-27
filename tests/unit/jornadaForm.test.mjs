import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITES_DURACION } from "../../src/utils/duracion.js";
import {
  DURACION_SUGERIDA,
  LIMITES,
  esMismaJornada,
  nuevaClaveCreacion,
  validarJornada,
} from "../../src/utils/jornadaForm.js";
import { combinarFechaHora, descomponerFecha } from "../../src/utils/zonaNegocio.js";

// 1 de noviembre de 2026, 12:00 hora de negocio (UTC-5)
const AHORA = combinarFechaHora("2026-11-01", "12:00");

const formulario = (extra = {}) => ({
  titulo: "  Jornada de salud  ",
  descripcion: "Descripción",
  entidad: "TdeA",
  responsable: "Bienestar",
  lugar: "Coliseo",
  dia: "2026-11-10",
  hora: "09:30",
  duracionMin: "90",
  cuposTotales: "40",
  ...extra,
});
const errores = (extra, contexto) => validarJornada(formulario(extra), { ahora: AHORA, ...contexto }).errores;

describe("zona horaria de negocio", () => {
  it("convierte fecha y hora locales (UTC-5) a instante y de vuelta", () => {
    assert.equal(combinarFechaHora("2026-11-04", "09:15"), Date.UTC(2026, 10, 4, 14, 15));
    assert.deepEqual(descomponerFecha(Date.UTC(2026, 10, 4, 14, 15)), { dia: "2026-11-04", hora: "09:15" });
    assert.deepEqual(descomponerFecha(combinarFechaHora("2026-12-31", "23:59")), {
      dia: "2026-12-31",
      hora: "23:59",
    });
  });

  it("rechaza fechas y horas inexistentes o mal escritas", () => {
    for (const [dia, hora] of [
      ["2026-02-31", "10:00"],
      ["2026-13-01", "10:00"],
      ["2026-11-10", "24:00"],
      ["2026-11-10", "10:60"],
      ["2026-11-10", "10"],
      ["2026-11-10", ""],
      ["10/11/2026", "10:00"],
      ["", "10:00"],
    ]) {
      assert.equal(combinarFechaHora(dia, hora), null, `${dia} ${hora}`);
    }
    assert.equal(combinarFechaHora("2026-11-10", "9:05"), Date.UTC(2026, 10, 10, 14, 5));
  });
});

describe("validación del formulario de jornada", () => {
  it("acepta un formulario correcto y devuelve los datos limpios", () => {
    const { errores: e, datos } = validarJornada(formulario(), { ahora: AHORA });
    assert.deepEqual(e, {});
    assert.deepEqual(datos, {
      titulo: "Jornada de salud",
      descripcion: "Descripción",
      entidad: "TdeA",
      responsable: "Bienestar",
      lugar: "Coliseo",
      fecha: combinarFechaHora("2026-11-10", "09:30"),
      duracionMin: 90,
      cuposTotales: 40,
    });
  });

  it("la duración es un entero de minutos dentro de los límites", () => {
    for (const duracionMin of ["", " ", "0", "9", "-30", "45.5", "abc", "1e2", "1441", "99999999999999999999"]) {
      assert.ok(errores({ duracionMin }).duracionMin, JSON.stringify(duracionMin));
    }
    assert.equal(errores({ duracionMin: String(LIMITES_DURACION.minimo) }).duracionMin, undefined);
    assert.equal(errores({ duracionMin: String(LIMITES_DURACION.maximo) }).duracionMin, undefined);
    assert.ok(errores({ duracionMin: String(LIMITES_DURACION.minimo - 1) }).duracionMin);
    assert.ok(errores({ duracionMin: String(LIMITES_DURACION.maximo + 1) }).duracionMin);
  });

  it("el formulario propone una duración válida al crear", () => {
    assert.equal(errores({ duracionMin: DURACION_SUGERIDA }).duracionMin, undefined);
  });

  it("exige título, descripción, entidad y responsable (no solo espacios)", () => {
    for (const campo of ["titulo", "descripcion", "entidad", "responsable"]) {
      assert.ok(errores({ [campo]: "" })[campo], campo);
      assert.ok(errores({ [campo]: "    " })[campo], campo);
    }
  });

  it("respeta los límites de longitud", () => {
    assert.ok(errores({ titulo: "x".repeat(LIMITES.titulo + 1) }).titulo);
    assert.equal(errores({ titulo: "x".repeat(LIMITES.titulo) }).titulo, undefined);
    assert.ok(errores({ descripcion: "x".repeat(LIMITES.descripcion + 1) }).descripcion);
  });

  it("solo permite espacios de la lista", () => {
    for (const lugar of ["", "Bloque 14", "Cafetería", "bloque 1"]) assert.ok(errores({ lugar }).lugar, lugar);
    for (const lugar of ["Bloque 1", "Bloque 13", "Auditorio", "Cancha", "Coliseo"]) {
      assert.equal(errores({ lugar }).lugar, undefined, lugar);
    }
  });

  it("valida fecha y hora, y que la fecha sea futura (con la fecha del dispositivo)", () => {
    assert.ok(errores({ dia: "" }).dia);
    assert.ok(errores({ hora: "" }).hora);
    assert.ok(errores({ hora: "25:00" }).hora);
    assert.ok(errores({ dia: "2026-10-31" }).dia, "pasada");
    assert.ok(errores({ dia: "2026-11-01", hora: "12:00" }).dia, "justo ahora no es futura");
    assert.equal(errores({ dia: "2026-11-01", hora: "12:01" }).dia, undefined);
  });

  it("una jornada ya cancelada puede conservar una fecha pasada (exigirFutura: false)", () => {
    assert.equal(errores({ dia: "2026-10-01" }, { exigirFutura: false }).dia, undefined);
  });

  it("los cupos son un entero entre 1 y el máximo, y no bajan de los inscritos", () => {
    for (const cuposTotales of ["", "0", "-5", "1.5", "abc", "1e3", " ", "99999999999999999999"]) {
      assert.ok(errores({ cuposTotales }).cuposTotales, cuposTotales);
    }
    assert.ok(errores({ cuposTotales: String(LIMITES.cuposMaximos + 1) }).cuposTotales);
    assert.equal(errores({ cuposTotales: String(LIMITES.cuposMaximos) }).cuposTotales, undefined);
    assert.ok(errores({ cuposTotales: "5" }, { cuposOcupados: 8 }).cuposTotales);
    assert.equal(errores({ cuposTotales: "8" }, { cuposOcupados: 8 }).cuposTotales, undefined);
  });

  it("si hay errores no devuelve datos", () => {
    assert.equal(validarJornada(formulario({ titulo: "" }), { ahora: AHORA }).datos, null);
  });
});

describe("reintentar «Crear jornada» sin duplicar", () => {
  it("genera claves válidas para la API y distintas en cada intento", () => {
    const claves = new Set(Array.from({ length: 200 }, () => nuevaClaveCreacion()));
    assert.equal(claves.size, 200);
    for (const clave of claves) assert.match(clave, /^[A-Za-z0-9_-]{8,100}$/);
  });

  const datos = () => validarJornada(formulario(), { ahora: AHORA }).datos;
  const guardada = (extra = {}) => ({ id: "j1", ...datos(), creadoPor: "g1", activa: true, cuposOcupados: 0, ...extra });

  it("reconoce como la misma la jornada que ya se guardó con esos datos", () => {
    assert.equal(esMismaJornada(guardada(), datos()), true);
    // lo que no es del formulario (id, cupos ocupados, estado) no cuenta
    assert.equal(esMismaJornada(guardada({ cuposOcupados: 3, activa: false, id: "otra" }), datos()), true);
  });

  it("si el usuario cambió algo entre un intento y otro, no es la misma", () => {
    for (const cambio of [
      { titulo: "Otro título" }, { descripcion: "Otra" }, { entidad: "Otra entidad" }, { responsable: "Otro" },
      { lugar: "Cancha" }, { fecha: datos().fecha + 60000 }, { cuposTotales: 41 },
    ]) {
      assert.equal(esMismaJornada(guardada(cambio), datos()), false, JSON.stringify(cambio));
    }
  });

  it("la duración no cuenta (una jornada guardada por una API anterior no la tiene)", () => {
    assert.equal(esMismaJornada(guardada({ duracionMin: 60 }), datos()), true);
    assert.equal(esMismaJornada({ ...guardada(), duracionMin: undefined }, datos()), true);
  });

  it("sin jornada o sin datos nunca coincide", () => {
    assert.equal(esMismaJornada(null, datos()), false);
    assert.equal(esMismaJornada(guardada(), null), false);
  });
});
