import React, { createContext, useContext, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

const ConnectivityContext = createContext(null);

// `isInternetReachable` es null mientras se comprueba: solo se considera sin
// conexión cuando NetInfo lo indica explícitamente.
const hayInternet = (estado) =>
  !!estado && estado.isConnected !== false && estado.isInternetReachable !== false;

export function ConnectivityProvider({ children }) {
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    let activo = true;
    const aplicar = (estado) => {
      if (activo) setEnLinea(hayInternet(estado));
    };

    NetInfo.fetch().then(aplicar).catch(() => {});
    const detener = NetInfo.addEventListener(aplicar);
    return () => {
      activo = false;
      detener();
    };
  }, []);

  return (
    <ConnectivityContext.Provider value={{ enLinea }}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error("useConnectivity debe usarse dentro de un ConnectivityProvider");
  }
  return context;
};
