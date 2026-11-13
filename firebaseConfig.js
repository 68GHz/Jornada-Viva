import { initializeApp, getApps } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const firebaseConfig = {
  apiKey: "AIzaSyBo9lXsJmeTs1ZcdPpLpggp6x94orqXvJw",
  authDomain: "jornadaviva-476ff.firebaseapp.com",
  projectId: "jornadaviva-476ff",
  storageBucket: "jornadaviva-476ff.firebasestorage.app",
  messagingSenderId: "257986670996",
  appId: "1:257986670996:web:6a1d7751bac0246dac1f81"
};

// evitar inicialización duplicada en hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);