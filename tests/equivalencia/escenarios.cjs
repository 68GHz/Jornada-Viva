// Pruebas de EQUIVALENCIA: los servicios reales de la app, con los mismos escenarios, en dos modos.
//   MODO=local  la lógica de antes: SDK de Firestore + firestore.rules (comportamiento de referencia)
//   MODO=api    la app llamando a la API de negocio (Express + Admin SDK) sobre el mismo emulador
// Ambos modos deben cumplir las mismas expectativas. Las pocas diferencias aceptadas están
// marcadas con `MODO === "api"` y documentadas en docs/migracion-api/.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const Module = require("module");

const MODO = process.env.MODO === "api" ? "api" : "local";
const RAIZ = path.resolve(__dirname, "..", "..");
const CONSTRUIDO = path.join(__dirname, ".build");

// AsyncStorage y el aviso local del sistema (no existen en Node)
const memoria = new Map();
const locales = [];
const cargaPrevia = Module._load;
Module._load = function (peticion, ...resto) {
  if (peticion === "@react-native-async-storage/async-storage") {
    return {
      __esModule: true,
      default: {
        getItem: async (k) => (memoria.has(k) ? memoria.get(k) : null),
        setItem: async (k, v) => void memoria.set(k, v),
        getAllKeys: async () => [...memoria.keys()],
        multiRemove: async (ks) => ks.forEach((k) => memoria.delete(k)),
      },
    };
  }
  if (peticion === "./notificationService") {
    return { mostrarNotificacionLocal: (titulo, cuerpo, datos) => { locales.push({ titulo, cuerpo, datos }); } };
  }
  return cargaPrevia.call(this, peticion, ...resto);
};

const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const fb = require("firebase/firestore");
fb.setLogLevel("silent");

const DIA = 86400000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const futuro = (d = 10) => fb.Timestamp.fromMillis(Date.now() + d * DIA);
const pasado = (d = 2) => fb.Timestamp.fromMillis(Date.now() - d * DIA);
const jornada = (extra = {}) => ({
  titulo: "J", descripcion: "D", entidad: "TdeA", responsable: "B", lugar: "Bloque 1",
  fecha: futuro(), cuposTotales: 3, cuposOcupados: 0, activa: true, creadoPor: "maestroA", ...extra,
});
const accion = (tipo, jornadaId, extra = {}) => ({
  tipo, jornadaId, tituloJornada: "J", nombreUsuario: "Ana", emailUsuario: "a@x.co", ...extra,
});

let env;
let api = null;
let config, ejecutarAccion, desactivarJornadas, admin, clasificarError, iniciarSincronizadorJornadas;
let almacenamiento, adminSrv, eventos, avisosLocales;

// Rechazo por reglas (local) o por la API: "permiso denegado" o dato inválido. Nada se guarda.
const rechazo = (e) => /permission/i.test(String(e.code) + e.message) || (MODO === "api" && e.code === "invalid-argument");
const sinPermiso = (e) => admin.mensajeDeError(e).includes("No tienes permiso");

const comoUsuario = (uid) => {
  config.db = env.authenticatedContext(uid).firestore();
  config.auth.currentUser = { uid, getIdToken: async () => uid };
};
// withSecurityRulesDisabled no devuelve el resultado del callback: se captura aparte
const leerDoc = async (ruta) => {
  let doc;
  await env.withSecurityRulesDisabled(async (c) => { doc = await fb.getDoc(fb.doc(c.firestore(), ruta)); });
  return doc;
};
const leer = async (ruta) => (await leerDoc(ruta)).data();
const existe = async (ruta) => (await leerDoc(ruta)).exists();
const sembrar = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    const poner = (ruta, datos) => fb.setDoc(fb.doc(d, ruta), datos);
    await poner("users/maestroA", { rol: "maestro", nombre: "Maestro A" });
    await poner("users/maestroB", { rol: "maestro", nombre: "Maestro B" });
    await poner("users/est1", { rol: "estudiante", nombre: "Ana", email: "ana@x.co" });
    await poner("users/admin1", { rol: "administrador", nombre: "Admin" });
    await poner("users/gestorB", { rol: "gestor", nombre: "Gestor B", email: "gb@x.co" });
    await poner("users/est2", { rol: "estudiante" });
    await poner("jornadas/j1", jornada());
    await poner("jornadas/llena", jornada({ cuposTotales: 1, cuposOcupados: 1 }));
    await poner("jornadas/inactiva", jornada({ activa: false }));
    await poner("jornadas/vencida", jornada({ fecha: pasado() }));
    await poner("jornadas/legado", (({ creadoPor, ...r }) => r)(jornada()));
  });
};

