import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { ESTADOS_JORNADA, ETIQUETA_ESTADO } from "../utils/estadoJornada";

// Color de cada estado de una jornada (para el chip y el badge de JornadaCard)
export const colorEstado = (estado) =>
  ({
    [ESTADOS_JORNADA.ACTIVA]: colors.success,
    [ESTADOS_JORNADA.EN_CURSO]: colors.accent,
    [ESTADOS_JORNADA.CANCELADA]: colors.error,
    [ESTADOS_JORNADA.FINALIZADA]: colors.textDisabled,
  })[estado] || colors.textDisabled;

// Estado de una jornada con el mismo formato de `estado` que usa JornadaCard
export const estadoParaCard = (estado) => ({
  texto: ETIQUETA_ESTADO[estado],
  color: colorEstado(estado),
});

export default function EstadoJornadaChip({ estado, grande = false }) {
  return (
    <View
      style={[styles.chip, grande && styles.chipGrande, { backgroundColor: colorEstado(estado) }]}
      accessibilityLabel={`Estado: ${ETIQUETA_ESTADO[estado]}`}
    >
      <Text style={[styles.texto, grande && styles.textoGrande]}>{ETIQUETA_ESTADO[estado]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipGrande: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  texto: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  textoGrande: {
    fontSize: 14,
  },
});
