import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { validarDatosJornada } from "../dominio/jornada.js";
import { fechaAMillis, normalizarJornada } from "../dominio/jornadaFecha.js";
import { esAdministrador, esGestor, normalizarRol, puedeAdministrarJornada, puedeSerResponsable } from "../dominio/roles.js";
import { generarPlanillaCsv, nombreArchivoPlanilla } from "../dominio/planilla.js";
import { ErrorApi, noEncontrado, sinPermiso, validacion } from "../errores.js";
import { actorDe, agregarAuditoria } from "./auditoria.js";
import { notificarSinFallar } from "./avisos.js";

// Gestión de jornadas (gestor y administrador). Las reglas son las de firestore.rules:
//  - el gestor crea jornadas a su nombre y solo administra las que tiene asignadas (`creadoPor`)
//  - el administrador gestiona cualquiera y puede reasignarla a otro gestor
//  - editar una jornada activa exige fecha futura; los cupos no pueden bajar de los inscritos
//  - las inscripciones de una jornada eliminada se conservan
// Cuando actúa un administrador, la acción queda en la auditoría (en la misma operación atómica).
const MENSAJE_AJENA =
  "No tienes permiso para realizar esta acción. Solo puedes administrar las jornadas que tienes asignadas.";

const puedeGestionar = (usuario) => esGestor(usuario.rol) || esAdministrador(usuario.rol);

export function exigirGestor(usuario) {
  if (!puedeGestionar(usuario)) throw sinPermiso(MENSAJE_AJENA);
}

export function exigirPropiedad(usuario, datos) {
  if (!puedeAdministrarJornada(usuario.rol, usuario.uid, datos)) throw sinPermiso(MENSAJE_AJENA);
}

// Quién puede tener jornadas asignadas: cuenta existente, activa y con rol de gestor/administrador
async function validarResponsable(tx, db, uid) {
  const ref = db.collection("users").doc(uid);
  const snap = await (tx ? tx.get(ref) : ref.get());
  const perfil = snap.exists ? snap.data() : null;
  const valido =
    !!perfil && perfil.activo !== false && puedeSerResponsable(normalizarRol(perfil.rol));
  if (!valido) {
    throw validacion({
      creadoPor: "El gestor asignado no existe, está desactivado o no tiene rol de gestor.",
    });
  }
  return perfil;
}

const camposEditables = (d) => ({
  titulo: d.titulo,
  descripcion: d.descripcion,
  entidad: d.entidad,
  responsable: d.responsable,
  lugar: d.lugar,
  fecha: Timestamp.fromMillis(d.fecha),
  duracionMin: d.duracionMin,
  cuposTotales: d.cuposTotales,
});

// Banner opcional al editar: sin el campo se conserva el que había; "" lo quita; un enlace lo fija
const cambiosDeBanner = (d) =>
  d.bannerUrl === undefined ? {} : { bannerUrl: d.bannerUrl || FieldValue.delete() };

const nombreDe = (perfil, uid) => perfil?.nombre || perfil?.email || uid;

// Clave de idempotencia de «crear jornada»: el cliente genera una por intento y la repite al
// reintentar. Si el primer intento sí llegó al servidor (la app solo vio un error de conexión o
// un tiempo agotado), el reintento devuelve esa misma jornada en lugar de crear un duplicado.
const CLAVE_VALIDA = /^[A-Za-z0-9_-]{8,100}$/;

// El ID de la jornada se deriva de quién actúa, para quién es y la clave: la misma clave de otra
// persona (o para otro gestor) nunca choca ni permite adivinar jornadas ajenas.
const idIdempotente = (actor, creadoPor, clave) =>
  createHash("sha256").update(`${actor}|${creadoPor}|${clave}`).digest("hex").slice(0, 20);