const pruebas = [];
const prueba = (n, f) => pruebas.push([n, f]);

// ---------------- inscripciones (estudiante) ----------------
prueba("estudiante: inscribirse crea la inscripción (ID <uid>_<jornada>) y suma el cupo", async () => {
  comoUsuario("est1");
  assert.strictEqual(await ejecutarAccion("est1", accion("INSCRIBIR", "j1")), "completada");
  assert.ok(await existe("inscripciones/est1_j1"));
  assert.strictEqual((await leer("jornadas/j1")).cuposOcupados, 1);
});

prueba("estudiante: repetir o doble toque no duplica ni suma dos cupos", async () => {
  comoUsuario("est1");
  const r = await Promise.all([ejecutarAccion("est1", accion("INSCRIBIR", "j1")), ejecutarAccion("est1", accion("INSCRIBIR", "j1"))]);
  assert.deepStrictEqual(r.slice().sort(), ["completada", "ya-inscrito"]);
  assert.strictEqual((await leer("jornadas/j1")).cuposOcupados, 1);
  assert.strictEqual(await ejecutarAccion("est1", accion("INSCRIBIR", "j1")), "ya-inscrito");
});

prueba("estudiante: varios estudiantes se reparten los cupos sin pasarse del total", async () => {
  await env.withSecurityRulesDisabled(async (c) => fb.updateDoc(fb.doc(c.firestore(), "jornadas/j1"), { cuposTotales: 1 }));
  const resultados = [];
  for (const uid of ["est1", "est2"]) {
    comoUsuario(uid);
    resultados.push(await ejecutarAccion(uid, accion("INSCRIBIR", "j1")).catch((e) => e.codigo));
  }
  assert.deepStrictEqual(resultados, ["completada", "SIN_CUPOS"]);
  assert.strictEqual((await leer("jornadas/j1")).cuposOcupados, 1);
});

prueba("estudiante: jornada llena, desactivada, vencida o inexistente se rechaza con motivo", async () => {
  comoUsuario("est1");
  for (const [id, codigo] of [["llena", "SIN_CUPOS"], ["inactiva", "JORNADA_NO_DISPONIBLE"], ["vencida", "JORNADA_NO_DISPONIBLE"], ["noexiste", "JORNADA_NO_DISPONIBLE"]]) {
    await assert.rejects(ejecutarAccion("est1", accion("INSCRIBIR", id)), (e) => e.name === "ErrorNegocio" && e.codigo === codigo, id);
  }
  const mensajes = [];
  for (const id of ["llena", "inactiva", "vencida", "noexiste"]) {
    mensajes.push(await ejecutarAccion("est1", accion("INSCRIBIR", id)).catch((e) => e.message));
  }
  assert.deepStrictEqual(mensajes, [
    "La jornada ya no tiene cupos disponibles.", "La jornada fue desactivada.", "La jornada ya finalizó.", "La jornada ya no existe.",
  ]);
});

prueba("estudiante: cancelar borra su inscripción y libera el cupo; repetir es idempotente", async () => {
  comoUsuario("est1");
  await ejecutarAccion("est1", accion("INSCRIBIR", "j1"));
  assert.strictEqual(await ejecutarAccion("est1", accion("CANCELAR", "j1")), "completada");
  assert.ok(!(await existe("inscripciones/est1_j1")));
  assert.strictEqual((await leer("jornadas/j1")).cuposOcupados, 0);
  assert.strictEqual(await ejecutarAccion("est1", accion("CANCELAR", "j1")), "ya-cancelada");
});

