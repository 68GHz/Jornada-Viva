import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ESPACIOS } from "../../src/utils/espacios.js";
import {
  espaciosLibres,
  espaciosOcupados,
  listaCorta,
  seSolapan,
  sugerirEspaciosAlternos,
} from "../../src/utils/espaciosLibres.js";

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
// 10 de noviembre de 2026, 08:00 UTC (referencia fija: las pruebas no dependen del reloj)
const AHORA = Date.UTC(2026, 10, 10, 8, 0);
const MANANA_10 = AHORA + DIA + 2 * HORA; // mañana a las 10:00 (UTC)

let n = 0;
const jornada = (lugar, fecha, extra = {}) => ({
  id: `j${++n}`,
  lugar,
  fecha,
  duracionMin: 60,
  activa: true,
  ...extra,
});
const libres = (jornadas, inicio, fin, opciones = {}) =>
  espaciosLibres(jornadas, inicio, fin, { ahora: AHORA, ...opciones });

describe("seSolapan", () => {
  it("detecta solapes parciales, totales y de una franja dentro de otra", () => {
    assert.equal(seSolapan(10, 20, 15, 25), true, "parcial: la otra empieza dentro");
    assert.equal(seSolapan(10, 20, 5, 15), true, "parcial: la otra termina dentro");
    assert.equal(seSolapan(10, 20, 10, 20), true, "total");
    assert.equal(seSolapan(10, 20, 12, 18), true, "una dentro de otra");
    assert.equal(seSolapan(12, 18, 10, 20), true, "una contiene a la otra");
  });

  it("el borde exacto no es solape y las franjas separadas tampoco", () => {
    assert.equal(seSolapan(10, 20, 20, 30), false, "la otra empieza justo cuando termina");
    assert.equal(seSolapan(10, 20, 0, 10), false, "la otra termina justo cuando empieza");
    assert.equal(seSolapan(10, 20, 30, 40), false);
  });
});

