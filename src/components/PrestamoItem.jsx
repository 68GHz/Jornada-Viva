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
const ICONO_TIPO = { libro: "book", equipo: "hardware-chip", material: "cube" };
const ICONO_ESTADO = {
  vigente: "time-outline",
  por_vencer: "alert-circle-outline",
  vencido: "warning-outline",
  devuelto: "checkmark-circle-outline",
};

// Card de un préstamo, idéntica para todos los roles. `quien` muestra a quién se prestó (gestor);
// `children` permite agregar acciones (p. ej. «Marcar devuelto»).
export default function PrestamoItem({ prestamo, ahora, quien = false, children }) {
  const estado = estadoPrestamo(prestamo, ahora);
  const color = COLOR_ESTADO[estado];
  const devuelto = estado === "devuelto";
  const etiqueta = ETIQUETA_ESTADO_PRESTAMO[estado];
  const textoFecha =
    devuelto && prestamo.devueltoEn
      ? `Devuelto el ${formatearFecha(prestamo.devueltoEn, "D [de] MMMM [de] YYYY")}`
      : `Devolver antes del ${formatearFecha(prestamo.vence, "D [de] MMMM, h:mm A")}`;

  return (
    <View
      style={[styles.tarjeta, devuelto && styles.tarjetaDevuelta]}
      accessible
      accessibilityLabel={`${prestamo.nombre}, ${etiqueta}. ${textoFecha}`}
    >
      <View style={styles.cabecera}>
        <View style={[styles.icono, { backgroundColor: `${color}1F` }]}>
          <Ionicons name={ICONO_TIPO[prestamo.tipo] || "cube"} size={22} color={devuelto ? colors.textSecondary : color} />
        </View>
        <View style={styles.textos}>
          <Text style={styles.titulo} numberOfLines={2}>
            {prestamo.nombre}
          </Text>
          <Text style={styles.detalle} numberOfLines={1}>
            {ETIQUETA_TIPO_OBJETO[prestamo.tipo] || "Objeto"} · {prestamo.codigo}
          </Text>
        </View>
        <View style={[styles.chip, { backgroundColor: color }]}>
          <Text style={styles.chipTexto}>{etiqueta}</Text>
        </View>
      </View>

      <View style={[styles.fecha, { backgroundColor: `${color}14` }]}>
        <Ionicons name={ICONO_ESTADO[estado]} size={18} color={devuelto ? colors.textSecondary : color} />
        <Text style={[styles.fechaTexto, { color: devuelto ? colors.textSecondary : colors.textPrimary }]}>
          {textoFecha}
        </Text>
      </View>

      {quien && (
        <View style={styles.quien}>
          <Ionicons name="person-outline" size={14} color={colors.primary} />
          <Text style={styles.quienTexto} numberOfLines={1}>
            Prestado a {prestamo.nombreUsuario || prestamo.emailUsuario || "un estudiante"}
          </Text>
        </View>
      )}

      {!!prestamo.nota && (
        <Text style={styles.nota} numberOfLines={3}>
          “{prestamo.nota}”
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  tarjetaDevuelta: { opacity: 0.75, elevation: 1 },
  cabecera: { flexDirection: "row", alignItems: "center", gap: 12 },
  icono: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 15, fontWeight: "800", color: colors.textPrimary, lineHeight: 20 },
  detalle: { fontSize: 12, color: colors.textSecondary, fontWeight: "500" },
  chip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  chipTexto: { fontSize: 10, fontWeight: "800", color: colors.white },
  fecha: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  fechaTexto: { flex: 1, fontSize: 13, fontWeight: "600" },
  quien: { flexDirection: "row", alignItems: "center", gap: 6 },
  quienTexto: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.textSecondary },
  nota: { fontSize: 12, color: colors.textSecondary, fontStyle: "italic", lineHeight: 17 },
});
