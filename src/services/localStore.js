import AsyncStorage from "@react-native-async-storage/async-storage";

// Almacenamiento local (AsyncStorage) para el modo offline.
// Todas las claves pertenecen a un usuario: `jv:v1:<uid>:<nombre>`.
const PREFIJO = "jv:v1:";
// Clave que ya usaba jornadaEventService para sus instantáneas
const CLAVE_SNAPSHOTS_LEGADO = "@jornadaviva_snapshots_v1_";

const clave = (uid, nombre) => `${PREFIJO}${uid}:${nombre}`;

// Las operaciones se ejecutan una tras otra para que no se pisen entre sí
let serie = Promise.resolve();
const enSerie = (tarea) => {
  const resultado = serie.then(tarea);
  serie = resultado.catch(() => {});
  return resultado;
};

// Usuarios cuyos datos se acaban de borrar (cierre de sesión): no se vuelve a
// escribir nada suyo hasta que inicien sesión de nuevo.
const bloqueados = new Set();

async function leer(uid, nombre, porDefecto) {
  try {
    const texto = await AsyncStorage.getItem(clave(uid, nombre));
    return texto == null ? porDefecto : JSON.parse(texto);
  } catch {
    return porDefecto;
  }
}

export const leerLocal = (uid, nombre, porDefecto = null) =>
  enSerie(() => leer(uid, nombre, porDefecto));

export const guardarLocal = (uid, nombre, valor) =>
  enSerie(async () => {
    if (!uid || bloqueados.has(uid)) return;
    try {
      await AsyncStorage.setItem(clave(uid, nombre), JSON.stringify(valor));
    } catch (error) {
      console.warn("No se pudo guardar en el almacenamiento local:", error);
    }
  });

// Lee, transforma y guarda de forma atómica.
// `fn(actual)` devuelve { valor, resultado }; si `valor` es undefined no se escribe.
export const actualizarLocal = (uid, nombre, fn, porDefecto = null) =>
  enSerie(async () => {
    const actual = await leer(uid, nombre, porDefecto);
    const { valor, resultado } = fn(actual);
    if (valor !== undefined && uid && !bloqueados.has(uid)) {
      await AsyncStorage.setItem(clave(uid, nombre), JSON.stringify(valor));
    }
    return { valor: valor === undefined ? actual : valor, resultado };
  });

// Cierre de sesión: elimina todo lo guardado del usuario
export const borrarDatosUsuario = (uid) => {
  if (!uid) return Promise.resolve();
  bloqueados.add(uid);
  return enSerie(async () => {
    const prefijo = `${PREFIJO}${uid}:`;
    const claves = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefijo));
    claves.push(`${CLAVE_SNAPSHOTS_LEGADO}${uid}`);
    await AsyncStorage.multiRemove(claves);
  });
};

// Inicio de sesión: vuelve a permitir guardar datos del usuario
export const habilitarUsuario = (uid) => {
  if (uid) bloqueados.delete(uid);
};
