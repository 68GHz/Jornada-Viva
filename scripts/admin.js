#!/usr/bin/env node
/* eslint-disable no-console */
// Administración de roles y de la migración a roles, FUERA de la app.
//
//   node scripts/admin.js crear-maestro <correo> <contraseña> [nombre...] [--aplicar]
//   node scripts/admin.js rol <correo> <maestro|estudiante> [--aplicar]
//   node scripts/admin.js maestros
//   node scripts/admin.js migrar [--aplicar]
//   node scripts/admin.js propietario <jornadaId|--huerfanas> <correo> [--aplicar]
//
// Sin --aplicar solo muestra lo que haría (simulación). No necesita dependencias:
// usa la API REST de Firestore con tu sesión de Google Cloud:
//   gcloud auth login            (con una cuenta que administre el proyecto)
// o bien la variable GOOGLE_OAUTH_ACCESS_TOKEN con un token de acceso.
// Proyecto: --proyecto <id>, FIREBASE_PROJECT_ID o EXPO_PUBLIC_FIREBASE_PROJECT_ID (.env).
//
// Qué hace cada comando:
//  - crear-maestro: crea la cuenta de acceso (correo y contraseña) y su perfil con rol
//                 maestro. Si el correo ya está registrado, solo le asigna el rol.
//  - rol:         cambia users/{uid}.rol. Es la ÚNICA forma de crear maestros: las reglas
//                 de Firestore impiden que un usuario se asigne el rol desde la app.
//  - maestros:    lista los usuarios con rol maestro.
//  - migrar:      migración compatible hacia atrás. Agrega rol "estudiante" a los usuarios
//                 que no lo tienen (la app ya los trata como estudiantes, así que es
//                 opcional) y lista las jornadas sin propietario (`creadoPor`).
//  - propietario: asigna un maestro como propietario de jornadas anteriores a los roles.
//                 Sin propietario, ningún maestro puede administrarlas.

const { execSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROLES = ["maestro", "estudiante"];

function leerArgs(argv) {
  const posicionales = [];
  const opciones = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--aplicar" || a === "--huerfanas") opciones[a.slice(2)] = true;
    else if (a === "--proyecto") opciones.proyecto = argv[(i += 1)];
    else posicionales.push(a);
  }
  return { posicionales, opciones };
}

function proyectoDe(opciones) {
  if (opciones.proyecto) return opciones.proyecto;
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
  if (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) return process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const env = join(__dirname, "..", ".env");
  if (existsSync(env)) {
    const m = /^EXPO_PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m.exec(readFileSync(env, "utf8"));
    if (m) return m[1].trim();
  }
  throw new Error("Indica el proyecto con --proyecto <id> o define EXPO_PUBLIC_FIREBASE_PROJECT_ID en .env");
}

function claveWeb() {
  if (process.env.EXPO_PUBLIC_FIREBASE_API_KEY) return process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const env = join(__dirname, "..", ".env");
  if (existsSync(env)) {
    const m = /^EXPO_PUBLIC_FIREBASE_API_KEY=(.+)$/m.exec(readFileSync(env, "utf8"));
    if (m) return m[1].trim();
  }
  throw new Error("Falta EXPO_PUBLIC_FIREBASE_API_KEY (en .env) para crear la cuenta de acceso.");
}

// API de autenticación de Firebase (la misma que usa la app al registrarse)
async function auth(accion, cuerpo) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${accion}?key=${claveWeb()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json();
  if (!r.ok) {
    const e = new Error(datos.error?.message || `Error ${r.status}`);
    e.codigo = datos.error?.message;
    throw e;
  }
  return datos;
}