// Devuelve { id } y, si es la repetición de una creación ya hecha, { id, repetida: true }
export async function crear(ctx, usuario, cuerpo = {}) {
  const { db, ahora } = ctx;
  exigirGestor(usuario);

  const clave = cuerpo.claveIdempotencia;
  if (clave !== undefined && !(typeof clave === "string" && CLAVE_VALIDA.test(clave))) {
    throw validacion({ claveIdempotencia: "La clave de idempotencia no es válida." });
  }

  const { errores, datos } = validarDatosJornada(cuerpo, { ahora: ahora(), exigirFutura: true });
  if (!datos) throw validacion(errores);

  // Un gestor siempre actúa a su nombre; el administrador, para el gestor elegido (o para sí mismo)
  if (esGestor(usuario.rol) && cuerpo.creadoPor && cuerpo.creadoPor !== usuario.uid) {
    throw sinPermiso(MENSAJE_AJENA);
  }
  const creadoPor = esAdministrador(usuario.rol) ? cuerpo.creadoPor || usuario.uid : usuario.uid;
  if (typeof creadoPor !== "string") throw validacion({ creadoPor: "El gestor no es válido." });

  const responsable =
    creadoPor === usuario.uid ? usuario.perfil : await validarResponsable(null, db, creadoPor);

  const ref = clave
    ? db.collection("jornadas").doc(idIdempotente(usuario.uid, creadoPor, clave))
    : db.collection("jornadas").doc();
  const documento = {
    ...camposEditables(datos),
    ...(datos.bannerUrl ? { bannerUrl: datos.bannerUrl } : {}),
    cuposOcupados: 0,
    activa: true,
    creadoPor,
    creadaEn: FieldValue.serverTimestamp(),
  };
  const auditar = (escritor) => {
    if (!esAdministrador(usuario.rol)) return;
    agregarAuditoria(db, escritor, actorDe(usuario), {
      accion: "jornada.crear",
      entidad: "jornada",
      entidadId: ref.id,
      detalle: `${datos.titulo} · gestor: ${nombreDe(responsable, creadoPor)}`,
    });
  };

  if (!clave) {
    const lote = db.batch();
    lote.set(ref, documento);
    auditar(lote);
    await lote.commit();
    return { id: ref.id };
  }

  // Con clave: si la jornada ya existe es un reintento y no se crea (ni se audita) otra vez
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return { id: ref.id, repetida: true };
    tx.set(ref, documento);
    auditar(tx);
    return { id: ref.id };
  });
}

// Edita los datos y, solo el administrador, reasigna la jornada (`creadoPor`)
export async function editar(ctx, usuario, jornadaId, cuerpo = {}) {
  const { db, ahora } = ctx;
  exigirGestor(usuario);
  const ref = db.collection("jornadas").doc(jornadaId);

  const despues = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw noEncontrado("La jornada no existe o ya fue eliminada.");
    const antes = snap.data();
    exigirPropiedad(usuario, antes);

    const propietarioAntes = antes.creadoPor ?? null;
    const reasigna = cuerpo.creadoPor !== undefined && cuerpo.creadoPor !== propietarioAntes;
    let responsable = null;
    if (reasigna) {
      if (!esAdministrador(usuario.rol)) throw sinPermiso(MENSAJE_AJENA);
      if (typeof cuerpo.creadoPor !== "string") throw validacion({ creadoPor: "El gestor no es válido." });
      responsable = await validarResponsable(tx, db, cuerpo.creadoPor);
    }

    // Una versión de la app sin el campo de duración no lo envía: se conserva la que ya tenía
    const campos = { ...cuerpo, duracionMin: cuerpo.duracionMin ?? antes.duracionMin };
    const { errores, datos } = validarDatosJornada(campos, {
      ahora: ahora(),
      cuposOcupados: antes.cuposOcupados || 0,
      // una jornada cancelada puede conservar una fecha pasada; las activas, no
      exigirFutura: antes.activa !== false,
    });
    if (!datos) throw validacion(errores);

    const cambios = { ...camposEditables(datos), ...(reasigna ? { creadoPor: cuerpo.creadoPor } : {}) };
    tx.update(ref, { ...cambios, ...cambiosDeBanner(datos) });
    if (esAdministrador(usuario.rol)) {
      agregarAuditoria(db, tx, actorDe(usuario), {
        accion: reasigna ? "jornada.reasignar" : "jornada.editar",
        entidad: "jornada",
        entidadId: jornadaId,
        detalle: `${datos.titulo}${reasigna ? ` · gestor: ${nombreDe(responsable, cuerpo.creadoPor)}` : ""}`,
      });
    }
    return { ...antes, ...cambios };
  });

  await notificarSinFallar(ctx, jornadaId, despues);
}