prueba("estudiante: cancelar una inscripción antigua (ID aleatorio) funciona", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await fb.setDoc(fb.doc(c.firestore(), "inscripciones/aleatorio"), { userId: "est1", jornadaId: "j1", nombreUsuario: "A", emailUsuario: "a@x.co" });
    await fb.updateDoc(fb.doc(c.firestore(), "jornadas/j1"), { cuposOcupados: 1 });
  });
  comoUsuario("est1");
  assert.strictEqual(await ejecutarAccion("est1", accion("CANCELAR", "j1")), "completada");
  assert.strictEqual((await leer("jornadas/j1")).cuposOcupados, 0);
});

prueba("la inscripción anota el estado de la jornada y cancelar la inscripción lo quita", async () => {
  comoUsuario("est1");
  await ejecutarAccion("est1", accion("INSCRIBIR", "j1"));
  assert.ok((await leer("users/est1")).jornadasVistas.j1);
  await ejecutarAccion("est1", accion("CANCELAR", "j1"));
  assert.strictEqual((await leer("users/est1")).jornadasVistas?.j1, undefined);
  assert.strictEqual((await leer("users/est1")).rol, "estudiante", "el perfil no pierde su rol");
});

prueba("cuenta desactivada: no puede inscribirse (error permanente, sin reintentos)", async () => {
  await env.withSecurityRulesDisabled(async (c) => fb.updateDoc(fb.doc(c.firestore(), "users/est1"), { activo: false }));
  comoUsuario("est1");
  await assert.rejects(ejecutarAccion("est1", accion("INSCRIBIR", "j1")), (e) => clasificarError(e).tipo === "permanente");
  assert.strictEqual((await leer("jornadas/j1")).cuposOcupados, 0);
});

// ---------------- jornadas vencidas ----------------
prueba("limpieza automática: se desactivan las jornadas vencidas y las futuras no", async () => {
  comoUsuario("est1");
  await desactivarJornadas(["vencida"]);
  assert.strictEqual((await leer("jornadas/vencida")).activa, false);
  if (MODO === "local") {
    // las reglas rechazan desactivar una jornada futura
    await assert.rejects(desactivarJornadas(["j1"]), (e) => clasificarError(e).tipo === "permanente");
  } else {
    // la API ignora los ID: revisa solo las vencidas, así que una futura no se toca
    await desactivarJornadas(["j1"]);
  }
  assert.strictEqual((await leer("jornadas/j1")).activa, true);
});

// ---------------- administración de jornadas (gestor) ----------------
const datosForm = (extra = {}) => ({
  titulo: "Nueva", descripcion: "Desc", entidad: "TdeA", responsable: "Maestro A",
  lugar: "Cancha", fecha: Date.now() + 5 * DIA, duracionMin: 60, cuposTotales: 20, ...extra,
});

prueba("gestor: crea, edita, cancela, reactiva y elimina SU jornada", async () => {
  comoUsuario("maestroA");
  const ref = await admin.crearJornada("maestroA", datosForm());
  const ruta = `jornadas/${ref.id}`;
  const creada = await leer(ruta);
  assert.strictEqual(creada.creadoPor, "maestroA");
  assert.strictEqual(creada.cuposOcupados, 0);
  assert.strictEqual(creada.activa, true);
  await admin.editarJornada(ref.id, datosForm({ titulo: "Editada", lugar: "Coliseo", cuposTotales: 30 }));
  assert.strictEqual((await leer(ruta)).titulo, "Editada");
  await admin.cancelarJornada(ref.id);
  assert.strictEqual((await leer(ruta)).activa, false);
  await admin.reactivarJornada(ref.id);
  assert.strictEqual((await leer(ruta)).activa, true);
  await admin.eliminarJornada(ref.id);
  assert.ok(!(await existe(ruta)));
});

