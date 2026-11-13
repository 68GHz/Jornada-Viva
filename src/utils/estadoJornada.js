import { esAdministrador, puedeAdministrarJornada } from "./roles.js";
import { jornadaTerminada } from "./duracion.js";

// Estado de una jornada tal como se muestra al maestro.
// No se guarda aparte: se deduce de `activa`, la fecha de inicio y la duración (en milisegundos).
//  - activa:     `activa` es true y la jornada aún no empieza
//  - en curso:   `activa` es true, ya empezó y todavía no termina (fecha + duración)
//  - cancelada:  `activa` es false y la fecha de inicio aún no llega
//  - finalizada: la jornada ya terminó. Una jornada cancelada cuya fecha de inicio ya llegó también
//                figura como finalizada: nunca llegó a realizarse. La app (y el servidor) además la
//                desactivan en Firestore al terminar.
export const ESTADOS_JORNADA = {
  ACTIVA: "activa",
  EN_CURSO: "en_curso",
  CANCELADA: "cancelada",
  FINALIZADA: "finalizada",
};

export const ETIQUETA_ESTADO = {
  [ESTADOS_JORNADA.ACTIVA]: "Activa",
  [ESTADOS_JORNADA.EN_CURSO]: "En curso",
  [ESTADOS_JORNADA.CANCELADA]: "Cancelada",
  [ESTADOS_JORNADA.FINALIZADA]: "Finalizada",
};

// Para los filtros y contadores ("Activas (3)")
export const ETIQUETA_ESTADO_PLURAL = {
  [ESTADOS_JORNADA.ACTIVA]: "Activas",
  [ESTADOS_JORNADA.EN_CURSO]: "En curso",
  [ESTADOS_JORNADA.CANCELADA]: "Canceladas",
  [ESTADOS_JORNADA.FINALIZADA]: "Finalizadas",
};

export function estadoJornada(jornada, ahora = Date.now()) {
  if (jornada.fecha != null) {
    if (jornadaTerminada(jornada, ahora)) return ESTADOS_JORNADA.FINALIZADA;
    if (jornada.fecha <= ahora) {
      return jornada.activa === true ? ESTADOS_JORNADA.EN_CURSO : ESTADOS_JORNADA.FINALIZADA;
    }
  }
  return jornada.activa === true ? ESTADOS_JORNADA.ACTIVA : ESTADOS_JORNADA.CANCELADA;
}

// Qué puede hacer un usuario con una jornada. Es solo para la interfaz: lo que de
// verdad se permite lo decide firestore.rules (o la API).
export function permisosJornada({ rol, uid, jornada, ahora = Date.now() }) {
  // El administrador gestiona cualquier jornada; el gestor, solo las asignadas a él
  const propia = puedeAdministrarJornada(rol, uid, jornada);
  const estado = estadoJornada(jornada, ahora);
  // Una vez que empieza no se edita ni se cancela; solo se toma o corrige la asistencia
  const sinEmpezar = estado === ESTADOS_JORNADA.ACTIVA || estado === ESTADOS_JORNADA.CANCELADA;
  const yaEmpezo = estado === ESTADOS_JORNADA.EN_CURSO || estado === ESTADOS_JORNADA.FINALIZADA;
  return {
    verAdministracion: propia,
    verInscritos: propia,
    descargarPlanilla: propia,
    editar: propia && sinEmpezar,
    cancelar: propia && estado === ESTADOS_JORNADA.ACTIVA,
    reactivar: propia && estado === ESTADOS_JORNADA.CANCELADA,
    eliminar: propia,
    reasignar: esAdministrador(rol),
    // El QR se puede preparar antes de empezar y se usa mientras la jornada está en curso
    generarQr: propia && (estado === ESTADOS_JORNADA.ACTIVA || estado === ESTADOS_JORNADA.EN_CURSO),
    // Marcar o corregir la asistencia a mano: desde que empieza, sin límite de tiempo
    marcarAsistencia: propia && yaEmpezo,
  };
}

const ORDEN_ESTADOS = [
  ESTADOS_JORNADA.EN_CURSO,
  ESTADOS_JORNADA.ACTIVA,
  ESTADOS_JORNADA.CANCELADA,
  ESTADOS_JORNADA.FINALIZADA,
];

// Orden para el maestro: primero las que están en curso, luego las activas, las canceladas y al
// final las finalizadas. Las próximas van de la más cercana a la más lejana y las finalizadas,
// de la más reciente a la más antigua.
export function ordenarParaMaestro(jornadas, ahora = Date.now()) {
  return [...jornadas].sort((a, b) => {
    const ea = estadoJornada(a, ahora);
    const eb = estadoJornada(b, ahora);
    if (ea !== eb) return ORDEN_ESTADOS.indexOf(ea) - ORDEN_ESTADOS.indexOf(eb);
    const diferencia = (a.fecha ?? 0) - (b.fecha ?? 0);
    return ea === ESTADOS_JORNADA.FINALIZADA ? -diferencia : diferencia;
  });
}

export function contarPorEstado(jornadas, ahora = Date.now()) {
  const conteo = { total: jornadas.length };
  for (const estado of ORDEN_ESTADOS) conteo[estado] = 0;
  for (const j of jornadas) conteo[estadoJornada(j, ahora)] += 1;
  return conteo;
}
