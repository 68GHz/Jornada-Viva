// Utilidades puras del modo offline (sin dependencias de React ni de Firebase).
import { conteoPlural } from "./plural.js";

export const ESTADOS = {
  PENDIENTE: "pendiente",
  SINCRONIZANDO: "sincronizando",
  RECHAZADA: "rechazada",
};

export const TIPOS = {
  INSCRIBIR: "INSCRIBIR",
  CANCELAR: "CANCELAR",
  // Asistencia hecha sin conexión: el estudiante guarda su escaneo del QR; el gestor o el administrador
  // marcan o quitan la asistencia de un inscrito (`objetivoId` = id de la inscripción)
  REGISTRAR_ASISTENCIA: "REGISTRAR_ASISTENCIA",
  MARCAR_ASISTENCIA: "MARCAR_ASISTENCIA",
  QUITAR_ASISTENCIA: "QUITAR_ASISTENCIA",
};

// El aviso "Conectado" (al recuperar la red) se muestra exactamente este tiempo.
// El aviso "Sin conexión", en cambio, es permanente: dura mientras no haya red.
export const DURACION_AVISO_CONEXION_MS = 10000;

// Acción que todavía debe enviarse al servidor
export const accionActiva = (accion) =>
  accion.estado === ESTADOS.PENDIENTE || accion.estado === ESTADOS.SINCRONIZANDO;

// ---- Tipos de acción de la cola -------------------------------------------------------------
// La cola admite varios tipos de acción. Lo que depende del tipo se declara aquí, tipo por tipo,
// en vez de asumir que "lo que no es INSCRIBIR es CANCELAR":
//  - efecto en los cupos de la jornada: solo las acciones de inscripción lo tienen
//  - contrarias: pares que se anulan entre sí si ninguna llegó a enviarse (solo inscribir/cancelar)
//  - etiqueta para la pantalla de Sincronización
const EFECTO_EN_CUPOS = { [TIPOS.INSCRIBIR]: 1, [TIPOS.CANCELAR]: -1 };
const CONTRARIAS = {
  [TIPOS.INSCRIBIR]: TIPOS.CANCELAR,
  [TIPOS.CANCELAR]: TIPOS.INSCRIBIR,
  // Marcar y quitar la asistencia del MISMO inscrito sin haber enviado nada se anulan entre sí
  [TIPOS.MARCAR_ASISTENCIA]: TIPOS.QUITAR_ASISTENCIA,
  [TIPOS.QUITAR_ASISTENCIA]: TIPOS.MARCAR_ASISTENCIA,
};
const ETIQUETAS = {
  [TIPOS.INSCRIBIR]: "Inscripción",
  [TIPOS.CANCELAR]: "Cancelación de inscripción",
  [TIPOS.REGISTRAR_ASISTENCIA]: "Registro de asistencia",
  [TIPOS.MARCAR_ASISTENCIA]: "Asistencia marcada",
  [TIPOS.QUITAR_ASISTENCIA]: "Asistencia retirada",
};
const tiene = (objeto, clave) => Object.prototype.hasOwnProperty.call(objeto, clave);

// +1 si ocupa un cupo, -1 si lo libera, 0 si no toca los cupos (o el tipo no se conoce)
export const efectoEnCupos = (tipo) => (tiene(EFECTO_EN_CUPOS, tipo) ? EFECTO_EN_CUPOS[tipo] : 0);
// ¿Es una acción sobre la inscripción de una jornada? (inscribir o cancelar)
export const esAccionDeInscripcion = (tipo) => tiene(EFECTO_EN_CUPOS, tipo);
// ¿Se anulan entre sí? Solo inscribir/cancelar y marcar/quitar asistencia; cualquier otro par, no.
// (La cola solo anula acciones sobre la misma jornada y el mismo objetivo.)
export const esContraria = (a, b) => tiene(CONTRARIAS, a) && CONTRARIAS[a] === b;
export const etiquetaDeTipo = (tipo) => (tiene(ETIQUETAS, tipo) ? ETIQUETAS[tipo] : "Acción pendiente");