prueba("gestor: tras un error de conexión se reconoce la jornada ya guardada (no se duplica al reintentar)", async () => {
  comoUsuario("maestroA");
  const datos = datosForm({ titulo: "Se guardó" });
  const ref = await admin.crearJornada("maestroA", datos); // el primer intento sí llegó al servidor
  assert.strictEqual(await admin.buscarJornadaIgual("maestroA", datos), ref.id);
  assert.strictEqual(await admin.buscarJornadaIgual("maestroA", datosForm({ titulo: "Otra" })), null);
  assert.strictEqual(await admin.buscarJornadaIgual("maestroA", { ...datos, cuposTotales: 21 }), null);
  assert.strictEqual(await admin.buscarJornadaIgual("maestroB", datos), null, "la de otro gestor no cuenta");

  const cuantas = async (titulo) => {
    let n = 0;
    await env.withSecurityRulesDisabled(async (c) => {
      const todas = await fb.getDocs(fb.collection(c.firestore(), "jornadas"));
      n = todas.docs.filter((d) => d.data().titulo === titulo).length;
    });
    return n;
  };
  assert.strictEqual(await cuantas("Se guardó"), 1);

  // Con la API, repetir la creación con la misma clave devuelve la misma jornada
  if (MODO === "api") {
    const clave = "clave-de-prueba-123";
    const a = await admin.crearJornada("maestroA", datosForm({ titulo: "Con clave" }), clave);
    const b = await admin.crearJornada("maestroA", datosForm({ titulo: "Con clave" }), clave);
    assert.strictEqual(b.id, a.id);
    assert.strictEqual(await cuantas("Con clave"), 1);
  }
});

prueba("gestor: NO puede crear a nombre de otro, con espacio inválido ni con fecha pasada", async () => {
  comoUsuario("maestroA");
  await assert.rejects(admin.crearJornada("maestroB", datosForm()), rechazo);
  await assert.rejects(admin.crearJornada("maestroA", datosForm({ lugar: "Cafetería" })), rechazo);
  await assert.rejects(admin.crearJornada("maestroA", datosForm({ fecha: Date.now() - DIA })), rechazo);
  let cantidad = 0;
  await env.withSecurityRulesDisabled(async (c) => { cantidad = (await fb.getDocs(fb.collection(c.firestore(), "jornadas"))).size; });
  assert.strictEqual(cantidad, 5, "no se creó ninguna jornada");
});

prueba("gestor: NO administra jornadas ajenas ni anteriores a los roles", async () => {
  await env.withSecurityRulesDisabled(async (c) => fb.setDoc(fb.doc(c.firestore(), "jornadas/deB"), jornada({ creadoPor: "maestroB" })));
  comoUsuario("maestroA");
  for (const id of ["deB", "legado"]) {
    await assert.rejects(admin.editarJornada(id, datosForm()), sinPermiso, id);
    await assert.rejects(admin.cancelarJornada(id), sinPermiso, id);
    await assert.rejects(admin.eliminarJornada(id), sinPermiso, id);
    await assert.rejects(admin.obtenerInscritos(id), sinPermiso, id);
    assert.ok(await existe(`jornadas/${id}`));
  }
  assert.strictEqual((await leer("jornadas/deB")).activa, true);
});

