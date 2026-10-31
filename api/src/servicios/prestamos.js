import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { fechaAMillis } from "../dominio/jornadaFecha.js";
import { normalizarCodigoObjeto, validarPrestamo } from "../dominio/prestamos.js";
import { esAdministrador, esEstudiante, esGestor } from "../dominio/roles.js";
import { negocio, noEncontrado, sinPermiso, validacion } from "../errores.js";
import { actorDe, agregarAuditoria } from "./auditoria.js";

// FE-02 · Préstamo y devolución de objetos (libros, equipos y materiales).
//  - El gestor o el administrador registran el préstamo de un objeto a un estudiante (por su correo)
//    hasta una fecha, y marcan su devolución. Un gestor solo gestiona los préstamos que él registró;
//    el administrador, todos (y sus acciones quedan en la auditoría).
//  - Un mismo objeto (por su código de inventario) no puede estar en dos préstamos activos a la vez.
//  - El estudiante consulta los suyos. Las alertas «por vencer / vencido» se calculan en la app a
//    partir de la fecha de devolución (también sin conexión).
//  - Devolver es idempotente: repetirlo devuelve «ya-devuelto» sin tocar nada.
const LIMITE_LISTA = 500;

function exigirPersonal(usuario) {
  if (!esGestor(usuario.rol) && !esAdministrador(usuario.rol)) {
    throw sinPermiso("Solo un gestor de jornadas o un administrador puede gestionar los préstamos.");
  }
}

// Documento -> objeto serializable para la app (fechas en milisegundos)
export const aPrestamo = (doc) => {
  const d = doc.data();
  return {
    id: doc.id,
    codigo: d.codigo,
    nombre: d.nombre,
    tipo: d.tipo,
    userId: d.userId,
    nombreUsuario: d.nombreUsuario || "",
    emailUsuario: d.emailUsuario || "",
    prestadoPorNombre: d.prestadoPorNombre || "",
    prestadoEn: fechaAMillis(d.prestadoEn),
    vence: fechaAMillis(d.vence),
    devueltoEn: fechaAMillis(d.devueltoEn),
    activo: d.activo === true,
    nota: d.nota || "",
  };
};

// El estudiante al que se presta: cuenta existente, activa y con rol de estudiante
async function buscarEstudiante(db, correo) {
  const encontrados = await db.collection("users").where("email", "==", correo).limit(2).get();
  const docs = encontrados.docs.filter((d) => d.data().activo !== false);
  if (docs.length !== 1) {
    throw negocio("ESTUDIANTE_NO_ENCONTRADO", "No hay una cuenta activa con ese correo.");
  }
  const perfil = docs[0].data();
  if (!esEstudiante(perfil.rol)) {
    throw negocio("ESTUDIANTE_NO_ENCONTRADO", "Los préstamos se hacen a estudiantes: esa cuenta no lo es.");
  }
  return { uid: docs[0].id, nombre: perfil.nombre || "", email: perfil.email || correo };
}

export async function crear(ctx, usuario, cuerpo = {}) {
  const { db, ahora } = ctx;
  exigirPersonal(usuario);

  const { errores, datos } = validarPrestamo(cuerpo, { ahora: ahora() });
  if (!datos) throw validacion(errores);

  const estudiante = await buscarEstudiante(db, datos.correo);
  const codigoNormalizado = normalizarCodigoObjeto(datos.codigo);
  const ref = db.collection("prestamos").doc();

  await db.runTransaction(async (tx) => {
    // Un objeto no puede estar prestado a dos personas a la vez
    const activos = await tx.get(
      db.collection("prestamos").where("codigoNormalizado", "==", codigoNormalizado).where("activo", "==", true).limit(1)
    );
    if (!activos.empty) {
      const otro = activos.docs[0].data();
      throw negocio(
        "OBJETO_YA_PRESTADO",
        `«${datos.nombre}» (${datos.codigo}) ya está prestado a ${otro.nombreUsuario || otro.emailUsuario || "otra persona"}.`
      );
    }

    tx.set(ref, {
      codigo: datos.codigo,
      codigoNormalizado,
      nombre: datos.nombre,
      tipo: datos.tipo,
      userId: estudiante.uid,
      nombreUsuario: estudiante.nombre,
      emailUsuario: estudiante.email,
      prestadoPor: usuario.uid,
      prestadoPorNombre: usuario.nombre || usuario.email || "",
      prestadoEn: FieldValue.serverTimestamp(),
      vence: Timestamp.fromMillis(datos.vence),
      activo: true,
      devueltoEn: null,
      ...(datos.nota ? { nota: datos.nota } : {}),
    });
    if (esAdministrador(usuario.rol)) {
      agregarAuditoria(db, tx, actorDe(usuario), {
        accion: "prestamo.crear",
        entidad: "prestamo",
        entidadId: ref.id,
        detalle: `${datos.nombre} (${datos.codigo}) · ${estudiante.nombre || estudiante.email}`,
      });
    }
  });
  return { id: ref.id };
}

export async function devolver(ctx, usuario, prestamoId) {
  const { db } = ctx;
  exigirPersonal(usuario);
  const ref = db.collection("prestamos").doc(prestamoId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw noEncontrado("El préstamo no existe.");
    const d = snap.data();
    // Un gestor solo gestiona los préstamos que él registró; el administrador, todos
    if (!esAdministrador(usuario.rol) && d.prestadoPor !== usuario.uid) {
      throw sinPermiso("Solo puedes gestionar los préstamos que registraste tú.");
    }
    if (d.activo !== true) return "ya-devuelto";

    tx.update(ref, { activo: false, devueltoEn: FieldValue.serverTimestamp(), devueltoPor: usuario.uid });
    if (esAdministrador(usuario.rol)) {
      agregarAuditoria(db, tx, actorDe(usuario), {
        accion: "prestamo.devolver",
        entidad: "prestamo",
        entidadId: prestamoId,
        detalle: `${d.nombre} (${d.codigo}) · ${d.nombreUsuario || d.emailUsuario || d.userId}`,
      });
    }
    return "devuelto";
  });
}

// Préstamos que gestiona el usuario: el administrador, todos; el gestor, los que registró.
// `soloActivos` (por defecto false) deja fuera los ya devueltos.
export async function listar(ctx, usuario, { soloActivos = false } = {}) {
  const { db } = ctx;
  exigirPersonal(usuario);
  let consulta = db.collection("prestamos");
  if (!esAdministrador(usuario.rol)) consulta = consulta.where("prestadoPor", "==", usuario.uid);
  if (soloActivos) consulta = consulta.where("activo", "==", true);
  const snap = await consulta.limit(LIMITE_LISTA).get();
  return { prestamos: snap.docs.map(aPrestamo) };
}

// Los préstamos del propio estudiante (cualquier cuenta activa ve solo los suyos)
export async function mios(ctx, usuario) {
  const { db } = ctx;
  const snap = await db.collection("prestamos").where("userId", "==", usuario.uid).limit(LIMITE_LISTA).get();
  return { prestamos: snap.docs.map(aPrestamo) };
}
