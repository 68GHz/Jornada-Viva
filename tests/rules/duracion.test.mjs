// Duración de las jornadas y asistencia en firestore.rules.
// Ejecutar con: npm run test:rules
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  setDoc,
  setLogLevel,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

setLogLevel("silent");
const RUTA_REGLAS = process.env.RULES_PATH || new URL("../../firestore.rules", import.meta.url);

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
const en = (ms) => Timestamp.fromMillis(Date.now() + ms);
const jornadaBase = (extra = {}) => ({
  titulo: "Jornada", descripcion: "Descripción", entidad: "TdeA", responsable: "Bienestar",
  lugar: "Bloque 1", fecha: en(10 * DIA), cuposTotales: 5, cuposOcupados: 0, activa: true,
  creadoPor: "gestorA", ...extra,
});

let env;
const db = (uid) => env.authenticatedContext(uid).firestore();

async function sembrar() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    await setDoc(doc(a, "users/admin1"), { nombre: "Admin", rol: "administrador" });
    await setDoc(doc(a, "users/gestorA"), { nombre: "Gestor A", rol: "gestor" });
    await setDoc(doc(a, "users/gestorB"), { nombre: "Gestor B", rol: "gestor" });
    await setDoc(doc(a, "users/est1"), { nombre: "Ana", rol: "estudiante" });

    // Sin duración (anteriores al campo): empezaron hace 30 y hace 90 minutos
    await setDoc(doc(a, "jornadas/sinDuracionEnCurso"), jornadaBase({ fecha: en(-30 * MIN) }));
    await setDoc(doc(a, "jornadas/sinDuracionTerminada"), jornadaBase({ fecha: en(-90 * MIN) }));
    // Con duración propia
    await setDoc(doc(a, "jornadas/larga"), jornadaBase({ fecha: en(-90 * MIN), duracionMin: 180 }));
    await setDoc(doc(a, "jornadas/corta"), jornadaBase({ fecha: en(-30 * MIN), duracionMin: 10 }));
    await setDoc(doc(a, "jornadas/terminadaCancelada"), jornadaBase({ fecha: en(-90 * MIN), activa: false }));
    await setDoc(doc(a, "jornadas/futura"), jornadaBase({ duracionMin: 90 }));
    await setDoc(doc(a, "jornadas/futuraSinDuracion"), jornadaBase());

    await setDoc(doc(a, "inscripciones/est1_enCurso"), { userId: "est1", jornadaId: "sinDuracionEnCurso", asistio: false });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-jornadaviva",
    firestore: { rules: readFileSync(RUTA_REGLAS, "utf8") },
  });
});
after(async () => env?.cleanup());
beforeEach(sembrar);

describe("el campo de duración de una jornada", () => {
  const crear = (uid, extra) => addDoc(collection(db(uid), "jornadas"), jornadaBase({ creadoPor: uid, ...extra }));
  const editar = (uid, id, cambios) => updateDoc(doc(db(uid), `jornadas/${id}`), cambios);

  it("se acepta entre 10 y 1440 minutos, al crear y al editar", async () => {
    for (const duracionMin of [10, 60, 1440]) await assertSucceeds(crear("gestorA", { duracionMin }));
    await assertSucceeds(editar("gestorA", "futura", { duracionMin: 120 }));
    await assertSucceeds(editar("admin1", "futura", { duracionMin: 30 }));
  });

  it("se rechaza fuera de rango, con decimales o con otro tipo", async () => {
    for (const duracionMin of [0, 9, 1441, -60, 45.5, "60", null, true]) {
      await assertFails(crear("gestorA", { duracionMin }));
      await assertFails(editar("gestorA", "futura", { duracionMin }));
    }
  });

  it("es opcional: una jornada sin el campo se puede crear, editar y cancelar (anteriores a la migración)", async () => {
    await assertSucceeds(crear("gestorA", {}));
    await assertSucceeds(editar("gestorA", "futuraSinDuracion", { titulo: "Nuevo título" }));
    await assertSucceeds(editar("gestorA", "futuraSinDuracion", { activa: false }));
  });

  it("el gestor ajeno sigue sin poder tocar la duración de jornadas que no son suyas", async () => {
    await assertFails(editar("gestorB", "futura", { duracionMin: 120 }));
  });

  it("no admite otros campos inventados junto a la duración", async () => {
    await assertFails(crear("gestorA", { duracionMin: 60, invento: "x" }));
  });
});

