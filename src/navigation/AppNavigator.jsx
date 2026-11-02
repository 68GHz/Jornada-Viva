import React, { useCallback, useState } from "react";
import { NavigationContainer, useFocusEffect } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, Image, ActivityIndicator } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AjustesScreen from "../screens/app/AjustesScreen";
import HomeScreen from "../screens/app/HomeScreen";
import JornadaDetailScreen from "../screens/app/JornadaDetailScreen";
import MisJornadasScreen from "../screens/app/MisJornadasScreen";
import NotificationsScreen from "../screens/app/NotificationsScreen";
import SincronizacionScreen from "../screens/app/SincronizacionScreen";
import EscanearAsistenciaScreen from "../screens/app/EscanearAsistenciaScreen";
import MisPrestamosScreen from "../screens/app/MisPrestamosScreen";
import PrestamosScreen from "../screens/maestro/PrestamosScreen";
import PrestamoFormScreen from "../screens/maestro/PrestamoFormScreen";
import MaestroHomeScreen from "../screens/maestro/MaestroHomeScreen";
import JornadaFormScreen from "../screens/maestro/JornadaFormScreen";
import JornadaAdminScreen from "../screens/maestro/JornadaAdminScreen";
import AdminDashboardScreen from "../screens/admin/AdminDashboardScreen";
import AdminAdministrarScreen from "../screens/admin/AdminAdministrarScreen";
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
const Tab = createBottomTabNavigator();

const opcionesDeCabecera = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: "700", fontSize: 17 },
  headerTitleAlign: "center",
  headerBackButtonDisplayMode: "minimal",
};

function LogoInstitucional() {
  return (
    <View style={{ backgroundColor: colors.white, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 }}>
      <Image
        source={require("../../assets/Horizontal-tdea.png")}
        style={{ width: 62, height: 16 }}
        resizeMode="contain"
        accessibilityLabel="Logo institucional"
      />
    </View>
  );
}

// Pantallas raíz de cada rol: logo institucional a la izquierda y nombre del aplicativo al centro
const opcionesRaiz = {
  headerTitle: "Jornada Viva",
  headerLeft: () => <LogoInstitucional />,
};

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

const ICONOS_TAB = {
  Inicio: ["home", "home-outline"],
  MisJornadas: ["calendar", "calendar-outline"],
  MisPrestamos: ["library", "library-outline"],
  Notifications: ["notifications", "notifications-outline"],
  Ajustes: ["settings", "settings-outline"],
};

// Opciones de la barra inferior (mismo diseño para estudiante y gestor)
function opcionesBarraInferior(iconos, route, insets) {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textDisabled,
    tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      height: 58 + insets.bottom,
      paddingBottom: insets.bottom + 4,
      paddingTop: 6,
    },
    tabBarIcon: ({ focused, color }) => (
      <Ionicons name={iconos[route.name][focused ? 0 : 1]} size={23} color={color} />
    ),
  };
}

// Barra inferior del estudiante
function TabsEstudiante() {
  const { noLeidasCount } = useNotifications();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="Inicio"
      screenOptions={({ route }) => opcionesBarraInferior(ICONOS_TAB, route, insets)}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen name="MisPrestamos" component={MisPrestamosScreen} options={{ tabBarLabel: "Préstamos" }} />
      <Tab.Screen name="MisJornadas" component={MisJornadasScreen} options={{ tabBarLabel: "Jornadas" }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarLabel: "Avisos",
          tabBarBadge: noLeidasCount > 0 ? (noLeidasCount > 9 ? "9+" : noLeidasCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.error, color: colors.white, fontSize: 10 },
        }}
      />
      <Tab.Screen name="Ajustes" component={AjustesScreen} />
    </Tab.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={opcionesDeCabecera}>
      <Stack.Screen
        name="Tabs"
        component={TabsEstudiante}
        options={opcionesRaiz}
      />
      <Stack.Screen name="JornadaDetail" component={JornadaDetailScreen} options={{ title: "Detalle de Jornada" }} />
      <Stack.Screen name="Sincronizacion" component={SincronizacionScreen} options={{ title: "Sincronización" }} />
      <Stack.Screen name="EscanearAsistencia" component={EscanearAsistenciaScreen} options={{ title: "Escanear Asistencia" }} />
    </Stack.Navigator>
  );
}

// Crear jornada como pestaña: se reinicia al salir para que el formulario vuelva a estar vacío
function CrearJornadaTab(props) {
  const [clave, setClave] = useState(0);
  useFocusEffect(useCallback(() => () => setClave((k) => k + 1), []));
  return <JornadaFormScreen key={clave} {...props} />;
}

const ICONOS_TAB_GESTOR = {
  Inicio: ["home", "home-outline"],
  CrearJornada: ["add-circle", "add-circle-outline"],
  Prestamos: ["library", "library-outline"],
  Ajustes: ["settings", "settings-outline"],
};

// Barra inferior del gestor: mismo diseño que la del estudiante
function TabsGestor() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      initialRouteName="Inicio"
      screenOptions={({ route }) => opcionesBarraInferior(ICONOS_TAB_GESTOR, route, insets)}
    >
      <Tab.Screen name="Inicio" component={MaestroHomeScreen} />
      <Tab.Screen name="CrearJornada" component={CrearJornadaTab} options={{ tabBarLabel: "Crear" }} />
      <Tab.Screen name="Prestamos" component={PrestamosScreen} options={{ tabBarLabel: "Préstamos" }} />
      <Tab.Screen name="Ajustes" component={AjustesScreen} />
    </Tab.Navigator>
  );
}

// Gestor de jornadas: administra las jornadas que tiene asignadas
function GestorStack() {
  return (
    <Stack.Navigator screenOptions={opcionesDeCabecera}>
      <Stack.Screen name="Tabs" component={TabsGestor} options={opcionesRaiz} />
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
      <Stack.Screen
        name="Sincronizacion"
        component={SincronizacionScreen}
        options={{ title: "Sincronización" }}
      />
      <Stack.Screen name="PrestamoForm" component={PrestamoFormScreen} options={{ title: "Registrar préstamo" }} />
    </Stack.Navigator>
  );
}

const ICONOS_TAB_ADMIN = {
  Inicio: ["home", "home-outline"],
  Administrar: ["grid", "grid-outline"],
  Ajustes: ["settings", "settings-outline"],
};

// Barra inferior del administrador: mismo diseño que las de los demás roles
function TabsAdmin() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      initialRouteName="Inicio"
      screenOptions={({ route }) => opcionesBarraInferior(ICONOS_TAB_ADMIN, route, insets)}
    >
      <Tab.Screen name="Inicio" component={AdminDashboardScreen} />
      <Tab.Screen name="Administrar" component={AdminAdministrarScreen} />
      <Tab.Screen name="Ajustes" component={AjustesScreen} />
    </Tab.Navigator>
  );
}

// Administrador: las rutas del módulo de administración solo existen para este rol
// (además, firestore.rules valida cada operación en el servidor)
function AdminStack() {
  return (
    <Stack.Navigator screenOptions={opcionesDeCabecera}>
      <Stack.Screen name="Tabs" component={TabsAdmin} options={opcionesRaiz} />
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
      <Stack.Screen name="Sincronizacion" component={SincronizacionScreen} options={{ title: "Sincronización" }} />
      <Stack.Screen name="Prestamos" component={PrestamosScreen} options={{ title: "Préstamos de objetos" }} />
      <Stack.Screen name="PrestamoForm" component={PrestamoFormScreen} options={{ title: "Registrar préstamo" }} />
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