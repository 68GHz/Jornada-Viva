import React, { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

// Lista desplegable: un campo que al tocarlo abre una hoja inferior con las opciones.
// opciones: [{ valor, etiqueta, aviso? }]  (`aviso` marca una opción con una advertencia, p. ej. «ocupado»)
export default function SelectDesplegable({
  valor,
  opciones,
  onChange,
  titulo,
  placeholder = "Seleccionar",
  textoValor, // texto a mostrar si el valor no está entre las opciones
  error = false,
  icono,
  accesibilidad,
}) {
  const [abierto, setAbierto] = useState(false);
  const insets = useSafeAreaInsets();
  const elegida = opciones.find((o) => o.valor === valor);
  const texto = elegida?.etiqueta ?? textoValor;

  const elegir = (opcion) => {
    setAbierto(false);
    onChange(opcion.valor);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.campo, error && styles.campoError]}
        onPress={() => setAbierto(true)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${accesibilidad || titulo}: ${texto || "sin seleccionar"}`}
        accessibilityHint="Abre la lista de opciones"
      >
        {!!icono && <Ionicons name={icono} size={18} color={colors.primary} />}
        <Text style={[styles.valor, !texto && styles.placeholder]} numberOfLines={1}>
          {texto || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={styles.fondo} onPress={() => setAbierto(false)} accessibilityLabel="Cerrar lista" />
        <View style={[styles.hoja, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.asa} />
          <Text style={styles.titulo}>{titulo}</Text>
          <FlatList
            data={opciones}
            keyExtractor={(o) => String(o.valor)}
            style={styles.lista}
            initialScrollIndex={undefined}
            renderItem={({ item }) => {
              const activa = item.valor === valor;
              return (
                <TouchableOpacity
                  style={[styles.opcion, activa && styles.opcionActiva]}
                  onPress={() => elegir(item)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activa }}
                  accessibilityLabel={item.aviso ? `${item.etiqueta}, ${item.aviso}` : item.etiqueta}
                >
                  <Text style={[styles.opcionTexto, activa && styles.opcionTextoActiva]}>{item.etiqueta}</Text>
                  {!!item.aviso && !activa && (
                    <View style={styles.aviso}>
                      <Ionicons name="alert-circle" size={13} color={colors.warning} />
                      <Text style={styles.avisoTexto}>{item.aviso}</Text>
                    </View>
                  )}
                  {activa && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  campo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  campoError: { borderColor: colors.error },
  valor: { flex: 1, fontSize: 15, color: colors.textPrimary },
  placeholder: { color: colors.textDisabled },
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  hoja: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  asa: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  titulo: { fontSize: 17, fontWeight: "800", color: colors.textPrimary, marginBottom: 8 },
  lista: { flexGrow: 0 },
  opcion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  opcionActiva: { backgroundColor: colors.primaryPale },
  opcionTexto: { flex: 1, fontSize: 15, color: colors.textPrimary },
  opcionTextoActiva: { fontWeight: "800", color: colors.primary },
  aviso: { flexDirection: "row", alignItems: "center", gap: 4 },
  avisoTexto: { fontSize: 11, fontWeight: "700", color: colors.warning },
});
