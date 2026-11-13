// Pruebas de autorización de firestore.rules contra el emulador de Firestore.
// Ejecutar con: npm run test:rules
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  setLogLevel,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { ESPACIOS } from "../../src/utils/espacios.js";

const DIA = 24 * 3600 * 1000;
const futuro = (dias = 10) => Timestamp.fromMillis(Date.now() + dias * DIA);
const pasado = (dias = 2) => Timestamp.fromMillis(Date.now() - dias * DIA);

const jornadaBase = (extra = {}) => ({
  titulo: "Jornada de prueba",
  descripcion: "Descripción de la jornada",
  entidad: "Institución Universitaria Tecnológico de Antioquia",
  responsable: "Bienestar",
  lugar: "Bloque 1",
  fecha: futuro(),
  cuposTotales: 5,
  cuposOcupados: 0,
  activa: true,
  creadoPor: "maestroA",
  ...extra,
});

// El SDK registra cada denegación esperada como error: se silencia para ver solo los resultados
setLogLevel("silent");

// RULES_PATH permite probar otra versión de las reglas (p. ej. para mutaciones)
const RUTA_REGLAS = process.env.RULES_PATH || new URL("../../firestore.rules", import.meta.url);

let env;

// Usuarios: maestroA y maestroB (rol maestro), est1 y est2 (estudiante),
// legado (perfil anterior a los roles, sin campo `rol`) y sinPerfil (sin documento)
const db = (uid) =>
  uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

async function sembrar() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, "users/maestroA"), { nombre: "Maestro A", rol: "maestro" });
    await setDoc(doc(admin, "users/maestroB"), { nombre: "Maestro B", rol: "maestro" });
    await setDoc(doc(admin, "users/est1"), { nombre: "Ana", rol: "estudiante" });
    await setDoc(doc(admin, "users/est2"), { nombre: "Beto", rol: "estudiante" });
    await setDoc(doc(admin, "users/legado"), { nombre: "Legado" });

    await setDoc(doc(admin, "jornadas/jA"), jornadaBase({ cuposOcupados: 2 }));
    await setDoc(doc(admin, "jornadas/jA2"), jornadaBase({ titulo: "Otra de A" }));
    await setDoc(doc(admin, "jornadas/jB"), jornadaBase({ creadoPor: "maestroB" }));
    await setDoc(doc(admin, "jornadas/jCancelada"), jornadaBase({ activa: false }));
    await setDoc(doc(admin, "jornadas/jPasada"), jornadaBase({ fecha: pasado() }));
    await setDoc(doc(admin, "jornadas/jPasadaInactiva"), jornadaBase({ fecha: pasado(), activa: false }));
    // jornada anterior a los roles: sin propietario
    const { creadoPor, ...sinPropietario } = jornadaBase();
    await setDoc(doc(admin, "jornadas/jLegado"), sinPropietario);

    const inscrip = (userId, jornadaId, extra = {}) => ({
      userId,
      jornadaId,
      nombreUsuario: userId,
      emailUsuario: `${userId}@x.co`,
      tituloJornada: "Jornada",
      inscritoEn: Timestamp.now(),
      asistio: false,
      ...extra,
    });
    await setDoc(doc(admin, "inscripciones/est1_jA"), inscrip("est1", "jA"));
    await setDoc(doc(admin, "inscripciones/est2_jA"), inscrip("est2", "jA"));
    await setDoc(doc(admin, "inscripciones/est1_jB"), inscrip("est1", "jB"));
    await setDoc(doc(admin, "inscripciones/est1_jLegado"), inscrip("est1", "jLegado"));
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

