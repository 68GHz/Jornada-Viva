import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/es";

dayjs.extend(relativeTime);
dayjs.locale("es");

export default function NotificationItem({
  notificacion,
  onPress,
  onMarcarLeida,
  onEliminar,
}) {
  const { tipo, titulo, mensaje, leida, creadaEn } = notificacion;

  // Configuración de estilo e icono según el tipo de evento
  let iconName = "information-circle";
  let iconColor = colors.primary;
  let tipoLabel = "Actualización";
  let tipoColor = colors.primary;

  if (tipo === "cancelacion") {
    iconName = "close-circle";
    iconColor = colors.error;
    tipoLabel = "Cancelada";
    tipoColor = colors.error;
  } else if (tipo === "eliminacion") {
    iconName = "trash";
    iconColor = colors.error;
    tipoLabel = "Eliminada";
    tipoColor = colors.error;
  } else if (tipo === "reprogramacion") {
    iconName = "calendar";
    iconColor = "#D97706"; // Ámbar / naranja
    tipoLabel = "Reprogramada";
    tipoColor = "#D97706";
  } else if (tipo === "reactivacion") {
    iconName = "checkmark-circle";
    iconColor = colors.success;
    tipoLabel = "Reactivada";
    tipoColor = colors.success;
  }

  const tiempoRelativo = creadaEn
    ? dayjs(creadaEn).fromNow()
    : "Recientemente";

  return (
    <View style={[styles.contenedor, !leida && styles.noLeida]}>
      <TouchableOpacity
        style={styles.principal}
        onPress={() => onPress && onPress(notificacion)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${leida ? "" : "No leída. "}${titulo}, ${mensaje}`}
      >
        <View style={[styles.iconoContenedor, { backgroundColor: `${iconColor}1A` }]}>
          <Ionicons name={iconName} size={24} color={iconColor} />
          {!leida && <View style={styles.punto} />}
        </View>

        <View style={styles.contenido}>
          <View style={styles.cabecera}>
            <View style={[styles.badge, { backgroundColor: `${tipoColor}1A` }]}>
              <Text style={[styles.badgeTexto, { color: tipoColor }]}>{tipoLabel}</Text>
            </View>
            <Text style={styles.tiempo}>{tiempoRelativo}</Text>
          </View>

          <Text style={[styles.titulo, !leida && styles.tituloNoLeido]} numberOfLines={2}>
            {titulo}
          </Text>
          <Text style={styles.mensaje} numberOfLines={3}>
            {mensaje}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.acciones}>
        {!leida && (
          <TouchableOpacity
            style={styles.accion}
            onPress={() => onMarcarLeida && onMarcarLeida(notificacion.id)}
            accessibilityRole="button"
            accessibilityLabel="Marcar como leída"
          >
            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
            <Text style={[styles.accionTexto, { color: colors.primary }]}>Marcar como leída</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.accion, styles.accionEliminar]}
          onPress={() => onEliminar && onEliminar(notificacion.id)}
          accessibilityRole="button"
          accessibilityLabel="Eliminar notificación"
        >
          <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.accionTexto}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  noLeida: {
    borderColor: colors.primaryLight,
    backgroundColor: "#F3FAF6",
  },
  principal: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 14,
  },
  iconoContenedor: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  punto: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  contenido: { flex: 1, gap: 4 },
  cabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeTexto: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  tiempo: { fontSize: 11, color: colors.textSecondary },
  titulo: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, lineHeight: 20 },
  tituloNoLeido: { fontWeight: "800" },
  mensaje: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  acciones: {
    flexDirection: "row",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  accion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  accionEliminar: { marginLeft: 4 },
  accionTexto: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
});
