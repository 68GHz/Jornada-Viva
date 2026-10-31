import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { esUrlDeBanner } from "../utils/bannerJornada";

// Banner opcional de una jornada (enlace https a una imagen).
// Degrada de forma controlada: sin enlace válido, o si la imagen no carga (sin conexión y sin
// copia en el dispositivo, enlace roto), no ocupa espacio. Con `mensajeError` (formulario) muestra
// ese aviso en lugar de desaparecer.
export default function BannerJornada({ url, altura = 120, mensajeError, style }) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => setFallo(false), [url]);

  if (!esUrlDeBanner(url)) return null;
  if (fallo) {
    if (!mensajeError) return null;
    return (
      <View style={[styles.fallo, { height: altura }, style]} accessibilityRole="alert">
        <Ionicons name="image-outline" size={28} color={colors.textDisabled} />
        <Text style={styles.falloTexto}>{mensajeError}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={[styles.imagen, { height: altura }, style]}
      resizeMode="cover"
      onError={() => setFallo(true)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Banner de la jornada"
    />
  );
}

const styles = StyleSheet.create({
  imagen: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  fallo: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
  },
  falloTexto: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