prueba("gestor: lee los inscritos de su jornada para la planilla (datos completos)", async () => {
  comoUsuario("est1");
  await ejecutarAccion("est1", accion("INSCRIBIR", "j1", { nombreUsuario: "Ana Gómez", emailUsuario: "ana@x.co" }));
  comoUsuario("est2");
  await ejecutarAccion("est2", accion("INSCRIBIR", "j1", { nombreUsuario: "Beto", emailUsuario: "beto@x.co" }));
  comoUsuario("maestroA");
  const inscritos = await admin.obtenerInscritos("j1");
  assert.deepStrictEqual(inscritos.map((i) => i.emailUsuario).sort(), ["ana@x.co", "beto@x.co"]);
  assert.ok(inscritos.every((i) => typeof i.inscritoEn === "number" && i.asistio === false));
  assert.deepStrictEqual(Object.keys(inscritos[0]).sort(), ["asistio", "emailUsuario", "id", "inscritoEn", "metodoAsistencia", "nombreUsuario", "userId"]);
  comoUsuario("maestroB");
  await assert.rejects(admin.obtenerInscritos("j1"), sinPermiso);
  comoUsuario("est1");
  await assert.rejects(admin.obtenerInscritos("j1"), sinPermiso);
});

prueba("un estudiante no puede usar los servicios de administración", async () => {
  comoUsuario("est1");
  await assert.rejects(admin.crearJornada("est1", datosForm()), rechazo);
  await assert.rejects(admin.cancelarJornada("j1"), rechazo);
  await assert.rejects(admin.eliminarJornada("j1"), rechazo);
  assert.strictEqual((await leer("jornadas/j1")).activa, true);
});

// ---------------- avisos de cambios (punta a punta) ----------------
const notificacionesDe = async (uid) => {
  let docs = [];
  await env.withSecurityRulesDisabled(async (c) => {
    const r = await fb.getDocs(fb.query(fb.collection(c.firestore(), "notificaciones"), fb.where("userId", "==", uid)));
    docs = r.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return docs;
};
const esperarNotificaciones = async (uid, cantidad, ms = 8000) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const n = await notificacionesDe(uid);
    if (n.length >= cantidad) return n;
    await sleep(100);
  }
  return notificacionesDe(uid);
};
// "Abrir la app" como `uid`. Local: el dispositivo detecta los cambios y crea los avisos.
// API: los avisos ya los creó el servidor; el dispositivo solo los muestra como aviso local.
const abrirApp = async (uid) => {
  comoUsuario(uid);
  if (MODO === "api") {
    const lista = (await notificacionesDe(uid)).map((n) => ({ ...n, creadaEn: n.creadaEn?.toMillis?.() ?? Date.now() }));
    await avisosLocales.avisarNuevasNotificaciones(uid, lista);
    return () => {};
  }
  return iniciarSincronizadorJornadas(uid);
};
const gestorCreaJornada = async (extra = {}) => {
  comoUsuario("maestroA");
  const ref = await admin.crearJornada("maestroA", datosForm({ titulo: "Jornada del maestro", ...extra }));
  return ref.id;
};

prueba("PUNTA A PUNTA (escenario reportado): el alumno se inscribe, cierra sesión, el gestor cancela y al volver el alumno recibe la cancelación", async () => {
  const id = await gestorCreaJornada();
  comoUsuario("est1");
  await ejecutarAccion("est1", accion("INSCRIBIR", id, { tituloJornada: "Jornada del maestro" }));
  const perfil = await leer("users/est1");
  assert.strictEqual(perfil.jornadasVistas[id].activa, true);
  assert.strictEqual(perfil.jornadasVistas[id].titulo, "Jornada del maestro");

  // el alumno cerró sesión (no queda ningún dato local suyo)
  await almacenamiento.borrarDatosUsuario("est1"); almacenamiento.habilitarUsuario("est1");

  comoUsuario("maestroA");
  await admin.cancelarJornada(id);

  locales.length = 0;
  const detener = await abrirApp("est1");
  const avisos = await esperarNotificaciones("est1", 1);
  detener();
  assert.strictEqual(avisos.length, 1, JSON.stringify(avisos.map((a) => a.tipo)));
  assert.strictEqual(avisos[0].tipo, "cancelacion");
  assert.strictEqual(avisos[0].jornadaId, id);
  assert.strictEqual(avisos[0].leida, false);
  assert.strictEqual(avisos[0].titulo, "Jornada cancelada: Jornada del maestro");
  assert.strictEqual(avisos[0].mensaje, 'La jornada "Jornada del maestro" ha sido cancelada por el organizador.');
  assert.strictEqual(locales.length, 1, "el dispositivo muestra el aviso local");
  assert.strictEqual((await leer("users/est1")).jornadasVistas[id].activa, false, "el estado anotado se actualiza");
});