// Decide qué pasa al agregar `datos` a la `cola` (lógica pura; syncQueueService la aplica):
//  - "anulada":   existe la acción contraria sobre lo mismo y nunca se intentó enviar: se cancelan
//                 entre sí (si ya se intentó, podría haberse aplicado en el servidor sin saberlo)
//  - "duplicada": ya hay una acción igual en curso (mismo tipo, jornada y objetivo)
//  - "encolada":  se agrega
// `objetivoId` (opcional) distingue acciones del mismo tipo sobre la misma jornada, p. ej. la
// asistencia de distintos inscritos. Devuelve { valor, resultado }; `valor` es la cola nueva o
// undefined si no cambia.
export function planificarEncolado(cola, datos, ahora, id) {
  const mismoObjetivo = (a) => (a.objetivoId ?? null) === (datos.objetivoId ?? null);
  const deLaJornada = cola.filter((a) => a.jornadaId === datos.jornadaId && mismoObjetivo(a));

  const contraria = deLaJornada.find(
    (a) => esContraria(a.tipo, datos.tipo) && a.estado === ESTADOS.PENDIENTE && a.intentos === 0
  );
  if (contraria) {
    return {
      valor: cola.filter((a) => a.id !== contraria.id),
      resultado: { resultado: "anulada", accion: contraria },
    };
  }

  const igual = deLaJornada.find((a) => a.tipo === datos.tipo && accionActiva(a));
  if (igual) return { valor: undefined, resultado: { resultado: "duplicada", accion: igual } };

  const accion = {
    id,
    ...datos,
    creadaEn: ahora,
    estado: ESTADOS.PENDIENTE,
    intentos: 0,
    proximoIntento: null,
    ultimoError: null,
    codigoError: null,
  };
  return { valor: [...cola, accion], resultado: { resultado: "encolada", accion } };
}

// Espera entre reintentos (red caída): 5 s, 10 s, 20 s... hasta 2 min
export const esperaReintento = (intentos) =>
  Math.min(5000 * 2 ** Math.max(0, intentos - 1), 120000);

// Error de una regla de negocio (sin cupos, jornada desactivada...). No se reintenta.
export class ErrorNegocio extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorNegocio";
    this.codigo = codigo;
  }
}

// Error de conectividad (incluye el tiempo de espera agotado). Se reintenta.
// `motivo` distingue «no hay red» (por defecto) de «el servidor no respondió a tiempo»
// ("tiempo-agotado") o «respondió que no está disponible» ("servidor-no-disponible"):
// en el plan gratuito de Render el servidor se duerme y tarda en despertar.
export class ErrorRed extends Error {
  constructor(mensaje = "Sin conexión con el servidor.", motivo = "sin-red") {
    super(mensaje);
    this.name = "ErrorRed";
    this.code = "unavailable";
    this.motivo = motivo;
  }
}

export const MENSAJE_SIN_RED = "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.";
export const MENSAJE_SERVIDOR_DESPERTANDO =
  "El servidor está despertando o tarda en responder. Espera unos segundos e intenta de nuevo.";

// Mensaje para el usuario ante un error de conexión: distingue la falta de red de un
// servidor que todavía está despertando.
export const mensajeDeRed = (error) =>
  error?.motivo === "tiempo-agotado" || error?.motivo === "servidor-no-disponible"
    ? MENSAJE_SERVIDOR_DESPERTANDO
    : MENSAJE_SIN_RED;

export function conTiempoLimite(promesa, ms = 20000) {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(
      () => reject(new ErrorRed("Tiempo de espera agotado.", "tiempo-agotado")),
      ms
    );
    promesa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (error) => {
        clearTimeout(temporizador);
        reject(error);
      }
    );
  });
}

