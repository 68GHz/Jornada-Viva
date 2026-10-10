import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export const OPCIONES_FECHA = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Próximos 7 días" },
  { valor: "mes", etiqueta: "Este mes" },
];

export const FILTROS_INICIALES = {
  busqueda: "",
  categoria: null,
  lugar: null,
  fecha: "todas",
};

function Chip({ etiqueta, activo, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, activo && styles.chipActivo]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={etiqueta}
    >
      <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>
        {etiqueta}
      </Text>
    </TouchableOpacity>
  );
}

function GrupoChips({ titulo, opciones, seleccionado, onSeleccionar }) {
  return (
    <View style={styles.grupo}>
      <Text style={styles.grupoTitulo}>{titulo}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
      >
        {opciones.map((op) => (
          <Chip
            key={op.valor ?? "todos"}
            etiqueta={op.etiqueta}
            activo={seleccionado === op.valor}
            onPress={() => onSeleccionar(op.valor)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

export default function FiltrosJornadas({
  filtros,
  onCambiar,
  categorias,
  lugares,
}) {
  const [abierto, setAbierto] = useState(false);

  const activos =
    (filtros.categoria ? 1 : 0) +
    (filtros.lugar ? 1 : 0) +
    (filtros.fecha !== "todas" ? 1 : 0);
  const hayCriterios = activos > 0 || filtros.busqueda.length > 0;

  const actualizar = (campo, valor) => onCambiar({ ...filtros, [campo]: valor });

  return (
    <View style={styles.contenedor}>
      <View style={styles.fila}>
        <View style={styles.buscador}>
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.input}
            value={filtros.busqueda}
            onChangeText={(t) => actualizar("busqueda", t)}
            placeholder="Buscar jornada por nombre"
            placeholderTextColor={colors.textDisabled}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Buscar jornada por nombre"
          />
          {filtros.busqueda.length > 0 && (
            <TouchableOpacity
              onPress={() => actualizar("busqueda", "")}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Borrar búsqueda"
            >
              <Ionicons name="close-circle" size={18} color={colors.textDisabled} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.botonFiltros, (abierto || activos > 0) && styles.botonFiltrosActivo]}
          onPress={() => setAbierto((v) => !v)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ expanded: abierto }}
          accessibilityLabel={`Filtros${activos ? `, ${activos} activos` : ""}`}
        >
          <Ionicons
            name="options-outline"
            size={22}
            color={abierto || activos > 0 ? colors.white : colors.primary}
          />
          {activos > 0 && (
            <View style={styles.contador}>
              <Text style={styles.contadorTexto}>{activos}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {abierto && (
        <View style={styles.panel}>
          <GrupoChips
            titulo="Fecha"
            opciones={OPCIONES_FECHA}
            seleccionado={filtros.fecha}
            onSeleccionar={(v) => actualizar("fecha", v)}
          />
          {categorias.length > 0 && (
            <GrupoChips
              titulo="Categoría"
              opciones={[
                { valor: null, etiqueta: "Todas" },
                ...categorias.map((c) => ({ valor: c, etiqueta: c })),
              ]}
              seleccionado={filtros.categoria}
              onSeleccionar={(v) => actualizar("categoria", v)}
            />
          )}
          {lugares.length > 0 && (
            <GrupoChips
              titulo="Lugar"
              opciones={[
                { valor: null, etiqueta: "Todos" },
                ...lugares.map((l) => ({ valor: l, etiqueta: l })),
              ]}
              seleccionado={filtros.lugar}
              onSeleccionar={(v) => actualizar("lugar", v)}
            />
          )}
        </View>
      )}

      {hayCriterios && (
        <TouchableOpacity
          style={styles.limpiar}
          onPress={() => onCambiar(FILTROS_INICIALES)}
          accessibilityRole="button"
          accessibilityLabel="Limpiar búsqueda y filtros"
        >
          <Ionicons name="refresh-outline" size={14} color={colors.primary} />
          <Text style={styles.limpiarTexto}>Limpiar filtros</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buscador: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 8,
  },
  botonFiltros: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  botonFiltrosActivo: {
    backgroundColor: colors.primary,
  },
  contador: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  contadorTexto: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.white,
  },
  panel: {
    gap: 12,
  },
  grupo: {
    gap: 6,
  },
  grupoTitulo: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chips: {
    gap: 8,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
  },
  chipActivo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipTexto: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  chipTextoActivo: {
    color: colors.white,
  },
  limpiar: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    minHeight: 32,
  },
  limpiarTexto: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
});