function token() {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  try {
    return execSync("gcloud auth print-access-token", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    throw new Error("No se pudo obtener un token. Ejecuta `gcloud auth login` o define GOOGLE_OAUTH_ACCESS_TOKEN.");
  }
}

function cliente(proyecto) {
  const acceso = token();
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(proyecto)}/databases/(default)/documents`;
  async function api(url, { method = "GET", body } = {}) {
    const respuesta = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${acceso}`,
        "Content-Type": "application/json",
        "x-goog-user-project": proyecto,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const texto = await respuesta.text();
    if (!respuesta.ok) throw new Error(`Firestore respondió ${respuesta.status}: ${texto.slice(0, 300)}`);
    return texto ? JSON.parse(texto) : {};
  }

  const idDe = (doc) => doc.name.split("/").pop();
  const campo = (doc, nombre) => {
    const v = doc.fields?.[nombre];
    return v ? v.stringValue ?? v.integerValue ?? v.booleanValue ?? v.timestampValue ?? null : null;
  };

  // Todos los documentos de una colección (con paginación)
  async function listar(coleccion) {
    const docs = [];
    let pagina;
    do {
      const q = new URLSearchParams({ pageSize: "300" });
      if (pagina) q.set("pageToken", pagina);
      const r = await api(`${base}/${coleccion}?${q}`);
      docs.push(...(r.documents || []));
      pagina = r.nextPageToken;
    } while (pagina);
    return docs;
  }

  // Cambia solo algunos campos de texto de un documento existente
  const actualizar = (ruta, campos) => {
    const mascara = Object.keys(campos).map((c) => `updateMask.fieldPaths=${encodeURIComponent(c)}`);
    const fields = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, { stringValue: v }]));
    return api(`${base}/${ruta}?${mascara.join("&")}&currentDocument.exists=true`, {
      method: "PATCH",
      body: { fields },
    });
  };

  // Crea (o reemplaza los campos indicados de) un documento; no exige que exista
  const guardar = (ruta, campos) => {
    const mascara = Object.keys(campos).map((c) => `updateMask.fieldPaths=${encodeURIComponent(c)}`);
    const fields = Object.fromEntries(
      Object.entries(campos).map(([k, v]) => [
        k,
        v instanceof Date ? { timestampValue: v.toISOString() } : { stringValue: v },
      ])
    );
    return api(`${base}/${ruta}?${mascara.join("&")}`, { method: "PATCH", body: { fields } });
  };

  // Usuario por correo (el perfil guarda el correo con el que se registró)
  async function usuarioPorCorreo(correo) {
    const candidatos = [...new Set([correo.trim(), correo.trim().toLowerCase()])];
    for (const valor of candidatos) {
      const r = await api(`${base}:runQuery`, {
        method: "POST",
        body: {
          structuredQuery: {
            from: [{ collectionId: "users" }],
            where: { fieldFilter: { field: { fieldPath: "email" }, op: "EQUAL", value: { stringValue: valor } } },
            limit: 2,
          },
        },
      });
      const docs = r.filter((x) => x.document).map((x) => x.document);
      if (docs.length > 1) throw new Error(`Hay más de un usuario con el correo ${valor}.`);
      if (docs.length === 1) return docs[0];
    }
    throw new Error(`No existe un usuario registrado con el correo ${correo}.`);
  }

  return { listar, actualizar, guardar, usuarioPorCorreo, idDe, campo };
}

const mensajeModo = (aplicar) => (aplicar ? "" : "  (simulación: agrega --aplicar para ejecutarlo)");

