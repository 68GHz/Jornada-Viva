import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <StatusBar style="light" />
        <AppNavigator />
      </NotificationProvider>
    </AuthProvider>
  );
}