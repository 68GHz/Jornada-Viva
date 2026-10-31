import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { formatearFecha } from "../utils/jornadaFecha";
import { ETIQUETA_ESTADO_PRESTAMO, ETIQUETA_TIPO_OBJETO, estadoPrestamo } from "../utils/prestamos";

const COLOR_ESTADO = {
  vigente: colors.success,
  por_vencer: colors.accent,
  vencido: colors.error,
  devuelto: colors.textDisabled,
};
const ICONO_TIPO = { libro: "book-outline", equipo: "hardware-chip-outline", material: "cube-outline" };

// Tarjeta de un préstamo (la usan la lista del estudiante y la del gestor). `quien` muestra a quién se
// prestó (para el gestor); `children` permite agregar acciones (p. ej. «Marcar devuelto»).
export default function PrestamoItem({ prestamo, ahora, quien = false, children }) {
  const estado = estadoPrestamo(prestamo, ahora);
  const color = COLOR_ESTADO[estado];
  return (
    <View style={styles.tarjeta} accessibilityLabel={`${prestamo.nombre}, ${ETIQUETA_ESTADO_PRESTAMO[estado]}`}>
      <View style={[styles.barra, { backgroundColor: color }]} />
      <View style={styles.contenido}>
        <View style={styles.fila}>
          <Ionicons name={ICONO_TIPO[prestamo.tipo] || "cube-outline"} size={18} color={colors.primary} />
          <Text style={styles.titulo} numberOfLines={2}>
            {prestamo.nombre}
          </Text>
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeTexto}>{ETIQUETA_ESTADO_PRESTAMO[estado]}</Text>
          </View>
        </View>
        <Text style={styles.detalle}>
          {ETIQUETA_TIPO_OBJETO[prestamo.tipo] || "Objeto"} · código {prestamo.codigo}
        </Text>
        {quien && (
          <Text style={styles.detalle}>
            Prestado a {prestamo.nombreUsuario || prestamo.emailUsuario || "un estudiante"}
          </Text>
        )}
        <Text style={styles.detalle}>
          {estado === "devuelto" && prestamo.devueltoEn
            ? `Devuelto el ${formatearFecha(prestamo.devueltoEn, "D [de] MMMM [de] YYYY")}`
            : `Devolver antes del ${formatearFecha(prestamo.vence, "D [de] MMMM [de] YYYY, h:mm A")}`}
        </Text>
        {!!prestamo.nota && <Text style={styles.nota}>{prestamo.nota}</Text>}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  barra: { width: 5 },
  contenido: { flex: 1, padding: 14, gap: 4 },
  fila: { flexDirection: "row", alignItems: "center", gap: 8 },
  titulo: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTexto: { fontSize: 10, fontWeight: "700", color: colors.white },
  detalle: { fontSize: 12, color: colors.textSecondary },
  nota: { fontSize: 12, color: colors.textSecondary, fontStyle: "italic" },
});
