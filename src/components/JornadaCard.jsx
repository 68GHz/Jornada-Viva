import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { formatearFecha, formatearHora } from "../utils/jornadaFecha";
import { categoriaDeJornada } from "../utils/categorias";
import { conteoPlural } from "../utils/plural";
import BannerJornada from "./BannerJornada";

// Card de jornada, idéntica para todos los roles.
// `extra` (opcional): línea adicional (p. ej. los cupos ocupados para gestor y administrador).
// `estado` (opcional): { texto, color } reemplaza el indicador de cupos (ej. "Inscrito").
export default function JornadaCard({ jornada, onPress, estado, extra }) {
  const total = Number(jornada.cuposTotales) || 0;
  const ocupados = Number(jornada.cuposOcupados) || 0;
  const restantes = total - ocupados;
  const sinCupos = !estado && restantes <= 0;
  const pocos = restantes > 0 && restantes <= 10;
  const ocupacion = total > 0 ? Math.min(1, Math.max(0, ocupados / total)) : 0;
  const colorCupos = sinCupos ? colors.textDisabled : pocos ? colors.accent : colors.success;
  const categoria = categoriaDeJornada(jornada);

  return (
    <TouchableOpacity
      style={[styles.card, sinCupos && styles.cardAgotada]}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${jornada.titulo}${estado ? `, ${estado.texto}` : ""}`}
    >
      <BannerJornada url={jornada.bannerUrl} altura={120} style={{ borderRadius: 0 }} />

      <View style={styles.cuerpo}>
        <View style={styles.fecha}>
          <Text style={styles.fechaDia}>{formatearFecha(jornada.fecha, "DD")}</Text>
          <Text style={styles.fechaMes}>{formatearFecha(jornada.fecha, "MMM").replace(".", "").toUpperCase()}</Text>
        </View>

        <View style={styles.info}>
          {!!categoria && (
            <View style={styles.categoria}>
              <Text style={styles.categoriaTexto}>{categoria}</Text>
            </View>
          )}
          <Text style={styles.titulo} numberOfLines={2}>
            {jornada.titulo}
          </Text>
          {!!jornada.entidad && (
            <Text style={styles.entidad} numberOfLines={1}>
              {jornada.entidad}
            </Text>
          )}
          <View style={styles.meta}>
            <Ionicons name="time-outline" size={14} color={colors.primary} />
            <Text style={styles.metaTexto}>{formatearHora(jornada.fecha)}</Text>
            {!!jornada.lugar && (
              <>
                <Ionicons name="location-outline" size={14} color={colors.primary} style={styles.metaIcono} />
                <Text style={[styles.metaTexto, styles.metaLugar]} numberOfLines={1}>
                  {jornada.lugar}
                </Text>
              </>
            )}
          </View>
          {!!extra && (
            <View style={styles.meta}>
              <Ionicons name="people-outline" size={14} color={colors.primary} />
              <Text style={[styles.metaTexto, styles.metaLugar]} numberOfLines={2}>
                {extra}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.pie}>
        {estado ? (
          <View style={[styles.estado, { backgroundColor: estado.color }]}>
            <Text style={styles.estadoTexto}>{estado.texto}</Text>
          </View>
        ) : (
          <>
            <View style={styles.pista}>
              <View style={[styles.relleno, { width: `${ocupacion * 100}%`, backgroundColor: colorCupos }]} />
            </View>
            <Text style={[styles.cupos, { color: sinCupos ? colors.textSecondary : colorCupos }]}>
              {sinCupos ? "Sin cupos" : conteoPlural(restantes, "cupo", "cupos")}
            </Text>
          </>
        )}
        <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardAgotada: { opacity: 0.65 },
  cuerpo: { flexDirection: "row", gap: 14, padding: 14 },
  fecha: {
    width: 54,
    height: 62,
    borderRadius: 14,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  fechaDia: { fontSize: 22, fontWeight: "800", color: colors.primary, lineHeight: 26 },
  fechaMes: { fontSize: 11, fontWeight: "800", color: colors.primaryLight, letterSpacing: 0.8 },
  info: { flex: 1, gap: 4 },
  categoria: {
    alignSelf: "flex-start",
    backgroundColor: colors.primaryPale,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoriaTexto: { fontSize: 11, fontWeight: "700", color: colors.primary },
  titulo: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, lineHeight: 21 },
  entidad: { fontSize: 12, color: colors.textSecondary, fontWeight: "500" },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  metaIcono: { marginLeft: 8 },
  metaTexto: { fontSize: 12, color: colors.textSecondary, fontWeight: "600" },
  metaLugar: { flex: 1 },
  pie: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  pista: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  relleno: { height: 6, borderRadius: 3 },
  cupos: { fontSize: 12, fontWeight: "800" },
  estado: { flex: 1, alignSelf: "flex-start", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  estadoTexto: { fontSize: 11, fontWeight: "700", color: colors.white },
});
