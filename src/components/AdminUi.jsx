import React from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors } from "../theme/colors";

// Piezas de interfaz compartidas por las pantallas del módulo de administración

export function Chip({ etiqueta, activo, onPress, color = colors.primary }) {
  return (
    <TouchableOpacity
      style={[estilos.chip, activo && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activo }}
      accessibilityLabel={etiqueta}
    >
      <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>{etiqueta}</Text>
    </TouchableOpacity>
  );
}

export function Indicador({ valor, etiqueta, color = colors.primary }) {
  return (
    <View style={estilos.indicador} accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={[estilos.indicadorValor, { color }]}>{valor}</Text>
      <Text style={estilos.indicadorEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

export function Campo({ etiqueta, error, children }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      {children}
      {!!error && (
        <Text style={estilos.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

export function Entrada({ error, ...props }) {
  return (
    <TextInput
      style={[estilos.input, !!error && estilos.inputError]}
      placeholderTextColor={colors.textDisabled}
      {...props}
    />
  );
}

export function Boton({ texto, onPress, variante = "primario", cargando, deshabilitado }) {
  const color = variante === "peligro" ? colors.error : colors.primary;
  const relleno = variante === "primario";
  return (
    <TouchableOpacity
      style={[
        estilos.boton,
        { borderColor: color, backgroundColor: relleno ? color : colors.surface },
        (deshabilitado || cargando) && { opacity: 0.55 },
      ]}
      onPress={onPress}
      disabled={deshabilitado || cargando}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: !!(deshabilitado || cargando) }}
    >
      {cargando ? (
        <ActivityIndicator color={relleno ? colors.white : color} />
      ) : (
        <Text style={[estilos.botonTexto, { color: relleno ? colors.white : color }]}>{texto}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Vacio({ texto }) {
  return (
    <View style={estilos.vacio}>
      <Text style={estilos.vacioTexto}>{texto}</Text>
    </View>
  );
}

export const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titulo: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  seccion: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  texto: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  fila: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  chipTextoActivo: { color: colors.white },
  indicador: {
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  indicadorValor: { fontSize: 26, fontWeight: "800" },
  indicadorEtiqueta: { fontSize: 12, color: colors.textSecondary, textAlign: "center" },
  campo: { marginBottom: 10 },
  etiqueta: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputError: { borderColor: colors.error },
  error: { color: colors.error, fontSize: 12, marginTop: 4 },
  boton: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  botonTexto: { fontSize: 15, fontWeight: "700" },
  vacio: { alignItems: "center", padding: 28 },
  vacioTexto: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
});
