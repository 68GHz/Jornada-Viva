import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, Image, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import HomeScreen from "../screens/app/HomeScreen";
import JornadasListScreen from "../screens/app/JornadasListScreen";
import JornadaDetailScreen from "../screens/app/JornadaDetailScreen";
import MisJornadasScreen from "../screens/app/MisJornadasScreen";
import NotificationsScreen from "../screens/app/NotificationsScreen";
import SincronizacionScreen from "../screens/app/SincronizacionScreen";
import MaestroHomeScreen from "../screens/maestro/MaestroHomeScreen";
import JornadaFormScreen from "../screens/maestro/JornadaFormScreen";
import JornadaAdminScreen from "../screens/maestro/JornadaAdminScreen";
import AdminDashboardScreen from "../screens/admin/AdminDashboardScreen";
import UsuariosListScreen from "../screens/admin/UsuariosListScreen";
import UsuarioDetalleScreen from "../screens/admin/UsuarioDetalleScreen";
import UsuarioFormScreen from "../screens/admin/UsuarioFormScreen";
import AdminJornadasScreen from "../screens/admin/AdminJornadasScreen";
import ReportesScreen from "../screens/admin/ReportesScreen";
import AuditoriaScreen from "../screens/admin/AuditoriaScreen";
import AdminPerfilScreen from "../screens/admin/AdminPerfilScreen";
import ConnectionBanner from "../components/ConnectionBanner";
import { navigationRef } from "./navigationRef";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { useNotifications } from "../context/NotificationContext";

const Stack = createNativeStackNavigator();

const opcionesDeCabecera = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: "700", fontSize: 17 },
};

function TituloMarca() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View
        style={{
          backgroundColor: colors.white,
          borderRadius: 6,
          paddingHorizontal: 6,
          paddingVertical: 4,
        }}
      >
        <Image
          source={require("../../assets/Horizontal-tdea.png")}
          style={{ width: 62, height: 16 }}
          resizeMode="contain"
        />
      </View>
      <Text style={{ fontWeight: "700", fontSize: 17, color: colors.white }}>
        Jornada Viva
      </Text>
    </View>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  const { cerrarSesion } = useAuth();
  const { noLeidasCount } = useNotifications();

  return (
    <Stack.Navigator screenOptions={opcionesDeCabecera}>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          headerTitle: () => <TituloMarca />,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate("Notifications")}
              style={{ padding: 4, position: "relative" }}
              accessibilityRole="button"
              accessibilityLabel="Notificaciones"
            >
              <Ionicons name="notifications-outline" size={24} color={colors.white} />
              {noLeidasCount > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    backgroundColor: colors.error,
                    borderRadius: 9,
                    minWidth: 18,
                    height: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text
                    style={{
                      color: colors.white,
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  >
                    {noLeidasCount > 9 ? "9+" : noLeidasCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="JornadasList"
        component={JornadasListScreen}
        options={{ title: "Jornadas Disponibles" }}
      />
      <Stack.Screen
        name="MisJornadas"
        component={MisJornadasScreen}
        options={{ title: "Mis jornadas" }}
      />
      <Stack.Screen
        name="JornadaDetail"
        component={JornadaDetailScreen}
        options={{ title: "Detalle de Jornada" }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Notificaciones" }}
      />
      <Stack.Screen
        name="Sincronizacion"
        component={SincronizacionScreen}
        options={{ title: "Sincronización" }}
      />
    </Stack.Navigator>
  );
}

// Gestor de jornadas: administra las jornadas que tiene asignadas
function GestorStack() {
  return (
    <Stack.Navigator screenOptions={opcionesDeCabecera}>
      <Stack.Screen
        name="MaestroHome"
        component={MaestroHomeScreen}
        options={{ headerTitle: () => <TituloMarca /> }}
      />
      <Stack.Screen
        name="JornadaForm"
        component={JornadaFormScreen}
        options={({ route }) => ({
          title: route.params?.jornadaId ? "Editar jornada" : "Crear jornada",
        })}
      />
      <Stack.Screen
        name="JornadaAdmin"
        component={JornadaAdminScreen}
        options={{ title: "Administrar jornada" }}
      />
    </Stack.Navigator>
  );
}

// Administrador: las rutas del módulo de administración solo existen para este rol
// (además, firestore.rules valida cada operación en el servidor)
function AdminStack() {
  return (
    <Stack.Navigator screenOptions={opcionesDeCabecera}>
      <Stack.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ headerTitle: () => <TituloMarca /> }}
      />
      <Stack.Screen
        name="UsuariosList"
        component={UsuariosListScreen}
        options={({ route }) => ({
          title: route.params?.rol === "gestor" ? "Gestores de jornadas" : "Usuarios",
        })}
      />
      <Stack.Screen name="UsuarioDetalle" component={UsuarioDetalleScreen} options={{ title: "Detalle de usuario" }} />
      <Stack.Screen name="UsuarioForm" component={UsuarioFormScreen} options={{ title: "Crear cuenta" }} />
      <Stack.Screen name="AdminJornadas" component={AdminJornadasScreen} options={{ title: "Jornadas" }} />
      <Stack.Screen
        name="JornadaForm"
        component={JornadaFormScreen}
        options={({ route }) => ({
          title: route.params?.jornadaId ? "Editar jornada" : "Crear jornada",
        })}
      />
      <Stack.Screen name="JornadaAdmin" component={JornadaAdminScreen} options={{ title: "Administrar jornada" }} />
      <Stack.Screen name="Reportes" component={ReportesScreen} options={{ title: "Estadísticas y reportes" }} />
      <Stack.Screen name="Auditoria" component={AuditoriaScreen} options={{ title: "Auditoría" }} />
      <Stack.Screen name="AdminPerfil" component={AdminPerfilScreen} options={{ title: "Mi perfil" }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { usuario, cargando, esGestor, esAdministrador } = useAuth();

  if (cargando) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {!usuario ? (
              <AuthStack />
            ) : esAdministrador ? (
              <AdminStack />
            ) : esGestor ? (
              <GestorStack />
            ) : (
              <AppStack />
            )}
          </View>
          <ConnectionBanner />
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}