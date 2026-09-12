import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../theme/colors";

export default function HomeScreen({ navigation }) {
  const { usuario, cerrarSesion } = useAuth();

  const nombre = usuario?.displayName || usuario?.email || "Usuario";

  return (
    <ScrollView style={styles.contenedor} contentContainerStyle={styles.contenido}>
      {/* Saludo */}
      <View style={styles.saludo}>
        <View style={styles.saludoFila}>
          <Ionicons name="hand-right" size={22} color={colors.primary} />
          <Text style={styles.bienvenida}>Hola, {nombre.split(" ")[0]}</Text>
        </View>
        <Text style={styles.descripcion}>
          Aquí puedes explorar las jornadas comunitarias disponibles e inscribirte
          de forma rápida y segura.
        </Text>
      </View>

      {/* Tarjetas de acceso rápido */}
      <View style={styles.tarjetas}>
        <TouchableOpacity
          style={styles.tarjetaPrincipal}
          onPress={() => navigation.navigate("JornadasList")}
          activeOpacity={0.85}
        >
          <Ionicons name="list-circle-outline" size={40} color={colors.white} />
          <Text style={styles.tarjetaTitulo}>Ver jornadas</Text>
          <Text style={styles.tarjetaDescripcion}>
            Explora todas las jornadas disponibles en tu comunidad
          </Text>
        </TouchableOpacity>
      </View>

      {/* Info de sesión */}
      <View style={styles.sesionInfo}>
        <Text style={styles.sesionTexto}>
          Sesión activa: {usuario?.email}
        </Text>
      </View>

      {/* Cerrar sesión */}
      <TouchableOpacity
        style={styles.botonSalir}
        onPress={cerrarSesion}
        activeOpacity={0.85}
      >
        <Text style={styles.botonSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenido: {
    padding: 20,
    gap: 20,
  },
  saludo: {
    backgroundColor: colors.primaryPale,
    borderRadius: 14,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  saludoFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  bienvenida: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
  },
  descripcion: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  tarjetas: {
    gap: 12,
  },
  tarjetaPrincipal: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  tarjetaTitulo: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.white,
  },
  tarjetaDescripcion: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 18,
  },
  sesionInfo: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sesionTexto: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  botonSalir: {
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  botonSalirTexto: {
    color: colors.error,
    fontSize: 15,
    fontWeight: "700",
  },
});