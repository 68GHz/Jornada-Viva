import { esAdministrador, puedeAdministrarJornada } from "./roles.js";

// Estado de una jornada tal como se muestra al maestro.
// No se guarda aparte: se deduce de `activa` y de la fecha (en milisegundos).
//  - finalizada: la fecha ya pasó (la app además la desactiva en Firestore al vencer)
//  - cancelada:  `activa` es false y la fecha aún no llega
//  - activa:     `activa` es true y la fecha aún no llega
export const ESTADOS_JORNADA = {
  ACTIVA: "activa",
  CANCELADA: "cancelada",
  FINALIZADA: "finalizada",
};

export const ETIQUETA_ESTADO = {
  [ESTADOS_JORNADA.ACTIVA]: "Activa",
  [ESTADOS_JORNADA.CANCELADA]: "Cancelada",
  [ESTADOS_JORNADA.FINALIZADA]: "Finalizada",
};

export function estadoJornada(jornada, ahora = Date.now()) {
  if (jornada.fecha != null && jornada.fecha <= ahora) return ESTADOS_JORNADA.FINALIZADA;
  return jornada.activa === true ? ESTADOS_JORNADA.ACTIVA : ESTADOS_JORNADA.CANCELADA;
}

// Qué puede hacer un usuario con una jornada. Es solo para la interfaz: lo que de
// verdad se permite lo decide firestore.rules.
export function permisosJornada({ rol, uid, jornada, ahora = Date.now() }) {
  // El administrador gestiona cualquier jornada; el gestor, solo las asignadas a él
  const propia = puedeAdministrarJornada(rol, uid, jornada);
  const estado = estadoJornada(jornada, ahora);
  return {
    verAdministracion: propia,
    verInscritos: propia,
    descargarPlanilla: propia,
    editar: propia && estado !== ESTADOS_JORNADA.FINALIZADA,
    cancelar: propia && estado === ESTADOS_JORNADA.ACTIVA,
    reactivar: propia && estado === ESTADOS_JORNADA.CANCELADA,
    eliminar: propia,
    reasignar: esAdministrador(rol),
  };
}

const ORDEN_ESTADOS = [ESTADOS_JORNADA.ACTIVA, ESTADOS_JORNADA.CANCELADA, ESTADOS_JORNADA.FINALIZADA];

// Orden para el maestro: primero las activas, luego las canceladas y al final las
// finalizadas. Las próximas van de la más cercana a la más lejana y las finalizadas,
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