// Códigos de Firebase que indican un fallo temporal: la acción se conserva y se reintenta
const CODIGOS_TRANSITORIOS = new Set([
  "unavailable",
  "deadline-exceeded",
  "cancelled",
  "aborted",
  "resource-exhausted",
  "internal",
  "unknown",
  "network-request-failed",
]);

// Devuelve { tipo: "negocio" | "red" | "permanente", mensaje, codigo }
export function clasificarError(error) {
  if (error?.name === "ErrorNegocio") {
    return { tipo: "negocio", mensaje: error.message, codigo: error.codigo };
  }

  const codigo = String(error?.code || "").replace(/^(firestore|auth)\//, "");
  if (error?.name === "ErrorRed" || CODIGOS_TRANSITORIOS.has(codigo)) {
    return { tipo: "red", mensaje: "Sin conexión con el servidor.", codigo };
  }
  if (/network|offline|timed? ?out/i.test(String(error?.message || ""))) {
    return { tipo: "red", mensaje: "Sin conexión con el servidor.", codigo };
  }

  if (codigo === "permission-denied") {
    return {
      tipo: "permanente",
      mensaje: "No tienes permiso para realizar esta acción.",
      codigo,
    };
  }
  return {
    tipo: "permanente",
    mensaje: error?.message || "No se pudo completar la acción.",
    codigo,
  };
}

// Elige el ÚNICO aviso de estado que se muestra (nunca dos a la vez), por prioridad:
//  1. Sincronizando datos: mientras dure el envío, sin límite de tiempo
//  2. Sin conexión: PERMANENTE mientras no haya red (con el número de acciones pendientes).
//     No depende de ningún temporizador ni de `avisoConexion`.
//  3. Conectado: solo durante DURACION_AVISO_CONEXION_MS tras recuperar la red
//  4. Errores que requieren atención (acciones rechazadas; fallo al sincronizar)
// Devuelve { tipo, texto } o null si no hay nada que mostrar.
export function elegirAviso({
  enLinea,
  sincronizando,
  avisoConexion,
  errorSync,
  nPendientes = 0,
  nRechazadas = 0,
}) {
  if (enLinea && sincronizando) {
    return { tipo: "sincronizando", texto: "Sincronizando datos" };
  }
  if (!enLinea) {
    return {
      tipo: "sin-conexion",
      texto:
        nPendientes > 0
          ? `Sin conexión · ${conteoPlural(nPendientes, "pendiente", "pendientes")}`
          : "Sin conexión",
    };
  }
  // Un aviso de conexión que ya no coincide con el estado real se ignora
  if (avisoConexion === "conectado") {
    return { tipo: "conectado", texto: "Conectado" };
  }
  if (nRechazadas > 0) {
    return {
      tipo: "rechazadas",
      texto: `${nRechazadas} ${
        nRechazadas === 1 ? "acción no se pudo" : "acciones no se pudieron"
      } completar · Toca para revisar`,
    };
  }
  if (enLinea && errorSync && nPendientes > 0) {
    return {
      tipo: "error-sync",
      texto:
        "No se pudo sincronizar. Tus cambios siguen guardados y se reintentarán automáticamente.",
    };
  }
  return null;
}

// Resumen de lo que falta por enviar, para el inicio y la pantalla de Sincronización:
// "Todo sincronizado" · "2 pendientes por sincronizar" · "1 pendiente por sincronizar · 1 con error"
export function resumenSincronizacion({ nPendientes = 0, nRechazadas = 0 } = {}) {
  const partes = [];
  if (nPendientes > 0) {
    partes.push(conteoPlural(nPendientes, "pendiente por sincronizar", "pendientes por sincronizar"));
  }
  if (nRechazadas > 0) partes.push(`${nRechazadas} con error`);
  return partes.length > 0 ? partes.join(" · ") : "Todo sincronizado";
}
