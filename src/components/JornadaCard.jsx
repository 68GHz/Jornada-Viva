import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { formatearFecha, formatearHora } from "../utils/jornadaFecha";
import { conteoPlural } from "../utils/plural";
import BannerJornada from "./BannerJornada";

// `estado` (opcional): { texto, color } reemplaza el badge de cupos,
// útil cuando se lista la inscripción del usuario (ej. "Inscrito").
// `extra` (opcional): texto de una línea adicional (ej. los cupos para el maestro).
export default function JornadaCard({ jornada, onPress, estado, extra }) {
  const cuposRestantes = jornada.cuposTotales - jornada.cuposOcupados;
  const sinCupos = !estado && cuposRestantes <= 0;
  const pocosCupos = cuposRestantes > 0 && cuposRestantes <= 10;

  return (
    <TouchableOpacity
      style={[styles.card, sinCupos && styles.cardAgotada]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${jornada.titulo}${estado ? `, ${estado.texto}` : ""}`}
    >
      {/* Barra lateral de color */}
      <View
        style={[
          styles.barraLateral,
          sinCupos && styles.barraAgotada,
          estado && { backgroundColor: estado.color },
        ]}
      />

      <View style={styles.contenido}>
        {/* Banner opcional: si no hay enlace o no carga, no ocupa espacio */}
        <BannerJornada url={jornada.bannerUrl} altura={110} />

        {/* Encabezado */}
        <View style={styles.fila}>
          <Text style={styles.titulo} numberOfLines={2}>
            {jornada.titulo}
          </Text>
          {estado ? (
            <View style={[styles.badge, { backgroundColor: estado.color }]}>
              <Text style={styles.badgeTexto}>{estado.texto}</Text>
            </View>
          ) : sinCupos ? (
            <View style={[styles.badge, styles.badgeAgotado]}>
              <Text style={styles.badgeTexto}>Sin cupos</Text>
            </View>
          ) : pocosCupos ? (
            <View style={[styles.badge, styles.badgePoco]}>
              <Text style={styles.badgeTexto}>{conteoPlural(cuposRestantes, "restante", "restantes")}</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgeDisponible]}>
              <Text style={styles.badgeTexto}>{cuposRestantes} cupos</Text>
            </View>
          )}
        </View>

        {/* Entidad */}
        <Text style={styles.entidad}>{jornada.entidad}</Text>

        {/* Detalles */}
        <View style={styles.detalles}>
          <View style={styles.detalleFila}>
            <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.detalleTexto}>
              {formatearFecha(jornada.fecha, "DD [de] MMMM [de] YYYY")}
            </Text>
          </View>
          <View style={styles.detalleFila}>
            <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.detalleTexto}>{formatearHora(jornada.fecha)}</Text>
          </View>
          {!!jornada.lugar && (
            <View style={styles.detalleFila}>
              <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.detalleTexto} numberOfLines={1}>
                {jornada.lugar}
              </Text>
            </View>
          )}
          {!!extra && (
            <View style={styles.detalleFila}>
              <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.detalleTexto} numberOfLines={1}>
                {extra}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAgotada: {
    opacity: 0.6,
  },
  barraLateral: {
    width: 5,
    backgroundColor: colors.primary,
  },
  barraAgotada: {
    backgroundColor: colors.textDisabled,
  },
  contenido: {
    flex: 1,
    padding: 14,
    gap: 6,
  },
  fila: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  titulo: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 21,
  },
  entidad: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  badgeTexto: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.white,
  },
  badgeDisponible: {
    backgroundColor: colors.success,
  },
  badgePoco: {
    backgroundColor: colors.accent,
  },
  badgeAgotado: {
    backgroundColor: colors.textDisabled,
  },
  detalles: {
    marginTop: 4,
    gap: 3,
  },
  detalleFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detalleTexto: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
});