describe("roles y perfil de usuario", () => {
  it("cada usuario lee solo su propio perfil", async () => {
    await assertSucceeds(getDoc(doc(db("est1"), "users/est1")));
    await assertFails(getDoc(doc(db("est1"), "users/maestroA")));
    await assertFails(getDoc(doc(db(null), "users/est1")));
  });

  it("al registrarse solo se puede ser estudiante (no auto-asignarse maestro)", async () => {
    const nuevo = (uid, datos) => setDoc(doc(db(uid), `users/${uid}`), { uid, nombre: "N", ...datos });
    await assertFails(nuevo("nuevo1", { rol: "maestro" }));
    await assertSucceeds(nuevo("nuevo2", { rol: "estudiante" }));
    await assertSucceeds(nuevo("nuevo3", {})); // sin rol: se trata como estudiante
  });

  it("nadie puede cambiarse el rol desde la app", async () => {
    await assertFails(updateDoc(doc(db("est1"), "users/est1"), { rol: "maestro" }));
    await assertFails(updateDoc(doc(db("legado"), "users/legado"), { rol: "maestro" }));
    await assertFails(updateDoc(doc(db("maestroA"), "users/maestroA"), { rol: "estudiante" }));
    await assertFails(setDoc(doc(db("est1"), "users/est1"), { nombre: "Ana", rol: "maestro" }));
  });

  it("sí puede actualizar el resto de su perfil (token de notificaciones)", async () => {
    await assertSucceeds(updateDoc(doc(db("est1"), "users/est1"), { pushToken: "ExpoPushToken[x]" }));
    await assertSucceeds(updateDoc(doc(db("maestroA"), "users/maestroA"), { nombre: "Nuevo" }));
  });

  it("un perfil anterior a los roles puede quedar como estudiante, nunca como maestro", async () => {
    await assertSucceeds(updateDoc(doc(db("legado"), "users/legado"), { rol: "estudiante" }));
  });

  it("el alumno puede guardar en su perfil el estado visto de sus jornadas (avisos), sin afectar el rol", async () => {
    const visto = { activa: true, fecha: 1, titulo: "J", lugar: "Bloque 1", descripcion: "d", responsable: "r", entidad: "e" };
    await assertSucceeds(
      setDoc(doc(db("est1"), "users/est1"), { jornadasVistas: { jA: visto } }, { merge: true })
    );
    await assertSucceeds(
      setDoc(doc(db("est1"), "users/est1"), { jornadasVistas: { jA: deleteField() } }, { merge: true })
    );
    // la misma vía no sirve para cambiar el rol ni para escribir en el perfil de otro
    await assertFails(
      setDoc(doc(db("est1"), "users/est1"), { rol: "maestro", jornadasVistas: { jA: visto } }, { merge: true })
    );
    await assertFails(
      setDoc(doc(db("est1"), "users/est2"), { jornadasVistas: { jA: visto } }, { merge: true })
    );
    await assertSucceeds(
      setDoc(doc(db("legado"), "users/legado"), { jornadasVistas: { jA: visto } }, { merge: true })
    );
  });

  it("no se puede borrar el perfil (evita reiniciar el rol)", async () => {
    await assertFails(deleteDoc(doc(db("maestroA"), "users/maestroA")));
  });
});

