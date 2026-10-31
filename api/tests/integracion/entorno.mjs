// Entorno de las pruebas de integración: la API REAL (Express + servicios + Admin SDK) contra los
// emuladores de Firestore y Auth. Se ejecuta con `npm run test:api` desde la raíz del proyecto.
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { crearApp } from "../../src/app.js";

export const PROYECTO = "demo-jornadaviva";
export const DIA = 24 * 60 * 60 * 1000;
export const MINUTO = 60 * 1000;
export const SECRETO_ASISTENCIA = "secreto-solo-para-pruebas";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Estas pruebas solo corren contra el emulador (npm run test:api).");
}

const app = getApps()[0] ?? initializeApp({ projectId: PROYECTO });
export const db = getFirestore(app);
export const auth = getAuth(app);
export { FieldValue, Timestamp };

// Reloj controlable: las pruebas fijan "ahora" sin depender de la hora real
export const reloj = { ahora: Date.now() };

const silencioso = { error() {}, log() {}, warn() {} };
export const registroErrores = [];

// Token de prueba = uid (la verificación real del token se prueba aparte, con el emulador de Auth)
export const verificarToken = async (token) => {
  if (!token || token === "invalido") throw new Error("token inválido");
  return { uid: token, email: `${token}@x.co` };
};

export async function iniciarApi(opciones = {}) {
  const express = crearApp({
    db,
    auth,
    verificarToken: opciones.verificarToken ?? verificarToken,
    ahora: opciones.ahora ?? (() => reloj.ahora),
    registro: { ...silencioso, error: (...a) => registroErrores.push(a) },
    origenesCors: opciones.origenesCors,
    secretoAsistencia: SECRETO_ASISTENCIA,
    cancelacionAntiguedadMaxMs: opciones.cancelacionAntiguedadMaxMs,
    asistenciaAntiguedadMaxMs: opciones.asistenciaAntiguedadMaxMs,
  });
  const servidor = await new Promise((resolver) => {
    const s = express.listen(0, "127.0.0.1", () => resolver(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  // Llama a la API como el usuario `uid` (null = sin token)
  async function llamar(uid, metodo, ruta, cuerpo) {
    const respuesta = await fetch(base + ruta, {
      method: metodo,
      headers: {
        ...(uid ? { Authorization: `Bearer ${uid}` } : {}),
        ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await respuesta.text();
    let datos = texto;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      /* CSV u otro texto */
    }
    return { estado: respuesta.status, cuerpo: datos, cabeceras: respuesta.headers };
  }

  return { base, llamar, cerrar: () => new Promise((r) => servidor.close(r)) };
}

// Borra todos los datos de Firestore y de Auth del emulador
export async function limpiar() {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/accounts`,
      { method: "DELETE" }
    );
  }
  registroErrores.length = 0;
  reloj.ahora = Date.now();
}

export const sembrar = (ruta, datos) => db.doc(ruta).set(datos);
export const leer = async (ruta) => {
  const snap = await db.doc(ruta).get();
  return snap.exists ? snap.data() : null;
};
export const existe = async (ruta) => (await db.doc(ruta).get()).exists;
export const coleccion = async (nombre) =>
  (await db.collection(nombre).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

// ---- Datos de prueba ----
export const perfiles = {
  est1: { uid: "est1", nombre: "Ana", email: "ana@x.co", rol: "estudiante" },
  est2: { uid: "est2", nombre: "Beto", email: "beto@x.co", rol: "estudiante" },
  gestorA: { uid: "gestorA", nombre: "Gestor A", email: "ga@x.co", rol: "gestor" },
  gestorB: { uid: "gestorB", nombre: "Gestor B", email: "gb@x.co", rol: "gestor" },
  maestroViejo: { uid: "maestroViejo", nombre: "Maestro", email: "mv@x.co", rol: "maestro" },
  admin1: { uid: "admin1", nombre: "Admin", email: "admin@x.co", rol: "administrador" },
  admin2: { uid: "admin2", nombre: "Admin 2", email: "admin2@x.co", rol: "administrador" },
};

export async function sembrarPerfiles() {
  for (const [id, perfil] of Object.entries(perfiles)) await sembrar(`users/${id}`, perfil);
}

// Datos válidos de una jornada para el cuerpo de las solicitudes (fecha en ms)
export const cuerpoJornada = (extra = {}) => ({
  titulo: "Jornada de salud",
  descripcion: "Chequeos médicos gratuitos",
  entidad: "TdeA",
  responsable: "Gestor A",
  lugar: "Coliseo",
  fecha: reloj.ahora + 5 * DIA,
  cuposTotales: 10,
  ...extra,
});

// Documento de Firestore de una jornada
export const docJornada = (extra = {}) => ({
  titulo: "Jornada de salud",
  descripcion: "Chequeos médicos gratuitos",
  entidad: "TdeA",
  responsable: "Gestor A",
  lugar: "Coliseo",
  fecha: Timestamp.fromMillis(reloj.ahora + 5 * DIA),
  cuposTotales: 10,
  cuposOcupados: 0,
  activa: true,
  creadoPor: "gestorA",
  ...extra,
});
