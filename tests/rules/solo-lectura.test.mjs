// Reglas de DESPUÉS de la migración (firestore.api.rules): la app solo lee lo suyo y no escribe
// nada; la API (Admin SDK, que ignora las reglas) es la única escritora.
// Ejecutar con: npm run test:rules
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, orderBy, limit, query, setDoc, setLogLevel, updateDoc, where,
} from "firebase/firestore";

setLogLevel("silent");

const futuro = () => Timestamp.fromMillis(Date.now() + 10 * 24 * 3600 * 1000);
const jornada = (extra = {}) => ({
  titulo: "J", descripcion: "D", entidad: "E", responsable: "R", lugar: "Coliseo",
  fecha: futuro(), cuposTotales: 5, cuposOcupados: 0, activa: true, creadoPor: "gestorA", ...extra,
});

let env;
const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

const USUARIOS = ["est1", "est2", "gestorA", "admin1", "adminInactivo", "sinPerfil", null];

describe("reglas posteriores a la migración: la app solo lee, la API escribe", () => {
  before(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-jornadaviva-lectura",
      firestore: { rules: readFileSync(new URL("../../firestore.api.rules", import.meta.url), "utf8") },
    });
  });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const a = ctx.firestore();
      await setDoc(doc(a, "users/est1"), { nombre: "Ana", rol: "estudiante" });
      await setDoc(doc(a, "users/est2"), { nombre: "Beto", rol: "estudiante" });
      await setDoc(doc(a, "users/gestorA"), { nombre: "G", rol: "gestor" });
      await setDoc(doc(a, "users/admin1"), { nombre: "Admin", rol: "administrador" });
      await setDoc(doc(a, "users/adminInactivo"), { nombre: "Baja", rol: "administrador", activo: false });
      await setDoc(doc(a, "jornadas/j1"), jornada());
      await setDoc(doc(a, "inscripciones/est1_j1"), { userId: "est1", jornadaId: "j1" });
      await setDoc(doc(a, "notificaciones/n1"), { userId: "est1", leida: false });
      await setDoc(doc(a, "notificaciones/n2"), { userId: "est2", leida: false });
      await setDoc(doc(a, "auditoria/a1"), { accion: "x", actorId: "admin1" });
      await setDoc(doc(a, "eventos_jornadas/e1"), { x: 1 });
    });
  });

  describe("ninguna escritura directa, sea cual sea el rol", () => {
    const escrituras = [
      ["crear un perfil", (d, uid) => setDoc(doc(d, `users/${uid || "nadie"}`), { rol: "estudiante" })],
      ["cambiarse el rol", (d, uid) => updateDoc(doc(d, `users/${uid || "est1"}`), { rol: "administrador" })],
      ["editar el propio perfil (token push)", (d, uid) => updateDoc(doc(d, `users/${uid || "est1"}`), { pushToken: "t" })],
      ["anotar el estado visto", (d, uid) => setDoc(doc(d, `users/${uid || "est1"}`), { jornadasVistas: { j1: {} } }, { merge: true })],
      ["crear una jornada", (d, uid) => setDoc(doc(d, "jornadas/nueva"), jornada({ creadoPor: uid || "gestorA" }))],
      ["editar una jornada", (d) => updateDoc(doc(d, "jornadas/j1"), { titulo: "otro" })],
      ["mover el contador de cupos", (d) => updateDoc(doc(d, "jornadas/j1"), { cuposOcupados: 1 })],
      ["desactivar una jornada", (d) => updateDoc(doc(d, "jornadas/j1"), { activa: false })],
      ["eliminar una jornada", (d) => deleteDoc(doc(d, "jornadas/j1"))],
      ["inscribirse", (d, uid) => setDoc(doc(d, `inscripciones/${uid || "x"}_j1`), { userId: uid || "x", jornadaId: "j1" })],
      ["cancelar la inscripción", (d) => deleteDoc(doc(d, "inscripciones/est1_j1"))],
      ["crear una notificación", (d, uid) => setDoc(doc(d, "notificaciones/nueva"), { userId: uid || "est1", leida: false })],
      ["marcar una notificación como leída", (d) => updateDoc(doc(d, "notificaciones/n1"), { leida: true })],
      ["eliminar una notificación", (d) => deleteDoc(doc(d, "notificaciones/n1"))],
      ["escribir en la auditoría", (d, uid) => setDoc(doc(d, "auditoria/nueva"), { accion: "x", actorId: uid || "admin1" })],
      ["borrar la auditoría", (d) => deleteDoc(doc(d, "auditoria/a1"))],
      ["crear un evento", (d) => setDoc(doc(d, "eventos_jornadas/nuevo"), { x: 1 })],
    ];
    for (const [nombre, escribir] of escrituras) {
      it(`nadie puede ${nombre}`, async () => {
        for (const uid of USUARIOS) await assertFails(escribir(db(uid), uid));
      });
    }
  });

  describe("las lecturas que necesita la app se conservan", () => {
    it("cada usuario lee su perfil (rol y estado en vivo) y no el de otros", async () => {
      await assertSucceeds(getDoc(doc(db("est1"), "users/est1")));
      await assertFails(getDoc(doc(db("est1"), "users/est2")));
      await assertFails(getDoc(doc(db("gestorA"), "users/est1")));
      await assertFails(getDoc(doc(db(null), "users/est1")));
    });

    it("el administrador activo lista los usuarios; el desactivado y el resto no", async () => {
      await assertSucceeds(getDocs(collection(db("admin1"), "users")));
      await assertFails(getDocs(collection(db("adminInactivo"), "users")));
      await assertFails(getDocs(collection(db("est1"), "users")));
      await assertFails(getDocs(collection(db("gestorA"), "users")));
    });

    it("cualquier usuario con sesión lee las jornadas; sin sesión no", async () => {
      for (const uid of ["est1", "gestorA", "admin1", "sinPerfil"]) await assertSucceeds(getDocs(collection(db(uid), "jornadas")));
      await assertFails(getDocs(collection(db(null), "jornadas")));
    });

    it("cada alumno lee solo sus inscripciones (la lista de inscritos de otros la entrega la API)", async () => {
      await assertSucceeds(getDocs(query(collection(db("est1"), "inscripciones"), where("userId", "==", "est1"))));
      await assertFails(getDocs(query(collection(db("est2"), "inscripciones"), where("userId", "==", "est1"))));
      await assertFails(getDocs(query(collection(db("gestorA"), "inscripciones"), where("jornadaId", "==", "j1"))));
      await assertFails(getDocs(query(collection(db("admin1"), "inscripciones"), where("jornadaId", "==", "j1"))));
    });

    it("cada usuario lee solo sus notificaciones", async () => {
      await assertSucceeds(getDocs(query(collection(db("est1"), "notificaciones"), where("userId", "==", "est1"))));
      await assertFails(getDocs(query(collection(db("est1"), "notificaciones"), where("userId", "==", "est2"))));
      await assertFails(getDoc(doc(db("est1"), "notificaciones/n2")));
    });

    it("solo el administrador activo lee la auditoría", async () => {
      await assertSucceeds(getDocs(query(collection(db("admin1"), "auditoria"), orderBy("accion"), limit(5))));
      await assertFails(getDocs(collection(db("adminInactivo"), "auditoria")));
      await assertFails(getDocs(collection(db("gestorA"), "auditoria")));
      await assertFails(getDocs(collection(db("est1"), "auditoria")));
    });
  });
});
