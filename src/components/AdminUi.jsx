import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

// Piezas de interfaz compartidas por las pantallas de administración (y los préstamos del gestor).
// Mismo lenguaje visual que el resto de la app: esquinas redondeadas, verde institucional y
// áreas táctiles de 44 px o más.

export function Chip({ etiqueta, activo, onPress, color = colors.primary, contador }) {
  return (
    <TouchableOpacity
      style={[estilos.chip, activo && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activo }}
      accessibilityLabel={contador != null ? `${etiqueta}: ${contador}` : etiqueta}
    >
      <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>{etiqueta}</Text>
      {contador != null && (
        <View style={[estilos.chipContador, activo && estilos.chipContadorActivo]}>
          <Text style={[estilos.chipContadorTexto, activo && estilos.chipTextoActivo]}>{contador}</Text>
        </View>
      )}
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
        <View style={estilos.errorFila} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <Text style={estilos.error}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// Campo de texto que resalta al enfocarlo
export function Entrada({ error, style, ...props }) {
  const [enfocado, setEnfocado] = useState(false);
  return (
    <TextInput
      style={[estilos.input, enfocado && estilos.inputEnfocado, !!error && estilos.inputError, style]}
      placeholderTextColor={colors.textDisabled}
      onFocus={() => setEnfocado(true)}
      onBlur={() => setEnfocado(false)}
      {...props}
    />
  );
}

// Buscador con lupa y botón para borrar
export function Buscador({ value, onChangeText, placeholder = "Buscar", accesibilidad }) {
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View style={[estilos.buscador, enfocado && estilos.inputEnfocado]}>
      <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
      <TextInput
        style={estilos.buscadorInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        accessibilityLabel={accesibilidad || placeholder}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText("")}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
        >
          <Ionicons name="close-circle" size={18} color={colors.textDisabled} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Boton({ texto, onPress, variante = "primario", cargando, deshabilitado, icono }) {
  const color = variante === "peligro" ? colors.error : colors.primary;
  const relleno = variante === "primario";
  const tinta = relleno ? colors.white : color;
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
        <ActivityIndicator color={tinta} />
      ) : (
        <>
          {!!icono && <Ionicons name={icono} size={20} color={tinta} />}
          <Text style={[estilos.botonTexto, { color: tinta }]}>{texto}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function Vacio({ texto, icono = "file-tray-outline" }) {
  return (
    <View style={estilos.vacio}>
      <Ionicons name={icono} size={44} color={colors.textDisabled} />
      <Text style={estilos.vacioTexto}>{texto}</Text>
    </View>
  );
}

export const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  titulo: { fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  seccion: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  texto: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  fila: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 14,
    paddingRight: 14,
  },
  chipTexto: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  chipTextoActivo: { color: colors.white },
  chipContador: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    marginRight: -6,
  },
  chipContadorActivo: { backgroundColor: "rgba(255,255,255,0.28)" },
  chipContadorTexto: { fontSize: 11, fontWeight: "800", color: colors.textSecondary },
  indicador: {
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  indicadorValor: { fontSize: 26, fontWeight: "800" },
  indicadorEtiqueta: { fontSize: 12, color: colors.textSecondary, textAlign: "center" },
  campo: { marginBottom: 10, gap: 6 },
  etiqueta: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputEnfocado: { borderColor: colors.primary, backgroundColor: "#FBFEFC" },
  inputError: { borderColor: colors.error },
  errorFila: { flexDirection: "row", alignItems: "center", gap: 4 },
  error: { color: colors.error, fontSize: 12, flex: 1 },
  buscador: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  buscadorInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 8 },
  boton: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  botonTexto: { fontSize: 15, fontWeight: "800" },
  vacio: { alignItems: "center", padding: 28, gap: 12 },
  vacioTexto: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
});
