import { FieldValue } from "firebase-admin/firestore";
import {
  CODIGO_QR_RENOVAR_MS,
  CODIGO_QR_VIGENCIA_MS,
  estadoVentanaAsistencia,
} from "../dominio/asistencia.js";
import { generarCodigo, verificarCodigo } from "../dominio/codigoAsistencia.js";
import { duracionJornadaMin } from "../dominio/duracion.js";
import { fechaAMillis } from "../dominio/jornadaFecha.js";
import { negocio, noEncontrado, validacion } from "../errores.js";
import { esAdministrador } from "../dominio/roles.js";
import { actorDe, agregarAuditoria } from "./auditoria.js";
import { exigirGestor, exigirPropiedad } from "./jornadas.js";

// Asistencia a una jornada. Todo pasa por la API (antes el móvil escribía directo en Firestore):
//  - El gestor (de sus jornadas) o el administrador pide un código firmado y de vida corta para
//    el QR; su pantalla lo renueva cada pocos segundos.
//  - El estudiante inscrito lo escanea y la API valida el código, que la jornada esté activa y que
//    esté dentro de la ventana de asistencia (los primeros 20 minutos, o toda la jornada si dura
//    menos) antes de registrar su asistencia.
//  - El gestor o el administrador pueden marcar o corregir la asistencia a mano en cualquier
//    momento desde que empieza la jornada. Queda anotado quién lo hizo y cuándo; si lo hace un
//    administrador, también en la auditoría.
const MENSAJES_CODIGO = {
  CADUCADO: "El código del QR caducó. Escanea el que se muestra ahora en la pantalla del gestor.",
  JORNADA: "Este código QR es de otra jornada. Escanea el de la jornada en la que estás presente.",
};

const datosDeJornada = (snap) => {
  const datos = snap.data();
  return { datos, fecha: fechaAMillis(datos.fecha, datos.hora), duracionMin: duracionJornadaMin(datos) };
};

// Código para mostrar en el QR (gestor de la jornada o administrador)
export async function emitirCodigo(ctx, usuario, jornadaId) {
  const { db, ahora, secretoAsistencia } = ctx;
  exigirGestor(usuario);
  const snap = await db.collection("jornadas").doc(jornadaId).get();
  if (!snap.exists) throw noEncontrado("La jornada no existe o ya fue eliminada.");
  exigirPropiedad(usuario, snap.data());

  const { codigo, expiraEn } = generarCodigo({
    jornadaId,
    ahoraMs: ahora(),
    vigenciaMs: CODIGO_QR_VIGENCIA_MS,
    secreto: secretoAsistencia,
  });
  return { codigo, expiraEn, renovarEnMs: CODIGO_QR_RENOVAR_MS };
}

// El estudiante registra su propia asistencia con el código del QR. Es idempotente:
// repetirlo devuelve "ya-registrada" sin tocar nada.
export async function registrar(ctx, usuario, jornadaId, cuerpo = {}) {
  const { db, ahora, secretoAsistencia } = ctx;
  if (typeof cuerpo.codigo !== "string" || !cuerpo.codigo) {
    throw validacion({ codigo: "Falta el código del QR." });
  }

  const verificacion = verificarCodigo(cuerpo.codigo, { jornadaId, ahoraMs: ahora(), secreto: secretoAsistencia });
  if (!verificacion.valido) {
    const mensaje = MENSAJES_CODIGO[verificacion.motivo] || "El código QR no es válido.";
    throw negocio(verificacion.motivo === "CADUCADO" ? "CODIGO_CADUCADO" : "CODIGO_INVALIDO", mensaje);
  }

  const jornadaRef = db.collection("jornadas").doc(jornadaId);
  return db.runTransaction(async (tx) => {
    const jornada = await tx.get(jornadaRef);
    const inscripciones = await tx.get(
      db.collection("inscripciones").where("userId", "==", usuario.uid).where("jornadaId", "==", jornadaId)
    );

    if (!jornada.exists) throw negocio("JORNADA_NO_DISPONIBLE", "La jornada ya no existe.");
    const { datos, fecha, duracionMin } = datosDeJornada(jornada);
    if (datos.activa !== true) throw negocio("JORNADA_NO_DISPONIBLE", "La jornada fue desactivada.");

    const ventana = estadoVentanaAsistencia(fecha, ahora(), duracionMin);
    if (!ventana.disponible) throw negocio("ASISTENCIA_FUERA_DE_VENTANA", ventana.mensaje);

    if (inscripciones.empty) throw negocio("NO_INSCRITO", "No estás inscrito en esta jornada.");
    if (inscripciones.docs.some((d) => d.data().asistio === true)) return "ya-registrada";

    tx.update(inscripciones.docs[0].ref, {
      asistio: true,
      asistioEn: FieldValue.serverTimestamp(),
      metodoAsistencia: "qr",
    });
    return "registrada";
  });
}

// El gestor (de sus jornadas) o el administrador marcan o corrigen la asistencia de un inscrito
export async function marcar(ctx, usuario, jornadaId, inscripcionId, cuerpo = {}) {
  const { db, ahora } = ctx;
  exigirGestor(usuario);
  if (typeof cuerpo.asistio !== "boolean") {
    throw validacion({ asistio: "Indica si asistió (true) o no (false)." });
  }
  const asistio = cuerpo.asistio;

  const jornadaRef = db.collection("jornadas").doc(jornadaId);
  const inscripcionRef = db.collection("inscripciones").doc(inscripcionId);

  return db.runTransaction(async (tx) => {
    const jornada = await tx.get(jornadaRef);
    const inscripcion = await tx.get(inscripcionRef);

    if (!jornada.exists) throw noEncontrado("La jornada no existe o ya fue eliminada.");
    const { datos, fecha } = datosDeJornada(jornada);
    exigirPropiedad(usuario, datos);

    if (!inscripcion.exists || inscripcion.data().jornadaId !== jornadaId) {
      throw noEncontrado("La inscripción no existe en esta jornada.");
    }
    if (fecha == null || fecha > ahora()) {
      throw negocio(
        "ASISTENCIA_NO_INICIADA",
        "La asistencia se puede marcar desde la hora de inicio de la jornada."
      );
    }

    const previa = inscripcion.data();
    // Sin cambios: no se pisa el método ni la constancia de quién la registró
    if (!!previa.asistio === asistio) return { asistio };

    tx.update(inscripcionRef, {
      asistio,
      asistioEn: asistio ? FieldValue.serverTimestamp() : null,
      metodoAsistencia: "manual",
      asistenciaModificadaPor: usuario.uid,
      asistenciaModificadaEn: FieldValue.serverTimestamp(),
    });
    if (esAdministrador(usuario.rol)) {
      agregarAuditoria(db, tx, actorDe(usuario), {
        accion: asistio ? "asistencia.marcar" : "asistencia.desmarcar",
        entidad: "inscripcion",
        entidadId: inscripcionId,
        detalle: `${datos.titulo} · ${previa.nombreUsuario || previa.emailUsuario || previa.userId}`,
      });
    }
    return { asistio };
  });
}