describe("espaciosLibres (FE-01)", () => {
  it("sin jornadas todos los espacios están libres, en el orden de la lista oficial", () => {
    assert.deepEqual(libres([], MANANA_10, MANANA_10 + HORA), ESPACIOS);
    assert.deepEqual(libres(undefined, MANANA_10, MANANA_10 + HORA), ESPACIOS);
  });

  it("un espacio con una jornada a la misma hora deja de estar libre; los demás siguen igual", () => {
    const lista = [jornada("Coliseo", MANANA_10)];
    const resultado = libres(lista, MANANA_10, MANANA_10 + HORA);
    assert.equal(resultado.includes("Coliseo"), false);
    assert.deepEqual(resultado, ESPACIOS.filter((e) => e !== "Coliseo"));
  });

  it("solape parcial al inicio y al final de la franja", () => {
    const empiezaAntes = jornada("Bloque 1", MANANA_10 - 30 * MIN); // 09:30–10:30
    const terminaDespues = jornada("Bloque 2", MANANA_10 + 30 * MIN); // 10:30–11:30
    const resultado = libres([empiezaAntes, terminaDespues], MANANA_10, MANANA_10 + HORA); // 10:00–11:00
    assert.equal(resultado.includes("Bloque 1"), false);
    assert.equal(resultado.includes("Bloque 2"), false);
  });

  it("solape total: la jornada contiene a la franja y la franja contiene a la jornada", () => {
    const larga = jornada("Auditorio", MANANA_10 - HORA, { duracionMin: 240 });
    const corta = jornada("Cancha", MANANA_10 + 15 * MIN, { duracionMin: 10 });
    const resultado = libres([larga, corta], MANANA_10, MANANA_10 + HORA);
    assert.equal(resultado.includes("Auditorio"), false);
    assert.equal(resultado.includes("Cancha"), false);
  });

  it("borde exacto: una jornada que termina cuando empieza la franja (o empieza cuando termina) no la ocupa", () => {
    const termina = jornada("Bloque 3", MANANA_10 - HORA); // 09:00–10:00
    const empieza = jornada("Bloque 4", MANANA_10 + HORA); // 11:00–12:00
    const resultado = libres([termina, empieza], MANANA_10, MANANA_10 + HORA); // 10:00–11:00
    assert.equal(resultado.includes("Bloque 3"), true);
    assert.equal(resultado.includes("Bloque 4"), true);
  });

  it("las jornadas canceladas no ocupan el espacio", () => {
    const cancelada = jornada("Bloque 5", MANANA_10, { activa: false });
    assert.equal(libres([cancelada], MANANA_10, MANANA_10 + HORA).includes("Bloque 5"), true);
  });

  it("las jornadas finalizadas no ocupan el espacio (ni las que siguen marcadas activas pero ya terminaron)", () => {
    const ayer = AHORA - DIA;
    const desactivada = jornada("Bloque 6", ayer, { activa: false });
    const sinDesactivarAun = jornada("Bloque 7", ayer, { activa: true });
    // la franja consultada solapa con ambas, pero ya terminaron
    const resultado = libres([desactivada, sinDesactivarAun], ayer, ayer + HORA);
    assert.equal(resultado.includes("Bloque 6"), true);
    assert.equal(resultado.includes("Bloque 7"), true);
  });

  it("una jornada en curso sí ocupa su espacio hasta que termina", () => {
    const enCurso = jornada("Bloque 8", AHORA - 10 * MIN, { duracionMin: 60 });
    assert.equal(libres([enCurso], AHORA, AHORA + 30 * MIN).includes("Bloque 8"), false);
    assert.equal(libres([enCurso], AHORA + 50 * MIN, AHORA + 2 * HORA).includes("Bloque 8"), true);
  });

  it("sin duración guardada se usa la de por defecto (60 min)", () => {
    const vieja = { id: "vieja", lugar: "Bloque 9", fecha: MANANA_10, activa: true };
    assert.equal(libres([vieja], MANANA_10 + 50 * MIN, MANANA_10 + 2 * HORA).includes("Bloque 9"), false);
    assert.equal(libres([vieja], MANANA_10 + HORA, MANANA_10 + 2 * HORA).includes("Bloque 9"), true);
  });

  it("excluirId deja fuera la jornada que se está viendo o editando", () => {
    const propia = jornada("Bloque 10", MANANA_10);
    assert.equal(libres([propia], MANANA_10, MANANA_10 + HORA).includes("Bloque 10"), false);
    assert.equal(
      libres([propia], MANANA_10, MANANA_10 + HORA, { excluirId: propia.id }).includes("Bloque 10"),
      true
    );
  });

  it("si todos los espacios están ocupados no queda ninguno libre", () => {
    const todas = ESPACIOS.map((espacio) => jornada(espacio, MANANA_10));
    assert.deepEqual(libres(todas, MANANA_10, MANANA_10 + HORA), []);
  });

  it("una franja que no se puede calcular no marca ningún espacio como ocupado", () => {
    const lista = [jornada("Coliseo", MANANA_10)];
    for (const [inicio, fin] of [[null, null], [NaN, MANANA_10], [MANANA_10, MANANA_10], [MANANA_10, MANANA_10 - HORA]]) {
      assert.deepEqual(libres(lista, inicio, fin), ESPACIOS, `${inicio} → ${fin}`);
    }
  });

  it("ignora jornadas sin fecha o sin lugar", () => {
    const rotas = [{ id: "a", lugar: "Coliseo", activa: true }, { id: "b", fecha: MANANA_10, activa: true }, null];
    assert.deepEqual(libres(rotas, MANANA_10, MANANA_10 + HORA), ESPACIOS);
  });
});

describe("espaciosOcupados", () => {
  it("indica qué jornadas ocupan cada espacio", () => {
    const a = jornada("Coliseo", MANANA_10);
    const b = jornada("Coliseo", MANANA_10 + 30 * MIN);
    const c = jornada("Cancha", MANANA_10);
    const mapa = espaciosOcupados([a, b, c], MANANA_10, MANANA_10 + HORA, { ahora: AHORA });
    assert.deepEqual([...mapa.keys()].sort(), ["Cancha", "Coliseo"]);
    assert.deepEqual(mapa.get("Coliseo").map((j) => j.id), [a.id, b.id]);
  });
});

