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

function exigirGestor(usuario) {
  if (!puedeGestionar(usuario)) throw sinPermiso(MENSAJE_AJENA);
}

function exigirPropiedad(usuario, datos) {
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
  cuposTotales: d.cuposTotales,
});

const nombreDe = (perfil, uid) => perfil?.nombre || perfil?.email || uid;

export async function crear(ctx, usuario, cuerpo = {}) {
  const { db, ahora } = ctx;
  exigirGestor(usuario);

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

  const ref = db.collection("jornadas").doc();
  const lote = db.batch();
  lote.set(ref, {
    ...camposEditables(datos),
    cuposOcupados: 0,
    activa: true,
    creadoPor,
    creadaEn: FieldValue.serverTimestamp(),
  });
  if (esAdministrador(usuario.rol)) {
    agregarAuditoria(db, lote, actorDe(usuario), {
      accion: "jornada.crear",
      entidad: "jornada",
      entidadId: ref.id,
      detalle: `${datos.titulo} · gestor: ${nombreDe(responsable, creadoPor)}`,
    });
  }
  await lote.commit();
  return { id: ref.id };
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

    const { errores, datos } = validarDatosJornada(cuerpo, {
      ahora: ahora(),
      cuposOcupados: antes.cuposOcupados || 0,
      // una jornada cancelada puede conservar una fecha pasada; las activas, no
      exigirFutura: antes.activa !== false,
    });
    if (!datos) throw validacion(errores);

    const cambios = { ...camposEditables(datos), ...(reasigna ? { creadoPor: cuerpo.creadoPor } : {}) };
    tx.update(ref, cambios);
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
