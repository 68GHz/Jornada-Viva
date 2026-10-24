// Autorización de los tres roles (estudiante, gestor, administrador) en firestore.rules.
// Ejecutar con: npm run test:rules
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
} from "firebase/firestore";

setLogLevel("silent");
const RUTA_REGLAS = process.env.RULES_PATH || new URL("../../firestore.rules", import.meta.url);

const DIA = 24 * 3600 * 1000;
const futuro = (d = 10) => Timestamp.fromMillis(Date.now() + d * DIA);
const pasado = (d = 2) => Timestamp.fromMillis(Date.now() - d * DIA);
const jornadaBase = (extra = {}) => ({
  titulo: "Jornada", descripcion: "Descripción", entidad: "TdeA", responsable: "Bienestar",
  lugar: "Bloque 1", fecha: futuro(), cuposTotales: 5, cuposOcupados: 0, activa: true,
  creadoPor: "gestorA", ...extra,
});

let env;
const db = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

async function sembrar() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const a = ctx.firestore();
    const usuarios = {
      admin1: { nombre: "Admin 1", rol: "administrador" },
      admin2: { nombre: "Admin 2", rol: "administrador" },
      adminInactivo: { nombre: "Admin inactivo", rol: "administrador", activo: false },
      gestorA: { nombre: "Gestor A", rol: "gestor" },
      gestorB: { nombre: "Gestor B", rol: "gestor" },
      gestorInactivo: { nombre: "Gestor inactivo", rol: "gestor", activo: false },
      maestroViejo: { nombre: "Maestro antiguo", rol: "maestro" }, // nombre anterior de "gestor"
      est1: { nombre: "Ana", rol: "estudiante" },
      est2: { nombre: "Beto", rol: "estudiante" },
      estInactivo: { nombre: "Inactivo", rol: "estudiante", activo: false },
    };
    for (const [uid, datos] of Object.entries(usuarios)) await setDoc(doc(a, `users/${uid}`), datos);

    await setDoc(doc(a, "jornadas/jA"), jornadaBase({ cuposOcupados: 2 }));
    await setDoc(doc(a, "jornadas/jB"), jornadaBase({ creadoPor: "gestorB" }));
    await setDoc(doc(a, "jornadas/jPasada"), jornadaBase({ fecha: pasado(), activa: false }));
    const { creadoPor, ...huerfana } = jornadaBase();
    await setDoc(doc(a, "jornadas/jLegado"), huerfana);
    await setDoc(doc(a, "inscripciones/est1_jA"), { userId: "est1", jornadaId: "jA", nombreUsuario: "Ana", emailUsuario: "a@x.co" });
    await setDoc(doc(a, "inscripciones/est1_jB"), { userId: "est1", jornadaId: "jB", nombreUsuario: "Ana", emailUsuario: "a@x.co" });
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

