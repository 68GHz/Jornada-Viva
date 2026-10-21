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
import ConnectionBanner from "../components/ConnectionBanner";
import { navigationRef } from "./navigationRef";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { useNotifications } from "../context/NotificationContext";

const Stack = createNativeStackNavigator();

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
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: "700", fontSize: 17 },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          headerTitle: () => (
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
          ),
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

export default function AppNavigator() {
  const { usuario, cargando } = useAuth();

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
          <View style={{ flex: 1 }}>{usuario ? <AppStack /> : <AuthStack />}</View>
          <ConnectionBanner />
        </View>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}