import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db, firebaseConfig } from "../../firebaseConfig";
import { usaApi } from "../config/api";
import { llamarApi } from "./apiClient";
import { conTiempoLimite, mensajeDeRed } from "../utils/sincronizacion";
import { ETIQUETA_ROL } from "../utils/roles";

// Operaciones del módulo de administración. Solo funcionan con conexión y
// firestore.rules las valida en el servidor: únicamente un administrador activo puede
// crear cuentas, cambiar roles, activar o desactivar cuentas, reasignar jornadas y
// escribir en la auditoría; ninguno puede modificar su propio rol ni estado.
const ESPERA_MS = 20000;

// Registro de auditoría (inmutable). `actor`: { uid, nombre }
export const registrarAuditoria = (actor, { accion, entidad, entidadId, detalle }) =>
  addDoc(collection(db, "auditoria"), {
    accion,
    entidad,
    entidadId: String(entidadId),
    ...(detalle ? { detalle: String(detalle).slice(0, 500) } : {}),
    actorId: actor.uid,
    actorNombre: actor.nombre || "",
    creadaEn: serverTimestamp(),
  });

// La auditoría no debe impedir una acción ya realizada: si falla solo se avisa en consola
export const auditar = (actor, datos) => {
  // Con la API, el servidor audita estas acciones en la misma operación que las ejecuta
  const modulo = datos.entidad === "jornada" ? "jornadas" : datos.entidad === "reporte" ? "reportes" : null;
  if (modulo && usaApi(modulo)) return Promise.resolve();
  return registrarAuditoria(actor, datos).catch((e) => console.warn("No se pudo registrar la auditoría:", e));
};

// Segunda instancia de autenticación: crear una cuenta no debe cerrar la sesión del administrador
function autenticacionSecundaria() {
  const app = getApps().some((a) => a.name === "secundaria")
    ? getApp("secundaria")
    : initializeApp(firebaseConfig, "secundaria");
  try {
    return initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    return getAuth(app);
  }
}

// Crea la cuenta de acceso y su perfil con el rol indicado
export async function crearUsuario(actor, { nombre, correo, clave, rol }) {
  if (usaApi("usuarios")) {
    return (await llamarApi("POST", "/v1/usuarios", { cuerpo: { nombre, correo, clave, rol }, espera: ESPERA_MS })).id;
  }
  const secundaria = autenticacionSecundaria();
  const credencial = await conTiempoLimite(
    createUserWithEmailAndPassword(secundaria, correo, clave),
    ESPERA_MS
  );
  const uid = credencial.user.uid;
  try {
    await updateProfile(credencial.user, { displayName: nombre });
  } finally {
    await signOut(secundaria).catch(() => {});
  }

  const lote = writeBatch(db);
  lote.set(doc(db, "users", uid), {
    uid,
    nombre,
    email: correo,
    rol,
    activo: true,
    creadoEn: serverTimestamp(),
  });
  lote.set(doc(collection(db, "auditoria")), {
    accion: "usuario.crear",
    entidad: "usuario",
    entidadId: uid,
    detalle: `${correo} · ${ETIQUETA_ROL[rol]}`,
    actorId: actor.uid,
    actorNombre: actor.nombre || "",
    creadaEn: serverTimestamp(),
  });
  await conTiempoLimite(lote.commit(), ESPERA_MS);
  return uid;
}

// Cambia nombre, rol y/o estado de otra cuenta (y lo audita en la misma operación)
export async function actualizarUsuario(actor, usuario, cambios) {
  if (usaApi("usuarios")) {
    // El servidor compara con los datos guardados, aplica el cambio y lo audita
    return (
      await llamarApi("PATCH", `/v1/usuarios/${encodeURIComponent(usuario.id)}`, { cuerpo: cambios, espera: ESPERA_MS })
    ).cambiado;
  }
  const campos = {};
  const detalle = [];
  if (cambios.nombre !== undefined && cambios.nombre !== usuario.nombre) {
    campos.nombre = cambios.nombre;
    detalle.push(`nombre: ${usuario.nombre || "-"} → ${cambios.nombre}`);
  }
  if (cambios.rol !== undefined && cambios.rol !== usuario.rol) {
    campos.rol = cambios.rol;
    detalle.push(`rol: ${usuario.rol || "estudiante"} → ${cambios.rol}`);
  }
  if (cambios.activo !== undefined && cambios.activo !== (usuario.activo !== false)) {
    campos.activo = cambios.activo;
    detalle.push(cambios.activo ? "cuenta activada" : "cuenta desactivada");
  }
  if (Object.keys(campos).length === 0) return false;

  const lote = writeBatch(db);
  lote.update(doc(db, "users", usuario.id), campos);
  lote.set(doc(collection(db, "auditoria")), {
    accion: campos.rol ? "usuario.rol" : campos.activo !== undefined ? "usuario.estado" : "usuario.editar",
    entidad: "usuario",
    entidadId: usuario.id,
    detalle: `${usuario.email || usuario.id} · ${detalle.join("; ")}`.slice(0, 500),
    actorId: actor.uid,
    actorNombre: actor.nombre || "",
    creadaEn: serverTimestamp(),
  });
  await conTiempoLimite(lote.commit(), ESPERA_MS);
  return true;
}

export function mensajeErrorAdmin(error) {
  // Validación del servidor (el formulario ya valida): se muestra el mensaje del campo
  if (error?.code === "invalid-argument" && error.campos) {
    return Object.values(error.campos)[0] || "Revisa los datos e intenta de nuevo.";
  }
  const codigo = String(error?.code || "").replace(/^(firestore|auth)\//, "");
  if (codigo === "email-already-in-use") return "Ya existe una cuenta con ese correo.";
  if (codigo === "invalid-email") return "El correo no es válido.";
  if (codigo === "weak-password") return "La contraseña es demasiado débil (mínimo 6 caracteres).";
  if (codigo === "permission-denied") return "No tienes permiso para realizar esta acción.";
  if (error?.name === "ErrorRed" || ["unavailable", "deadline-exceeded", "network-request-failed"].includes(codigo)) {
    return mensajeDeRed(error);
  }
  return "No se pudo completar la operación. Intenta de nuevo.";
}
