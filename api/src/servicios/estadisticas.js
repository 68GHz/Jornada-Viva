import { normalizarJornada } from "../dominio/jornadaFecha.js";
import { ETIQUETA_ESTADO, estadoJornada } from "../dominio/estadoJornada.js";
import { generarReporteJornadasCsv } from "../dominio/planilla.js";
import { calcularEstadisticas } from "../dominio/usuariosAdmin.js";
import { actorDe, agregarAuditoria } from "./auditoria.js";

// Estadísticas y reporte global (solo administrador). Mismos cálculos que hacía la app
// con los datos que escuchaba: indicadores por rol/estado/espacio/gestor y ocupación.
async function cargarTodo(db) {
  const [usuarios, jornadas] = await Promise.all([
    db.collection("users").get(),
    db.collection("jornadas").get(),
  ]);
  return {
    usuarios: usuarios.docs.map((d) => ({ id: d.id, ...d.data() })),
    jornadas: jornadas.docs.map((d) => normalizarJornada(d.id, d.data())),
  };
}

const nombreGestor = (nombres, id) =>
  id ? nombres.get(id) || "Gestor desconocido" : "Sin gestor asignado";

export async function estadisticas(ctx) {
  const { usuarios, jornadas } = await cargarTodo(ctx.db);
  const stats = calcularEstadisticas(usuarios, jornadas, ctx.ahora());
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre || u.email]));
  return {
    ...stats,
    // Jornadas por gestor con el nombre ya resuelto ("sin-gestor" = sin propietario)
    porGestorNombre: Object.entries(stats.porGestor).map(([id, cantidad]) => ({
      id,
      nombre: id === "sin-gestor" ? "Sin gestor asignado" : nombres.get(id) || "Gestor desconocido",
      jornadas: cantidad,
    })),
  };
}

export async function reporteJornadas(ctx, admin) {
  const { db } = ctx;
  const { usuarios, jornadas } = await cargarTodo(db);
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre || u.email]));
  const ahora = ctx.ahora();
  const filas = jornadas.map((x) => ({
    titulo: x.titulo,
    fecha: x.fecha,
    lugar: x.lugar,
    estado: ETIQUETA_ESTADO[estadoJornada(x, ahora)],
    gestor: nombreGestor(nombres, x.creadoPor),
    cuposTotales: x.cuposTotales || 0,
    cuposOcupados: x.cuposOcupados || 0,
  }));

  const lote = db.batch();
  agregarAuditoria(db, lote, actorDe(admin), {
    accion: "reporte.exportar",
    entidad: "reporte",
    entidadId: "jornadas",
    detalle: `${filas.length} jornadas`,
  });
  await lote.commit();
  return { nombre: "reporte-jornadas.csv", csv: generarReporteJornadasCsv(filas) };
}