describe("sugerirEspaciosAlternos (qué muestra el detalle)", () => {
  const sugerir = (jornada, otras) => sugerirEspaciosAlternos(jornada, [jornada, ...otras], AHORA);

  it("una jornada activa cuyo espacio nadie más usa a esa hora no muestra sugerencias", () => {
    const propia = jornada("Coliseo", MANANA_10);
    assert.equal(sugerir(propia, [jornada("Cancha", MANANA_10)]), null);
  });

  it("una jornada activa cuyo espacio choca con otra sugiere los espacios libres (sin el suyo)", () => {
    const propia = jornada("Coliseo", MANANA_10);
    const otra = jornada("Coliseo", MANANA_10 + 15 * MIN, { titulo: "Otra" });
    const ocupada = jornada("Cancha", MANANA_10);
    const r = sugerir(propia, [otra, ocupada]);
    assert.equal(r.motivo, "ocupado");
    assert.deepEqual(r.ocupantes.map((j) => j.titulo), ["Otra"]);
    assert.equal(r.libres.includes("Coliseo"), false, "no se sugiere su propio espacio");
    assert.equal(r.libres.includes("Cancha"), false, "ni uno que está ocupado");
    assert.equal(r.libres.includes("Auditorio"), true);
  });

  it("una jornada cancelada sugiere los demás espacios libres a su hora", () => {
    const cancelada = jornada("Bloque 1", MANANA_10, { activa: false });
    const r = sugerir(cancelada, [jornada("Bloque 2", MANANA_10)]);
    assert.equal(r.motivo, "cancelada");
    assert.equal(r.libres.includes("Bloque 1"), false);
    assert.equal(r.libres.includes("Bloque 2"), false);
    assert.equal(r.libres.length, ESPACIOS.length - 2);
  });

  it("una cancelada con todos los demás espacios ocupados no tiene alternos", () => {
    const cancelada = jornada("Bloque 1", MANANA_10, { activa: false });
    const resto = ESPACIOS.filter((e) => e !== "Bloque 1").map((e) => jornada(e, MANANA_10));
    assert.deepEqual(sugerir(cancelada, resto).libres, []);
  });

  it("no sugiere nada para jornadas que ya empezaron, ya terminaron o no tienen fecha", () => {
    const enCurso = jornada("Coliseo", AHORA - 10 * MIN);
    const finalizada = jornada("Coliseo", AHORA - DIA, { activa: false });
    assert.equal(sugerir(enCurso, [jornada("Coliseo", AHORA - 5 * MIN)]), null);
    assert.equal(sugerir(finalizada, []), null);
    assert.equal(sugerirEspaciosAlternos({ id: "x", lugar: "Coliseo", activa: true }, [], AHORA), null);
    assert.equal(sugerirEspaciosAlternos(null, [], AHORA), null);
  });

  it("la propia jornada no cuenta como la que ocupa su espacio", () => {
    const propia = jornada("Coliseo", MANANA_10);
    assert.equal(sugerirEspaciosAlternos(propia, [propia], AHORA), null);
  });
});

describe("listaCorta", () => {
  it("lista todo si cabe y resume el resto si no", () => {
    assert.equal(listaCorta([]), "");
    assert.equal(listaCorta(["Coliseo"]), "Coliseo");
    assert.equal(listaCorta(["A", "B", "C", "D", "E"]), "A, B, C, D, E");
    assert.equal(listaCorta(["A", "B", "C", "D", "E", "F"]), "A, B, C, D, E y 1 más");
    assert.equal(listaCorta(ESPACIOS), "Bloque 1, Bloque 2, Bloque 3, Bloque 4, Bloque 5 y 11 más");
    assert.equal(listaCorta(["A", "B", "C"], 2), "A, B y 1 más");
  });

  it("tolera valores que no son una lista", () => {
    assert.equal(listaCorta(undefined), "");
    assert.equal(listaCorta(null), "");
  });
});