prueba("PUNTA A PUNTA: reprogramación, actualización, reactivación y eliminación también llegan al alumno", async () => {
  const id = await gestorCreaJornada();
  comoUsuario("est1");
  await ejecutarAccion("est1", accion("INSCRIBIR", id, { tituloJornada: "Jornada del maestro" }));
  await almacenamiento.borrarDatosUsuario("est1"); almacenamiento.habilitarUsuario("est1");

  // La fecha nueva es fija: si cambiara entre ediciones se detectaría otra reprogramación
  const nuevaFecha = Date.now() + 8 * DIA;
  const nuevosDatos = (extra) => datosForm({ titulo: "Jornada del maestro", fecha: Date.now() + 5 * DIA, ...extra });
  comoUsuario("maestroA");
  await admin.editarJornada(id, nuevosDatos({ fecha: nuevaFecha }));                 // reprogramación
  const detener1 = await abrirApp("est1");
  let avisos = await esperarNotificaciones("est1", 1);
  detener1();
  assert.deepStrictEqual(avisos.map((a) => a.tipo), ["reprogramacion"]);

  comoUsuario("maestroA");
  await admin.editarJornada(id, nuevosDatos({ fecha: nuevaFecha, lugar: "Coliseo" }));            // actualización
  await admin.cancelarJornada(id);                                                                 // cancelación
  await admin.reactivarJornada(id);                                                                // reactivación
  const detener2 = await abrirApp("est1");
  await esperarNotificaciones("est1", 2);
  await sleep(300);
  avisos = await notificacionesDe("est1");
  detener2();
  assert.ok(avisos.map((a) => a.tipo).includes("actualizacion"), JSON.stringify(avisos.map((a) => a.tipo)));

  comoUsuario("maestroA");
  await admin.eliminarJornada(id);                                                                 // eliminación
  const detener3 = await abrirApp("est1");
  const hasta = Date.now() + 8000;
  while (Date.now() < hasta && !(await notificacionesDe("est1")).some((a) => a.tipo === "eliminacion")) await sleep(100);
  detener3();
  const tiposFinales = (await notificacionesDe("est1")).map((a) => a.tipo);
  assert.ok(tiposFinales.includes("eliminacion"), JSON.stringify(tiposFinales));
});

prueba("sin inscripción no llega ningún aviso (un alumno ajeno no recibe nada)", async () => {
  const id = await gestorCreaJornada();
  comoUsuario("est1");
  await ejecutarAccion("est1", accion("INSCRIBIR", id));
  comoUsuario("maestroA");
  await admin.cancelarJornada(id);
  const detener = await abrirApp("est2");
  await sleep(1200);
  detener();
  assert.strictEqual((await notificacionesDe("est2")).length, 0);
});

prueba("notificaciones del usuario: marcar leída, marcar todas y eliminar (solo las suyas)", async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    for (const id of ["n1", "n2"]) await fb.setDoc(fb.doc(d, `notificaciones/${id}`), { userId: "est1", leida: false, titulo: id });
    await fb.setDoc(fb.doc(d, "notificaciones/ajena"), { userId: "est2", leida: false, titulo: "ajena" });
  });
  comoUsuario("est1");
  await eventos.marcarNotificacionLeida("n1");
  assert.strictEqual((await leer("notificaciones/n1")).leida, true);
  assert.ok((await leer("notificaciones/n1")).leidaEn);
  await eventos.marcarTodasNotificacionesLeidas([{ id: "n1", leida: true }, { id: "n2", leida: false }]);
  assert.strictEqual((await leer("notificaciones/n2")).leida, true);
  await assert.rejects(eventos.marcarNotificacionLeida("ajena"), rechazo);
  await assert.rejects(eventos.eliminarNotificacion("ajena"), rechazo);
  assert.strictEqual((await leer("notificaciones/ajena")).leida, false);
  await eventos.eliminarNotificacion("n1");
  assert.ok(!(await existe("notificaciones/n1")));
});