// Cancelar (activa:false) o reactivar (activa:true)
async function cambiarEstado(ctx, usuario, jornadaId, activa) {
  const { db, ahora } = ctx;
  exigirGestor(usuario);
  const ref = db.collection("jornadas").doc(jornadaId);

  const despues = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw noEncontrado("La jornada no existe o ya fue eliminada.");
    const antes = snap.data();
    exigirPropiedad(usuario, antes);

    if (activa) {
      const fecha = fechaAMillis(antes.fecha, antes.hora);
      if (fecha == null || fecha <= ahora()) {
        throw new ErrorApi(
          409,
          "FECHA_PASADA",
          "La fecha de la jornada ya pasó. Cambia la fecha antes de reactivarla."
        );
      }
    }
    tx.update(ref, { activa });
    if (esAdministrador(usuario.rol)) {
      agregarAuditoria(db, tx, actorDe(usuario), {
        accion: activa ? "jornada.reactivar" : "jornada.cancelar",
        entidad: "jornada",
        entidadId: jornadaId,
        detalle: antes.titulo,
      });
    }
    return { ...antes, activa };
  });

  await notificarSinFallar(ctx, jornadaId, despues);
}

export const cancelar = (ctx, usuario, jornadaId) => cambiarEstado(ctx, usuario, jornadaId, false);
export const reactivar = (ctx, usuario, jornadaId) => cambiarEstado(ctx, usuario, jornadaId, true);

// Las inscripciones de una jornada eliminada se conservan: a los estudiantes les aparece
// como "No disponible" en Mis jornadas.
export async function eliminar(ctx, usuario, jornadaId) {
  const { db } = ctx;
  exigirGestor(usuario);
  const ref = db.collection("jornadas").doc(jornadaId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw noEncontrado("La jornada no existe o ya fue eliminada.");
    const antes = snap.data();
    exigirPropiedad(usuario, antes);
    tx.delete(ref);
    if (esAdministrador(usuario.rol)) {
      agregarAuditoria(db, tx, actorDe(usuario), {
        accion: "jornada.eliminar",
        entidad: "jornada",
        entidadId: jornadaId,
        detalle: antes.titulo,
      });
    }
  });

  await notificarSinFallar(ctx, jornadaId, null);
}

// Estudiantes inscritos: el gestor de sus jornadas y el administrador de cualquiera
export async function inscritos(ctx, usuario, jornadaId) {
  const { db } = ctx;
  exigirGestor(usuario);
  const snap = await db.collection("jornadas").doc(jornadaId).get();
  const jornada = snap.exists ? snap.data() : null;
  if (!esAdministrador(usuario.rol)) exigirPropiedad(usuario, jornada);

  const lista = await db.collection("inscripciones").where("jornadaId", "==", jornadaId).get();
  return {
    jornada: jornada ? normalizarJornada(jornadaId, jornada) : null,
    inscritos: lista.docs.map((d) => {
      const datos = d.data();
      return {
        id: d.id,
        userId: datos.userId,
        nombreUsuario: datos.nombreUsuario || "",
        emailUsuario: datos.emailUsuario || "",
        inscritoEn: fechaAMillis(datos.inscritoEn),
        asistio: !!datos.asistio,
        metodoAsistencia: datos.metodoAsistencia || null,
      };
    }),
  };
}

// Planilla de inscritos (CSV para Excel)
export async function planilla(ctx, usuario, jornadaId) {
  const { jornada, inscritos: lista } = await inscritos(ctx, usuario, jornadaId);
  if (!jornada) throw noEncontrado("La jornada no existe o ya fue eliminada.");
  return { nombre: nombreArchivoPlanilla(jornada), csv: generarPlanillaCsv(jornada, lista) };
}
