import React, { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { borrarDatosUsuario, habilitarUsuario } from "../services/localStore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      // Permite guardar datos locales del usuario que acaba de iniciar sesión
      if (user) habilitarUsuario(user.uid);
      setUsuario(user);
      setCargando(false);
    });
    return unsub;
  }, []);

  const registrar = async (nombre, email, password) => {
    const credencial = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credencial.user, { displayName: nombre });

    // Guardar perfil extendido en Firestore
    await setDoc(doc(db, "users", credencial.user.uid), {
      uid: credencial.user.uid,
      nombre,
      email,
      creadoEn: serverTimestamp(),
    });
    
    setUsuario({ ...auth.currentUser });

    return credencial.user;
  };

  const iniciarSesion = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  // Al cerrar sesión se borran los datos guardados en el dispositivo (modo offline)
  const cerrarSesion = async () => {
    const uid = auth.currentUser?.uid;
    await signOut(auth);
    await borrarDatosUsuario(uid);
  };

  return (
    <AuthContext.Provider value={{ usuario, cargando, registrar, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
};