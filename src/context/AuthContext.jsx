import React, { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import {
  borrarDatosUsuario,
  guardarLocal,
  habilitarUsuario,
  leerLocal,
} from "../services/localStore";
import { ROLES, esMaestro, normalizarRol } from "../utils/roles";

const AuthContext = createContext(null);

// Si no se logra leer el perfil (sin conexión y sin rol guardado) se entra como estudiante
const ESPERA_MAXIMA_PERFIL_MS = 6000;

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [rol, setRol] = useState(ROLES.ESTUDIANTE);
  // uid del usuario cuyo rol ya se conoce: así, en el mismo render en que aparece el
  // usuario, `cargando` ya es verdadero (no se ve la pantalla equivocada ni un instante)
  const [perfilListoPara, setPerfilListoPara] = useState(null);

  const uid = usuario?.uid;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      // Permite guardar datos locales del usuario que acaba de iniciar sesión
      if (user) habilitarUsuario(user.uid);
      setUsuario(user);
      setCargandoSesion(false);
    });
    return unsub;
  }, []);

  // Rol del usuario (users/{uid}.rol). Solo sirve para decidir qué pantallas mostrar:
  // lo que realmente se permite lo decide firestore.rules. Se escucha en vivo para que
  // un cambio de rol se aplique sin reiniciar y se guarda para abrir sin conexión.
  useEffect(() => {
    setRol(ROLES.ESTUDIANTE);
    if (!uid) {
      setPerfilListoPara(null); // al volver a entrar se vuelve a leer el rol
      return;
    }

    let activo = true;
    let recibidoDelServidor = false;

    leerLocal(uid, "perfil", null).then((guardado) => {
      if (!activo || recibidoDelServidor || !guardado) return;
      setRol(normalizarRol(guardado.rol));
      setPerfilListoPara(uid);
    });

    const temporizador = setTimeout(() => {
      if (activo) setPerfilListoPara(uid);
    }, ESPERA_MAXIMA_PERFIL_MS);

    const detener = onSnapshot(
      doc(db, "users", uid),
      (snapshot) => {
        // Sin conexión y sin el perfil en la caché de Firestore: se usa el rol guardado
        if (snapshot.metadata.fromCache && !snapshot.exists()) return;
        const nuevo = normalizarRol(snapshot.data()?.rol);
        setRol(nuevo);
        setPerfilListoPara(uid);
        if (!snapshot.metadata.fromCache) {
          recibidoDelServidor = true;
          guardarLocal(uid, "perfil", { rol: nuevo });
        }
      },
      (error) => {
        console.warn("No se pudo leer el perfil del usuario:", error);
        if (activo) setPerfilListoPara(uid);
      }
    );

    return () => {
      activo = false;
      clearTimeout(temporizador);
      detener();
    };
  }, [uid]);

  const registrar = async (nombre, email, password) => {
    const credencial = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credencial.user, { displayName: nombre });

    // Guardar perfil extendido en Firestore. Quien se registra siempre es estudiante:
    // el rol de maestro se asigna fuera de la app (ver README).
    await setDoc(doc(db, "users", credencial.user.uid), {
      uid: credencial.user.uid,
      nombre,
      email,
      rol: ROLES.ESTUDIANTE,
      creadoEn: serverTimestamp(),
    });

    setUsuario({ ...auth.currentUser });

    return credencial.user;
  };

  const iniciarSesion = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  // Al cerrar sesión se borran los datos guardados en el dispositivo (modo offline)
  const cerrarSesion = async () => {
    const uidActual = auth.currentUser?.uid;
    await signOut(auth);
    await borrarDatosUsuario(uidActual);
  };

  // `cargando` incluye el perfil: no se muestra ninguna pantalla hasta saber el rol
  const cargando = cargandoSesion || (!!uid && perfilListoPara !== uid);

  return (
    <AuthContext.Provider
      value={{
        usuario,
        cargando,
        rol,
        esMaestro: esMaestro(rol),
        registrar,
        iniciarSesion,
        cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
};