describe("la categoría de una jornada (solo valores de la lista; opcional)", () => {
  const crear = (uid, extra) => addDoc(collection(db(uid), "jornadas"), jornadaBase({ creadoPor: uid, ...extra }));
  const editar = (uid, id, cambios) => updateDoc(doc(db(uid), `jornadas/${id}`), cambios);

  it("acepta cada categoría de la lista, al crear y al editar", async () => {
    for (const categoria of ["Salud", "Alfabetización digital", "Proyección social", "Talleres", "Asesorías"]) {
      await assertSucceeds(crear("gestorA", { categoria }));
    }
    await assertSucceeds(editar("gestorA", "futura", { categoria: "Talleres" }));
  });

  it("rechaza una fuera de la lista o que no es texto", async () => {
    for (const categoria of ["Deportes", "salud", "", 5, null]) {
      await assertFails(crear("gestorA", { categoria }));
    }
    await assertFails(editar("gestorA", "futura", { categoria: "Deportes" }));
  });

  it("es opcional: las jornadas anteriores se siguen creando y editando sin ella", async () => {
    await assertSucceeds(crear("gestorA", {}));
    await assertSucceeds(editar("gestorA", "futuraSinDuracion", { titulo: "Nuevo título" }));
  });

  it("un gestor ajeno no puede cambiarla", async () => {
    await assertFails(editar("gestorB", "futura", { categoria: "Salud" }));
  });
});

describe("vencimiento: se desactiva al terminar, no al empezar", () => {
  const desactivar = (uid, id) => updateDoc(doc(db(uid), `jornadas/${id}`), { activa: false });

  it("una jornada en curso no se puede desactivar por vencimiento", async () => {
    await assertFails(desactivar("est1", "sinDuracionEnCurso")); // empezó hace 30 min de 60
    await assertFails(desactivar("est1", "larga")); // empezó hace 90 min de 180
    await assertFails(desactivar("gestorB", "larga"));
  });

  it("cualquier usuario puede desactivarla cuando ya pasó inicio + duración", async () => {
    await assertSucceeds(desactivar("est1", "sinDuracionTerminada")); // 90 min > 60 por defecto
    await assertSucceeds(desactivar("est1", "corta")); // 30 min > 10
  });

  it("sirve solo para desactivar: no para tocar otros campos ni para reactivar", async () => {
    await assertFails(updateDoc(doc(db("est1"), "jornadas/sinDuracionTerminada"), { activa: false, titulo: "x" }));
    await assertFails(updateDoc(doc(db("est1"), "jornadas/terminadaCancelada"), { activa: true }));
  });

  it("una jornada futura no se desactiva por vencimiento", async () => {
    await assertFails(desactivar("est1", "futura"));
    await assertFails(desactivar("est1", "futuraSinDuracion"));
  });
});

describe("la asistencia ya no se escribe desde la app (la registra la API)", () => {
  const asistencia = { asistio: true, asistioEn: serverTimestamp(), metodoAsistencia: "qr" };

  it("ni el estudiante en su jornada en curso, ni el gestor, ni el administrador", async () => {
    await assertFails(updateDoc(doc(db("est1"), "inscripciones/est1_enCurso"), asistencia));
    await assertFails(updateDoc(doc(db("gestorA"), "inscripciones/est1_enCurso"), { asistio: true, metodoAsistencia: "manual" }));
    await assertFails(updateDoc(doc(db("admin1"), "inscripciones/est1_enCurso"), { asistio: true }));
  });
});
