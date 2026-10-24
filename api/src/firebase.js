import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Credenciales: FIREBASE_SERVICE_ACCOUNT (JSON o base64) o las predeterminadas del entorno
// (GOOGLE_APPLICATION_CREDENTIALS). Con FIRESTORE_EMULATOR_HOST no hacen falta.
export function credencial(texto) {
  if (!texto) return undefined;
  const json = texto.trim().startsWith("{") ? texto : Buffer.from(texto, "base64").toString("utf8");
  return cert(JSON.parse(json));
}

export function iniciarFirebase(config) {
  const credential = credencial(config.cuentaServicio);
  const app =
    getApps()[0] ??
    initializeApp({
      ...(config.proyecto ? { projectId: config.proyecto } : {}),
      // Sin clave explícita se usan las credenciales predeterminadas del entorno (o el emulador)
      ...(credential ? { credential } : {}),
    });
  return { app, db: getFirestore(app), auth: getAuth(app) };
}