describe("administrador: gestión de usuarios", () => {
  it("lee todos los perfiles y el listado; los demás roles no", async () => {
    await assertSucceeds(getDocs(collection(db("admin1"), "users")));
    await assertSucceeds(getDoc(doc(db("admin1"), "users/est1")));
    for (const uid of ["est1", "gestorA", "maestroViejo", "adminInactivo"]) {
      await assertFails(getDocs(collection(db(uid), "users")));
      await assertFails(getDoc(doc(db(uid), "users/admin1")));
    }
    await assertSucceeds(getDoc(doc(db("est1"), "users/est1"))); // cada quien, el suyo
  });

  it("crea cuentas con cualquier rol válido y rechaza roles o estados inválidos", async () => {
    const crear = (uid, extra) => setDoc(doc(db("admin1"), `users/${uid}`), { nombre: "N", email: `${uid}@x.co`, ...extra });
    for (const rol of ["estudiante", "gestor", "administrador"]) await assertSucceeds(crear(`n-${rol}`, { rol }));
    await assertSucceeds(crear("n-inactivo", { rol: "estudiante", activo: false }));
    await assertFails(crear("n-raro", { rol: "superusuario" }));
    await assertFails(crear("n-raro2", { rol: "estudiante", activo: "no" }));
  });

  it("nadie más crea perfiles ajenos ni se registra con un rol elevado", async () => {
    const crear = (quien, uid, extra) => setDoc(doc(db(quien), `users/${uid}`), { nombre: "N", ...extra });
    await assertFails(crear("est1", "otro", { rol: "estudiante" }));
    await assertFails(crear("gestorA", "otro", { rol: "gestor" }));
    await assertFails(crear("adminInactivo", "otro", { rol: "estudiante" }));
    for (const rol of ["gestor", "administrador", "maestro"]) await assertFails(crear("nuevo", "nuevo", { rol }));
    await assertFails(crear("nuevo", "nuevo", { rol: "estudiante", activo: false }));
    await assertSucceeds(crear("nuevo", "nuevo", { rol: "estudiante" }));
  });

  it("asigna roles y activa o desactiva cuentas de otros", async () => {
    const editar = (uid, cambios) => updateDoc(doc(db("admin1"), `users/${uid}`), cambios);
    await assertSucceeds(editar("est1", { rol: "gestor" }));
    await assertSucceeds(editar("est1", { rol: "administrador" }));
    await assertSucceeds(editar("gestorA", { rol: "estudiante" }));
    await assertSucceeds(editar("est2", { activo: false }));
    await assertSucceeds(editar("estInactivo", { activo: true }));
    await assertSucceeds(editar("est2", { nombre: "Nuevo nombre" }));
    await assertFails(editar("est1", { rol: "superusuario" }));
    await assertFails(editar("est1", { activo: "si" }));
  });

  it("un administrador no puede cambiarse el rol ni desactivarse a sí mismo (pero sí editar su nombre)", async () => {
    const propio = (cambios) => updateDoc(doc(db("admin1"), "users/admin1"), cambios);
    await assertFails(propio({ rol: "estudiante" }));
    await assertFails(propio({ activo: false }));
    await assertSucceeds(propio({ nombre: "Otro nombre" }));
  });

  it("los demás roles no cambian roles ni el estado de ninguna cuenta, ni la propia", async () => {
    for (const uid of ["est1", "gestorA", "maestroViejo"]) {
      await assertFails(updateDoc(doc(db(uid), `users/${uid}`), { rol: "administrador" }));
      await assertFails(updateDoc(doc(db(uid), `users/${uid}`), { rol: "estudiante" === (uid === "est1" ? "estudiante" : "") ? "gestor" : "estudiante" }));
      await assertFails(updateDoc(doc(db(uid), "users/est2"), { rol: "administrador" }));
      await assertFails(updateDoc(doc(db(uid), "users/est2"), { activo: false }));
    }
    // una cuenta desactivada no puede reactivarse sola
    await assertFails(updateDoc(doc(db("estInactivo"), "users/estInactivo"), { activo: true }));
    // un administrador desactivado ya no tiene poder
    await assertFails(updateDoc(doc(db("adminInactivo"), "users/est1"), { rol: "gestor" }));
    await assertFails(getDocs(collection(db("adminInactivo"), "users")));
  });

  it("no se borran perfiles, ni siquiera el administrador", async () => {
    await assertFails(deleteDoc(doc(db("admin1"), "users/est1")));
    await assertFails(deleteDoc(doc(db("admin1"), "users/admin1")));
  });

  it("el rol antiguo 'maestro' sigue valiendo como gestor (compatibilidad durante la migración)", async () => {
    await assertSucceeds(setDoc(doc(db("maestroViejo"), "jornadas/n"), jornadaBase({ creadoPor: "maestroViejo" })));
  });
});