// ---------------- administración de cuentas (administrador) ----------------
const actor = (uid, nombre = "Admin") => ({ uid, nombre });
const registrosAuditoria = async () => {
  let docs = [];
  await env.withSecurityRulesDisabled(async (c) => { docs = (await fb.getDocs(fb.collection(c.firestore(), "auditoria"))).docs.map((d) => d.data()); });
  return docs;
};

prueba("administrador: cambia el rol y desactiva cuentas, y queda en la auditoría (una sola operación)", async () => {
  comoUsuario("admin1");
  await adminSrv.actualizarUsuario(actor("admin1"), { id: "est1", email: "ana@x.co", nombre: "Ana", rol: "estudiante" }, { rol: "gestor" });
  assert.strictEqual((await leer("users/est1")).rol, "gestor");
  await adminSrv.actualizarUsuario(actor("admin1"), { id: "est1", email: "ana@x.co", nombre: "Ana", rol: "gestor" }, { activo: false });
  assert.strictEqual((await leer("users/est1")).activo, false);
  const auditoria = await registrosAuditoria();
  assert.deepStrictEqual(auditoria.map((a) => a.accion).sort(), ["usuario.estado", "usuario.rol"]);
  assert.ok(auditoria.every((a) => a.actorId === "admin1" && a.creadaEn));
});

prueba("administrador: no puede cambiarse su propio rol y, al fallar, no queda auditoría falsa", async () => {
  comoUsuario("admin1");
  await assert.rejects(
    adminSrv.actualizarUsuario(actor("admin1"), { id: "admin1", email: "a@x.co", rol: "administrador" }, { rol: "estudiante" }),
    (e) => adminSrv.mensajeErrorAdmin(e).includes("No tienes permiso")
  );
  assert.strictEqual((await leer("users/admin1")).rol, "administrador");
  assert.strictEqual((await registrosAuditoria()).length, 0, "la operación atómica no deja rastro si falla");
});

prueba("gestor y estudiante no pueden administrar cuentas", async () => {
  for (const uid of ["maestroA", "est1"]) {
    comoUsuario(uid);
    await assert.rejects(
      adminSrv.actualizarUsuario(actor(uid), { id: "est2", rol: "estudiante" }, { rol: "administrador" }),
      (e) => adminSrv.mensajeErrorAdmin(e).includes("No tienes permiso"), uid
    );
    if (MODO === "local") {
      // la escritura directa en la auditoría solo existe en el modo local (con la API la hace el servidor)
      await assert.rejects(adminSrv.registrarAuditoria(actor(uid), { accion: "x", entidad: "y", entidadId: "z" }), (e) => /permission/i.test(e.code + e.message), uid);
    }
  }
  assert.strictEqual((await leer("users/est2")).rol, "estudiante");
});