describe("crear jornadas", () => {
  const crear = (uid, datos) => setDoc(doc(db(uid), "jornadas/nueva"), datos);

  it("un maestro crea una jornada a su nombre", async () => {
    await assertSucceeds(crear("maestroA", jornadaBase({ creadaEn: serverTimestamp() })));
  });

  it("acepta cada uno de los espacios permitidos (bloques 1-13, auditorio, cancha, coliseo)", async () => {
    for (const lugar of ESPACIOS) {
      await assertSucceeds(
        setDoc(doc(db("maestroA"), `jornadas/esp-${lugar}`), jornadaBase({ lugar }))
      );
    }
  });

  it("rechaza espacios que no están en la lista", async () => {
    for (const lugar of ["Bloque 14", "Bloque 0", "bloque 1", "Cafetería", "", "Cancha 2"]) {
      await assertFails(crear("maestroA", jornadaBase({ lugar })));
    }
  });

  it("un estudiante, un usuario sin perfil o sin sesión no pueden crear jornadas", async () => {
    await assertFails(crear("est1", jornadaBase({ creadoPor: "est1" })));
    await assertFails(crear("legado", jornadaBase({ creadoPor: "legado" })));
    await assertFails(crear("sinPerfil", jornadaBase({ creadoPor: "sinPerfil" })));
    await assertFails(crear(null, jornadaBase()));
  });

  it("no se puede crear a nombre de otro maestro", async () => {
    await assertFails(crear("maestroA", jornadaBase({ creadoPor: "maestroB" })));
  });

  it("valida el estado inicial: sin cupos ocupados, activa y con fecha futura", async () => {
    await assertFails(crear("maestroA", jornadaBase({ cuposOcupados: 3 })));
    await assertFails(crear("maestroA", jornadaBase({ activa: false })));
    await assertFails(crear("maestroA", jornadaBase({ fecha: pasado() })));
  });

  it("valida cupos, textos, tipos y campos", async () => {
    for (const cuposTotales of [0, -1, 1001, 1.5, "10"]) {
      await assertFails(crear("maestroA", jornadaBase({ cuposTotales })));
    }
    await assertFails(crear("maestroA", jornadaBase({ titulo: "" })));
    await assertFails(crear("maestroA", jornadaBase({ titulo: "x".repeat(121) })));
    await assertFails(crear("maestroA", jornadaBase({ descripcion: "" })));
    await assertFails(crear("maestroA", jornadaBase({ fecha: "2030-01-01" })));
    await assertFails(crear("maestroA", jornadaBase({ admin: true }))); // campo no permitido
    const { responsable, ...sinResponsable } = jornadaBase();
    await assertFails(crear("maestroA", sinResponsable));
  });
});

describe("administrar jornadas propias y ajenas", () => {
  const editar = (uid, id, cambios) => updateDoc(doc(db(uid), `jornadas/${id}`), cambios);

  it("el maestro edita su propia jornada", async () => {
    await assertSucceeds(editar("maestroA", "jA", { titulo: "Nuevo título" }));
    await assertSucceeds(editar("maestroA", "jA", { lugar: "Coliseo", fecha: futuro(20) }));
    await assertSucceeds(editar("maestroA", "jA", { cuposTotales: 30 }));
  });

  it("el maestro cancela y reactiva su propia jornada", async () => {
    await assertSucceeds(editar("maestroA", "jA", { activa: false }));
    await assertSucceeds(editar("maestroA", "jA", { activa: true }));
    await assertSucceeds(editar("maestroA", "jCancelada", { activa: true }));
  });

  it("no puede reactivar una jornada cuya fecha ya pasó, ni dejarla activa con fecha pasada", async () => {
    await assertFails(editar("maestroA", "jPasadaInactiva", { activa: true }));
    await assertFails(editar("maestroA", "jA", { fecha: pasado() }));
  });

  it("no puede reducir los cupos por debajo de los inscritos", async () => {
    await assertFails(editar("maestroA", "jA", { cuposTotales: 1 })); // hay 2 ocupados
    await assertSucceeds(editar("maestroA", "jA", { cuposTotales: 2 }));
  });

  it("no puede cambiar el propietario ni el contador de cupos junto con otros cambios", async () => {
    await assertFails(editar("maestroA", "jA", { creadoPor: "maestroB" }));
    await assertFails(editar("maestroA", "jA", { titulo: "x", cuposOcupados: 0 }));
  });

  it("el maestro elimina su propia jornada", async () => {
    await assertSucceeds(deleteDoc(doc(db("maestroA"), "jornadas/jA2")));
  });

  it("un maestro NO puede editar, cancelar ni eliminar jornadas de otro maestro", async () => {
    await assertFails(editar("maestroA", "jB", { titulo: "Robada" }));
    await assertFails(editar("maestroA", "jB", { activa: false }));
    await assertFails(editar("maestroA", "jB", { lugar: "Cancha" }));
    await assertFails(deleteDoc(doc(db("maestroA"), "jornadas/jB")));
    await assertFails(editar("maestroB", "jA", { titulo: "Robada" }));
    await assertFails(deleteDoc(doc(db("maestroB"), "jornadas/jA")));
  });

  it("un maestro no puede adueñarse de una jornada ajena ni de una anterior a los roles", async () => {
    await assertFails(editar("maestroA", "jB", { creadoPor: "maestroA" }));
    await assertFails(editar("maestroA", "jLegado", { creadoPor: "maestroA" }));
    await assertFails(editar("maestroA", "jLegado", { titulo: "Mía ahora" }));
    await assertFails(deleteDoc(doc(db("maestroA"), "jornadas/jLegado")));
  });

  it("un estudiante no puede modificar ni eliminar jornadas", async () => {
    for (const cambio of [
      { titulo: "Hackeada" },
      { activa: false },
      { lugar: "Cancha" },
      { fecha: futuro(30) },
      { cuposTotales: 999 },
      { creadoPor: "est1" },
    ]) {
      await assertFails(editar("est1", "jA", cambio));
    }
    await assertFails(deleteDoc(doc(db("est1"), "jornadas/jA")));
    await assertFails(editar("legado", "jA", { titulo: "Hackeada" }));
  });

  it("sin sesión no se lee ni se modifica nada", async () => {
    await assertFails(getDoc(doc(db(null), "jornadas/jA")));
    await assertFails(editar(null, "jA", { titulo: "x" }));
  });

  it("cualquier usuario con sesión ve las jornadas (estudiantes y maestros)", async () => {
    for (const uid of ["est1", "maestroA", "maestroB", "legado"]) {
      await assertSucceeds(getDocs(collection(db(uid), "jornadas")));
    }
  });
});

