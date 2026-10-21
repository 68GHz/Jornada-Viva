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
    <TouchableOpacity
      style={[styles.contenedor, !leida && styles.noLeida]}
      onPress={() => onPress && onPress(notificacion)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}, ${mensaje}`}
    >
      <View style={[styles.iconoContenedor, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={iconName} size={24} color={iconColor} />
      </View>

      <View style={styles.contenido}>
        <View style={styles.cabecera}>
          <View style={[styles.badge, { backgroundColor: `${tipoColor}20` }]}>
            <Text style={[styles.badgeTexto, { color: tipoColor }]}>{tipoLabel}</Text>
          </View>
          <Text style={styles.tiempo}>{tiempoRelativo}</Text>
        </View>

        <Text style={[styles.titulo, !leida && styles.tituloNoLeido]}>
          {titulo}
        </Text>
        <Text style={styles.mensaje} numberOfLines={3}>
          {mensaje}
        </Text>
      </View>

      <View style={styles.acciones}>
        {!leida && (
          <TouchableOpacity
            style={styles.botonIcono}
            onPress={() => onMarcarLeida && onMarcarLeida(notificacion.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Marcar como leída"
          >
            <Ionicons name="checkmark-done" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.botonIcono}
          onPress={() => onEliminar && onEliminar(notificacion.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Eliminar notificación"
        >
          <Ionicons name="trash-outline" size={18} color={colors.textDisabled} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    alignItems: "flex-start",
    gap: 12,
  },
  noLeida: {
    backgroundColor: colors.primaryPale,
    borderColor: colors.primaryLight,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  iconoContenedor: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  contenido: {
    flex: 1,
    gap: 4,
  },
  cabecera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeTexto: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  tiempo: {
    fontSize: 11,
    color: colors.textDisabled,
  },
  titulo: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  tituloNoLeido: {
    fontWeight: "800",
    color: colors.textPrimary,
  },
  mensaje: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  acciones: {
    flexDirection: "column",
    gap: 8,
    alignItems: "center",
  },
  botonIcono: {
    padding: 4,
  },
});