describe("administrador: gestión de jornadas", () => {
  const editar = (uid, id, cambios) => updateDoc(doc(db(uid), `jornadas/${id}`), cambios);

  it("crea jornadas asignadas a un gestor (o a un administrador)", async () => {
    let n = 0;
    const crear = (datos) => setDoc(doc(db("admin1"), `jornadas/nueva${n++}`), datos);
    await assertSucceeds(crear(jornadaBase({ creadoPor: "gestorA", creadaEn: serverTimestamp() })));
    await assertSucceeds(crear(jornadaBase({ creadoPor: "admin2" })));
    await assertSucceeds(crear(jornadaBase({ creadoPor: "maestroViejo" })));
  });

  it("no asigna jornadas a quien no puede gestionarlas ni crea datos inválidos", async () => {
    let n = 0;
    const crear = (datos) => setDoc(doc(db("admin1"), `jornadas/invalida${n++}`), datos);
    await assertFails(crear(jornadaBase({ creadoPor: "est1" })));
    await assertFails(crear(jornadaBase({ creadoPor: "gestorInactivo" })));
    await assertFails(crear(jornadaBase({ creadoPor: "uidQueNoExiste" })));
    await assertFails(crear(jornadaBase({ lugar: "Cafetería" })));
    await assertFails(crear(jornadaBase({ fecha: pasado() })));
    await assertFails(crear(jornadaBase({ cuposOcupados: 1 })));
    await assertFails(crear(jornadaBase({ cuposTotales: 0 })));
  });

  it("edita, cancela y reactiva cualquier jornada, también las ajenas y las anteriores a los roles", async () => {
    const { creadoPor, ...sinDueno } = jornadaBase();
    void sinDueno;
    await assertSucceeds(editar("admin1", "jB", { titulo: "Editada por el admin" }));
    await assertSucceeds(editar("admin1", "jB", { activa: false }));
    await assertSucceeds(editar("admin1", "jB", { activa: true }));
    await assertSucceeds(editar("admin1", "jA", { cuposTotales: 2 })); // = ocupados
    await assertFails(editar("admin1", "jA", { cuposTotales: 1 })); // por debajo de los inscritos
    await assertFails(editar("admin1", "jPasada", { activa: true })); // vencida
    await assertFails(editar("admin1", "jB", { lugar: "Bloque 99" }));
    // jornada anterior a los roles: se edita asignándole un gestor
    await assertSucceeds(editar("admin1", "jLegado", { titulo: "Ahora con dueño", creadoPor: "gestorA" }));
  });

  it("reasigna una jornada a otro gestor; el anterior pierde el acceso y el nuevo lo gana", async () => {
    await assertSucceeds(editar("gestorA", "jA", { titulo: "Antes de reasignar" }));
    await assertSucceeds(editar("admin1", "jA", { creadoPor: "gestorB" }));
    await assertFails(editar("gestorA", "jA", { titulo: "Ya no es mía" }));
    await assertSucceeds(editar("gestorB", "jA", { titulo: "Ahora es mía" }));
    await assertFails(editar("admin1", "jA", { creadoPor: "est1" }));
    await assertFails(editar("admin1", "jA", { creadoPor: "uidQueNoExiste" }));
  });

  it("elimina cualquier jornada; un gestor solo las suyas", async () => {
    await assertSucceeds(deleteDoc(doc(db("admin1"), "jornadas/jB")));
    await assertSucceeds(deleteDoc(doc(db("admin1"), "jornadas/jLegado")));
    await assertFails(deleteDoc(doc(db("gestorA"), "jornadas/jB")));
    await assertSucceeds(deleteDoc(doc(db("gestorA"), "jornadas/jA")));
    await assertFails(deleteDoc(doc(db("est1"), "jornadas/jPasada")));
  });

  it("el gestor sigue limitado a lo suyo (no hereda poderes de administrador)", async () => {
    await assertFails(editar("gestorA", "jB", { titulo: "x" }));
    await assertFails(editar("gestorA", "jLegado", { titulo: "x" }));
    await assertFails(editar("gestorA", "jA", { creadoPor: "gestorB" })); // no se auto-reasigna
    await assertFails(setDoc(doc(db("gestorA"), "jornadas/n"), jornadaBase({ creadoPor: "gestorB" })));
    await assertSucceeds(setDoc(doc(db("gestorA"), "jornadas/n"), jornadaBase({ creadoPor: "gestorA" })));
  });

  it("las cuentas desactivadas no pueden crear ni editar", async () => {
    await assertFails(setDoc(doc(db("gestorInactivo"), "jornadas/n"), jornadaBase({ creadoPor: "gestorInactivo" })));
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "jornadas/jI"), jornadaBase({ creadoPor: "gestorInactivo" })));
    await assertFails(editar("gestorInactivo", "jI", { titulo: "x" }));
    await assertFails(editar("estInactivo", "jA", { cuposOcupados: 3 }));
    await assertFails(setDoc(doc(db("adminInactivo"), "jornadas/n"), jornadaBase({ creadoPor: "gestorA" })));
  });
});

