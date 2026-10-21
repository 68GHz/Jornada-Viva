import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import { ConnectivityProvider } from "./src/context/ConnectivityContext";
import { SyncProvider } from "./src/context/SyncContext";
import { JornadasProvider } from "./src/context/JornadasContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  return (
    <AuthProvider>
      <ConnectivityProvider>
        <SyncProvider>
          <JornadasProvider>
            <NotificationProvider>
              <StatusBar style="light" />
              <AppNavigator />
            </NotificationProvider>
          </JornadasProvider>
        </SyncProvider>
      </ConnectivityProvider>
    </AuthProvider>
  );
}