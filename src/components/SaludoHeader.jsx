import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function saludoSegunHora() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// Bloque de saludo del inicio, idéntico para todos los roles. `rol` (opcional) muestra una etiqueta.
export default function SaludoHeader({ nombre, texto, rol }) {
  return (
    <View style={styles.saludo} accessibilityRole="header">
      <View style={styles.circuloGrande} />
      <View style={styles.circuloPequeno} />
      <View style={styles.fila}>
        <Text style={styles.hora}>{saludoSegunHora()}</Text>
        {!!rol && (
          <View style={styles.rol}>
            <Text style={styles.rolTexto}>{rol}</Text>
          </View>
        )}
      </View>
      <Text style={styles.nombre} numberOfLines={1}>
        {nombre}
      </Text>
      {!!texto && <Text style={styles.texto}>{texto}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  saludo: {
    backgroundColor: colors.primary,    
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    overflow: "hidden",
    gap: 2,
  },
  circuloGrande: {
    position: "absolute",
    right: -40,
    top: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  circuloPequeno: {
    position: "absolute",
    right: 75,
    bottom: 25,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(245,166,35,0.25)",
  },
  fila: { flexDirection: "row", alignItems: "center", gap: 8 },
  hora: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  rol: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  rolTexto: { fontSize: 11, fontWeight: "700", color: colors.white },
  nombre: { fontSize: 28, fontWeight: "800", color: colors.white },
  texto: { marginTop: 6, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.88)", maxWidth: 300 },
});