describe("participación e inscritos", () => {
  it("el administrador lee los inscritos de cualquier jornada y todas las inscripciones", async () => {
    await assertSucceeds(getDocs(collection(db("admin1"), "inscripciones")));
    for (const j of ["jA", "jB", "jLegado"]) {
      await assertSucceeds(getDocs(query(collection(db("admin1"), "inscripciones"), where("jornadaId", "==", j))));
    }
  });

  it("el gestor solo ve los de sus jornadas; el estudiante, los suyos", async () => {
    await assertSucceeds(getDocs(query(collection(db("gestorA"), "inscripciones"), where("jornadaId", "==", "jA"))));
    await assertFails(getDocs(query(collection(db("gestorA"), "inscripciones"), where("jornadaId", "==", "jB"))));
    await assertFails(getDocs(collection(db("gestorA"), "inscripciones")));
    await assertSucceeds(getDocs(query(collection(db("est1"), "inscripciones"), where("userId", "==", "est1"))));
    await assertFails(getDocs(collection(db("est1"), "inscripciones")));
  });

  it("el estudiante conserva inscribirse y cancelar; una cuenta desactivada no", async () => {
    const nueva = (uid) => ({ userId: uid, jornadaId: "jB", nombreUsuario: "n", emailUsuario: "e@x.co", inscritoEn: serverTimestamp(), asistio: false });
    await assertSucceeds(setDoc(doc(db("est2"), "inscripciones/est2_jB"), nueva("est2")));
    await assertSucceeds(updateDoc(doc(db("est2"), "jornadas/jB"), { cuposOcupados: 1 }));
    await assertSucceeds(deleteDoc(doc(db("est2"), "inscripciones/est2_jB")));
    await assertFails(setDoc(doc(db("estInactivo"), "inscripciones/estInactivo_jB"), nueva("estInactivo")));
  });
});

describe("auditoría", () => {
  const registro = (extra = {}) => ({
    accion: "usuario.rol", entidad: "usuario", entidadId: "est1", detalle: "estudiante -> gestor",
    actorId: "admin1", actorNombre: "Admin 1", creadaEn: serverTimestamp(), ...extra,
  });

  it("el administrador registra y consulta acciones, siempre a su nombre", async () => {
    await assertSucceeds(setDoc(doc(db("admin1"), "auditoria/r1"), registro()));
    await assertSucceeds(getDocs(collection(db("admin1"), "auditoria")));
    await assertFails(setDoc(doc(db("admin1"), "auditoria/r2"), registro({ actorId: "admin2" }))); // suplantación
    await assertFails(setDoc(doc(db("admin1"), "auditoria/r3"), registro({ creadaEn: Timestamp.now() }))); // fecha falsa
    await assertFails(setDoc(doc(db("admin1"), "auditoria/r4"), registro({ extra: "x" })));
    await assertFails(setDoc(doc(db("admin1"), "auditoria/r5"), registro({ accion: "" })));
    await assertFails(setDoc(doc(db("admin1"), "auditoria/r6"), registro({ detalle: "x".repeat(501) })));
  });

  it("los registros son inmutables", async () => {
    await assertSucceeds(setDoc(doc(db("admin1"), "auditoria/r1"), registro()));
    await assertFails(updateDoc(doc(db("admin1"), "auditoria/r1"), { detalle: "alterado" }));
    await assertFails(deleteDoc(doc(db("admin1"), "auditoria/r1")));
  });

  it("nadie más escribe ni lee la auditoría", async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), "auditoria/r0"), registro()));
    for (const uid of ["est1", "gestorA", "maestroViejo", "adminInactivo"]) {
      await assertFails(setDoc(doc(db(uid), "auditoria/x"), registro({ actorId: uid })));
      await assertFails(getDoc(doc(db(uid), "auditoria/r0")));
      await assertFails(getDocs(collection(db(uid), "auditoria")));
    }
    await assertFails(getDocs(collection(db(null), "auditoria")));
  });
});
