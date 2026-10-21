import { actualizarLocal, leerLocal } from "./localStore";
import { ESTADOS, accionActiva } from "../utils/sincronizacion";

// Cola persistente de acciones realizadas sin conexión (una cola por usuario).
// Acción: { id, tipo, jornadaId, tituloJornada, fechaJornada, nombreUsuario,
//           emailUsuario, creadaEn, estado, intentos, proximoIntento,
//           ultimoError, codigoError }
const CLAVE_COLA = "cola";

const oyentes = new Set();
export const suscribirCola = (fn) => {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
};

const nuevoId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function mutar(uid, fn) {
  const { valor, resultado } = await actualizarLocal(uid, CLAVE_COLA, fn, []);
  oyentes.forEach((oyente) => oyente(uid, valor));
  return resultado;
}

export const cargarCola = (uid) => leerLocal(uid, CLAVE_COLA, []);

// Resultado: { resultado: "encolada" | "anulada" | "duplicada", accion }
// - duplicada: ya hay una acción igual en curso (evita registros repetidos)
// - anulada: la acción contraria aún no se había enviado, así que se cancelan entre sí
export const encolarAccion = (uid, datos, ahora = Date.now()) =>
  mutar(uid, (cola) => {
    const deLaJornada = cola.filter((a) => a.jornadaId === datos.jornadaId);

    // Solo se anula si la contraria nunca se intentó enviar: si ya se intentó,
    // podría haberse aplicado en el servidor sin que lo supiéramos.
    const contraria = deLaJornada.find(
      (a) => a.tipo !== datos.tipo && a.estado === ESTADOS.PENDIENTE && a.intentos === 0
    );
    if (contraria) {
      return {
        valor: cola.filter((a) => a.id !== contraria.id),
        resultado: { resultado: "anulada", accion: contraria },
      };
    }

    const igual = deLaJornada.find((a) => a.tipo === datos.tipo && accionActiva(a));
    if (igual) {
      return { valor: undefined, resultado: { resultado: "duplicada", accion: igual } };
    }

    const accion = {
      id: nuevoId(),
      ...datos,
      creadaEn: ahora,
      estado: ESTADOS.PENDIENTE,
      intentos: 0,
      proximoIntento: null,
      ultimoError: null,
      codigoError: null,
    };
    return { valor: [...cola, accion], resultado: { resultado: "encolada", accion } };
  });

export const actualizarAccion = (uid, id, cambios) =>
  mutar(uid, (cola) => ({
    valor: cola.map((a) => (a.id === id ? { ...a, ...cambios } : a)),
    resultado: null,
  }));

export const quitarAccion = (uid, id) =>
  mutar(uid, (cola) => ({ valor: cola.filter((a) => a.id !== id), resultado: null }));

// Reintento manual de una acción rechazada o en espera
export const reintentarAccion = (uid, id) =>
  actualizarAccion(uid, id, {
    estado: ESTADOS.PENDIENTE,
    intentos: 0,
    proximoIntento: null,
    ultimoError: null,
    codigoError: null,
  });

// Si la app se cerró en mitad de un envío, la acción vuelve a quedar pendiente
// (el envío es idempotente, así que reenviarla no duplica nada).
export const recuperarInterrumpidas = (uid) =>
  mutar(uid, (cola) =>
    cola.some((a) => a.estado === ESTADOS.SINCRONIZANDO)
      ? {
          valor: cola.map((a) =>
            a.estado === ESTADOS.SINCRONIZANDO ? { ...a, estado: ESTADOS.PENDIENTE } : a
          ),
          resultado: null,
        }
      : { valor: undefined, resultado: null }
  );

export const obtenerAccion = async (uid, id) =>
  (await cargarCola(uid)).find((a) => a.id === id) || null;