describe("cupos (inscribirse / cancelar) y vencimiento: flujos del estudiante", () => {
  const editar = (uid, id, cambios) => updateDoc(doc(db(uid), `jornadas/${id}`), cambios);

  it("el estudiante mueve el contador de cupos dentro de los límites", async () => {
    await assertSucceeds(editar("est1", "jA", { cuposOcupados: 3 }));
    await assertSucceeds(editar("est1", "jA", { cuposOcupados: 1 }));
    await assertFails(editar("est1", "jA", { cuposOcupados: -1 }));
    await assertFails(editar("est1", "jA", { cuposOcupados: 6 })); // total 5
    await assertFails(editar("est1", "jA", { cuposOcupados: "3" }));
  });

  it("no puede aprovechar el cambio de cupos para tocar otros campos", async () => {
    await assertFails(editar("est1", "jA", { cuposOcupados: 3, titulo: "x" }));
    await assertFails(editar("est1", "jA", { cuposOcupados: 3, activa: false }));
  });

  it("cualquier usuario puede desactivar una jornada vencida (limpieza automática)", async () => {
    await assertSucceeds(editar("est1", "jPasada", { activa: false }));
    await assertSucceeds(editar("maestroB", "jPasada", { activa: false })); // aunque no sea suya
  });

  it("la limpieza no sirve para cancelar jornadas futuras ni para reactivar", async () => {
    await assertFails(editar("est1", "jA", { activa: false }));
    await assertFails(editar("maestroB", "jA", { activa: false }));
    await assertFails(editar("est1", "jCancelada", { activa: true }));
    await assertFails(editar("est1", "jPasada", { activa: false, titulo: "x" }));
  });
});