prueba("administrador: crea una jornada para un gestor, la edita, la reasigna, la cancela y la elimina", async () => {
  comoUsuario("admin1");
  const datos = { titulo: "Del admin", descripcion: "Desc", entidad: "TdeA", responsable: "Admin", lugar: "Coliseo", fecha: Date.now() + 5 * DIA, duracionMin: 60, cuposTotales: 15 };
  const ref = await admin.crearJornada("gestorB", datos);
  assert.strictEqual((await leer(`jornadas/${ref.id}`)).creadoPor, "gestorB");
  await admin.editarJornada(ref.id, { ...datos, titulo: "Editada por el admin" }, "gestorB");
  await admin.editarJornada(ref.id, datos, "maestroA");            // reasigna a otro gestor
  assert.strictEqual((await leer(`jornadas/${ref.id}`)).creadoPor, "maestroA");
  await admin.cancelarJornada(ref.id);
  await admin.reactivarJornada(ref.id);
  await admin.editarJornada("legado", datos, "gestorB");           // una anterior a los roles también
  assert.strictEqual((await leer("jornadas/legado")).creadoPor, "gestorB");
  await admin.eliminarJornada(ref.id);
  assert.ok(!(await existe(`jornadas/${ref.id}`)));
  await assert.rejects(admin.editarJornada("j1", datos, "est2"), rechazo);   // no se asigna a un estudiante
  // las acciones del administrador quedan auditadas (antes las registraba la pantalla)
  if (MODO === "api") {
    const acciones = (await registrosAuditoria()).map((a) => a.accion).sort();
    assert.deepStrictEqual(acciones, [
      "jornada.cancelar", "jornada.crear", "jornada.editar", "jornada.eliminar", "jornada.reactivar", "jornada.reasignar", "jornada.reasignar",
    ]);
  }
});

prueba("administrador: lee todos los inscritos de cualquier jornada", async () => {
  comoUsuario("est1");
  await ejecutarAccion("est1", accion("INSCRIBIR", "j1", { nombreUsuario: "Ana", emailUsuario: "ana@x.co" }));
  comoUsuario("admin1");
  const inscritos = await admin.obtenerInscritos("j1");
  assert.deepStrictEqual(inscritos.map((i) => i.emailUsuario), ["ana@x.co"]);
});

(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-jornadaviva",
    firestore: { rules: fs.readFileSync(path.join(RAIZ, "firestore.rules"), "utf8") },
  });

  if (MODO === "api") {
    const entorno = await import(pathToFileURL(path.join(RAIZ, "api", "tests", "integracion", "entorno.mjs")).href);
    api = await entorno.iniciarApi({ ahora: Date.now });
    process.env.EXPO_PUBLIC_API_URL = api.base;
  }

  config = require(path.join(CONSTRUIDO, "firebaseConfig.js"));
  ({ ejecutarAccion } = require(path.join(CONSTRUIDO, "src/services/inscripcionService.js")));
  ({ desactivarJornadas } = require(path.join(CONSTRUIDO, "src/services/jornadaEstadoService.js")));
  admin = require(path.join(CONSTRUIDO, "src/services/jornadaAdminService.js"));
  ({ clasificarError } = require(path.join(CONSTRUIDO, "src/utils/sincronizacion.js")));
  eventos = require(path.join(CONSTRUIDO, "src/services/jornadaEventService.js"));
  ({ iniciarSincronizadorJornadas } = eventos);
  almacenamiento = require(path.join(CONSTRUIDO, "src/services/localStore.js"));
  adminSrv = require(path.join(CONSTRUIDO, "src/services/adminService.js"));
  avisosLocales = require(path.join(CONSTRUIDO, "src/services/avisosLocales.js"));
  const { usaApi } = require(path.join(CONSTRUIDO, "src/config/api.js"));
  assert.strictEqual(usaApi("inscripciones"), MODO === "api", "el modo de la app coincide con el de la prueba");
  ["est1", "est2", "maestroA", "maestroB", "admin1"].forEach((u) => almacenamiento.habilitarUsuario(u));

  let fallos = 0;
  for (const [nombre, fn] of pruebas) {
    await sembrar();
    memoria.clear();
    locales.length = 0;
    ["est1", "est2", "maestroA", "maestroB", "admin1"].forEach((u) => almacenamiento.habilitarUsuario(u));
    try { await fn(); console.log("  ✔", nombre); }
    catch (e) { fallos += 1; console.log("  ✘", nombre, "\n     ", e && e.message); }
  }
  console.log(`\n[${MODO}] ${pruebas.length - fallos}/${pruebas.length} pruebas de equivalencia OK`);
  if (api) await api.cerrar();
  await env.cleanup();
  process.exit(fallos ? 1 : 0);
})();
