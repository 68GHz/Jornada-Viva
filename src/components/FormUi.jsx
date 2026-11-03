import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

// Piezas de los formularios de alta/edición (mismo diseño que el formulario de jornada):
// encabezado verde con ícono y tarjetas de sección.

export function IntroForm({ icono, titulo, texto }) {
  return (
    <View style={styles.intro}>
      <View style={styles.introIcono}>
        <Ionicons name={icono} size={26} color={colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.introTitulo}>{titulo}</Text>
        {!!texto && <Text style={styles.introTexto}>{texto}</Text>}
      </View>
    </View>
  );
}

export function Seccion({ icono, titulo, subtitulo, children }) {
  return (
    <View style={styles.seccion}>
      <View style={styles.cabecera}>
        <View style={styles.icono}>
          <Ionicons name={icono} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>{titulo}</Text>
          {!!subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 16,
  },
  introIcono: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitulo: { fontSize: 20, fontWeight: "800", color: colors.white },
  introTexto: { fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.88)", marginTop: 2 },
  seccion: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 12 },
  icono: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  titulo: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  subtitulo: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
});
