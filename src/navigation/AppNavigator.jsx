import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, Image, ActivityIndicator } from "react-native";

import { useAuth } from "../context/AuthContext";
import { colors } from "../theme/colors";

import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import HomeScreen from "../screens/app/HomeScreen";
import JornadasListScreen from "../screens/app/JornadasListScreen";
import JornadaDetailScreen from "../screens/app/JornadaDetailScreen";

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
        options={{
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
        }}
      />
      <Stack.Screen
        name="JornadasList"
        component={JornadasListScreen}
        options={{ title: "Jornadas Disponibles" }}
      />
      <Stack.Screen
        name="JornadaDetail"
        component={JornadaDetailScreen}
        options={{ title: "Detalle de Jornada" }}
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
    <NavigationContainer>
      {usuario ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}