const comandos = {
  async "crear-maestro"(c, [correo, clave, ...partesNombre], { aplicar }) {
    if (!correo || !clave) throw new Error("Uso: crear-maestro <correo> <contraseña> [nombre...] [--aplicar]");
    if (clave.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
    const nombre = partesNombre.join(" ").trim() || correo.split("@")[0];
    console.log(`Cuenta de maestro: ${correo} (${nombre})${mensajeModo(aplicar)}`);
    if (!aplicar) return;

    let uid;
    try {
      const nueva = await auth("signUp", { email: correo, password: clave, returnSecureToken: true });
      uid = nueva.localId;
      await auth("update", { idToken: nueva.idToken, displayName: nombre, returnSecureToken: false });
      console.log(`Cuenta de acceso creada (uid ${uid}).`);
    } catch (error) {
      if (error.codigo !== "EMAIL_EXISTS") throw error;
      // Ya tenía cuenta: se conserva su contraseña y solo se le asigna el rol
      uid = c.idDe(await c.usuarioPorCorreo(correo));
      console.log(`El correo ya estaba registrado (uid ${uid}): se conserva su contraseña y solo se asigna el rol.`);
    }

    await c.guardar(`users/${uid}`, { uid, nombre, email: correo, rol: "maestro", creadoEn: new Date() });
    console.log("Perfil guardado con rol maestro. Ya puede iniciar sesión en la app.");
  },

  async rol(c, [correo, rol], { aplicar }) {
    if (!correo || !ROLES.includes(rol)) throw new Error("Uso: rol <correo> <maestro|estudiante> [--aplicar]");
    const usuario = await c.usuarioPorCorreo(correo);
    const uid = c.idDe(usuario);
    const actual = c.campo(usuario, "rol") || "(sin rol = estudiante)";
    console.log(`Usuario ${uid} (${c.campo(usuario, "nombre") || "sin nombre"}): ${actual} -> ${rol}${mensajeModo(aplicar)}`);
    if (aplicar) {
      await c.actualizar(`users/${uid}`, { rol });
      console.log("Listo. El cambio se aplica en la app sin reiniciar.");
    }
  },

  async maestros(c) {
    const usuarios = (await c.listar("users")).filter((u) => c.campo(u, "rol") === "maestro");
    console.log(`Maestros (${usuarios.length}):`);
    usuarios.forEach((u) => console.log(`  - ${c.idDe(u)}  ${c.campo(u, "nombre") || ""}  ${c.campo(u, "email") || ""}`));
  },

  async migrar(c, _args, { aplicar }) {
    const usuarios = await c.listar("users");
    const sinRol = usuarios.filter((u) => !c.campo(u, "rol"));
    console.log(`Usuarios: ${usuarios.length}. Sin rol: ${sinRol.length}${mensajeModo(aplicar)}`);
    if (aplicar) {
      for (const u of sinRol) await c.actualizar(`users/${c.idDe(u)}`, { rol: "estudiante" });
      if (sinRol.length) console.log(`Se asignó el rol "estudiante" a ${sinRol.length} usuarios.`);
    }

    const jornadas = await c.listar("jornadas");
    const huerfanas = jornadas.filter((j) => !c.campo(j, "creadoPor"));
    console.log(`\nJornadas: ${jornadas.length}. Sin propietario (anteriores a los roles): ${huerfanas.length}`);
    huerfanas.forEach((j) => console.log(`  - ${c.idDe(j)}  ${c.campo(j, "titulo") || ""}`));
    if (huerfanas.length) {
      console.log("Ningún maestro puede administrarlas hasta asignarles propietario:");
      console.log("  node scripts/admin.js propietario --huerfanas <correo-del-maestro> --aplicar");
    }
  },

  async propietario(c, [destino, correo], { aplicar, huerfanas }) {
    const todas = huerfanas || destino === "--huerfanas";
    const jornadaId = todas ? null : destino;
    const correoMaestro = todas && huerfanas ? destino : correo;
    if ((!todas && !jornadaId) || !correoMaestro) {
      throw new Error("Uso: propietario <jornadaId|--huerfanas> <correo> [--aplicar]");
    }

    const maestro = await c.usuarioPorCorreo(correoMaestro);
    if (c.campo(maestro, "rol") !== "maestro") {
      throw new Error(`${correoMaestro} no tiene el rol maestro. Asígnalo primero con: rol ${correoMaestro} maestro --aplicar`);
    }
    const uid = c.idDe(maestro);

    const jornadas = await c.listar("jornadas");
    const objetivo = jornadas.filter(
      (j) => !c.campo(j, "creadoPor") && (todas || c.idDe(j) === jornadaId)
    );
    if (!todas && objetivo.length === 0) {
      throw new Error("La jornada no existe o ya tiene propietario (no se sobrescribe).");
    }
    console.log(`Se asignará como propietario a ${uid} en ${objetivo.length} jornada(s)${mensajeModo(aplicar)}`);
    objetivo.forEach((j) => console.log(`  - ${c.idDe(j)}  ${c.campo(j, "titulo") || ""}`));
    if (aplicar) {
      for (const j of objetivo) await c.actualizar(`jornadas/${c.idDe(j)}`, { creadoPor: uid });
      console.log("Listo.");
    }
  },
};

async function principal() {
  const { posicionales, opciones } = leerArgs(process.argv.slice(2));
  const [nombre, ...resto] = posicionales;
  if (!comandos[nombre]) {
    console.log("Comandos: crear-maestro, rol, maestros, migrar, propietario. Consulta el encabezado de scripts/admin.js.");
    process.exitCode = nombre ? 1 : 0;
    return;
  }
  const proyecto = proyectoDe(opciones);
  console.log(`Proyecto: ${proyecto}`);
  await comandos[nombre](cliente(proyecto), resto, opciones);
}

principal().catch((error) => {
  console.error("Error:", error.message);
  process.exitCode = 1;
});