describe("inscripciones y planilla de inscritos", () => {
  const inscritosDe = (uid, jornadaId) =>
    getDocs(query(collection(db(uid), "inscripciones"), where("jornadaId", "==", jornadaId)));

  it("el maestro lee la lista de inscritos de SUS jornadas", async () => {
    const lista = await assertSucceeds(inscritosDe("maestroA", "jA"));
    const ids = lista.docs.map((d) => d.id).sort();
    if (ids.join() !== "est1_jA,est2_jA") throw new Error("lista inesperada: " + ids);
    await assertSucceeds(getDoc(doc(db("maestroA"), "inscripciones/est1_jA")));
  });

  it("el maestro NO lee los inscritos de jornadas ajenas ni de las anteriores a los roles", async () => {
    await assertFails(inscritosDe("maestroA", "jB"));
    await assertFails(inscritosDe("maestroB", "jA"));
    await assertFails(inscritosDe("maestroA", "jLegado"));
    await assertFails(getDoc(doc(db("maestroA"), "inscripciones/est1_jB")));
    await assertFails(getDocs(collection(db("maestroA"), "inscripciones"))); // sin filtrar
  });

  it("el estudiante solo lee sus propias inscripciones, aunque la jornada no sea suya", async () => {
    await assertSucceeds(
      getDocs(query(collection(db("est1"), "inscripciones"), where("userId", "==", "est1")))
    );
    await assertFails(
      getDocs(query(collection(db("est1"), "inscripciones"), where("userId", "==", "est2")))
    );
    await assertFails(inscritosDe("est1", "jA")); // no es el maestro de la jornada
    await assertFails(getDoc(doc(db("est1"), "inscripciones/est2_jA")));
  });

  it("el estudiante conserva crear y borrar su inscripción; nadie la edita", async () => {
    const nueva = (userId) => ({
      userId, jornadaId: "jA2", nombreUsuario: "n", emailUsuario: "e@x.co",
      tituloJornada: "t", inscritoEn: serverTimestamp(), asistio: false,
    });
    await assertSucceeds(setDoc(doc(db("est1"), "inscripciones/est1_jA2"), nueva("est1")));
    await assertFails(setDoc(doc(db("est1"), "inscripciones/est2_jA2"), nueva("est2")));
    await assertFails(updateDoc(doc(db("est1"), "inscripciones/est1_jA"), { asistio: true }));
    await assertFails(updateDoc(doc(db("maestroA"), "inscripciones/est1_jA"), { asistio: true }));
    await assertSucceeds(deleteDoc(doc(db("est1"), "inscripciones/est1_jA")));
  });

  it("el maestro no puede borrar ni crear inscripciones de estudiantes", async () => {
    await assertFails(deleteDoc(doc(db("maestroA"), "inscripciones/est2_jA")));
    await assertFails(
      setDoc(doc(db("maestroA"), "inscripciones/falsa"), {
        userId: "est2", jornadaId: "jA", nombreUsuario: "x", emailUsuario: "x@x.co",
      })
    );
  });
});

describe("el rol se asigna fuera de la app", () => {
  it("al asignarlo con privilegios de administrador, el usuario adquiere las funciones de maestro", async () => {
    await assertFails(
      setDoc(doc(db("est1"), "jornadas/nueva"), jornadaBase({ creadoPor: "est1" }))
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "users/est1"), { rol: "maestro" });
    });
    await assertSucceeds(
      setDoc(doc(db("est1"), "jornadas/nueva"), jornadaBase({ creadoPor: "est1" }))
    );
  });

  it("al quitarle el rol, pierde la administración de sus jornadas", async () => {
    await assertSucceeds(updateDoc(doc(db("maestroA"), "jornadas/jA"), { titulo: "ok" }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "users/maestroA"), { rol: "estudiante" });
    });
    await assertFails(updateDoc(doc(db("maestroA"), "jornadas/jA"), { titulo: "ya no" }));
    await assertFails(deleteDoc(doc(db("maestroA"), "jornadas/jA")));
  });
});

describe("notificaciones (sin cambios)", () => {
  it("cada usuario crea y lee solo las suyas", async () => {
    await assertSucceeds(setDoc(doc(db("est1"), "notificaciones/n1"), { userId: "est1", titulo: "t" }));
    await assertFails(setDoc(doc(db("est1"), "notificaciones/n2"), { userId: "est2", titulo: "t" }));
    await assertSucceeds(getDoc(doc(db("est1"), "notificaciones/n1")));
    await assertFails(getDoc(doc(db("est2"), "notificaciones/n1")));
  });
});
