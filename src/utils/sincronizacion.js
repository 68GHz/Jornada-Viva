// Utilidades puras del modo offline (sin dependencias de React ni de Firebase).

export const ESTADOS = {
  PENDIENTE: "pendiente",
  SINCRONIZANDO: "sincronizando",
  RECHAZADA: "rechazada",
};

export const TIPOS = {
  INSCRIBIR: "INSCRIBIR",
  CANCELAR: "CANCELAR",
};

// Los avisos "Conectado" / "Sin conexión" se muestran exactamente este tiempo
export const DURACION_AVISO_CONEXION_MS = 10000;

// Acción que todavía debe enviarse al servidor
export const accionActiva = (accion) =>
  accion.estado === ESTADOS.PENDIENTE || accion.estado === ESTADOS.SINCRONIZANDO;

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
export class ErrorRed extends Error {
  constructor(mensaje = "Sin conexión con el servidor.") {
    super(mensaje);
    this.name = "ErrorRed";
    this.code = "unavailable";
  }
}

export function conTiempoLimite(promesa, ms = 20000) {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(
      () => reject(new ErrorRed("Tiempo de espera agotado.")),
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
//  2. Sin conexión / Conectado: solo durante DURACION_AVISO_CONEXION_MS tras el cambio
//  3. Errores que requieren atención (acciones rechazadas; fallo al sincronizar)
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
  // Un aviso de conexión que ya no coincide con el estado real se ignora
  if (avisoConexion === "sin-conexion" && !enLinea) {
    return { tipo: "sin-conexion", texto: "Sin conexión" };
  }
  if (avisoConexion === "conectado" && enLinea) {
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
