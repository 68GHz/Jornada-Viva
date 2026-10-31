import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { palabraPlural } from "../utils/plural";
import { sugerirEspaciosAlternos } from "../utils/espaciosLibres";

// FE-01 · Espacios alternos. Aparece en el detalle de una jornada que aún no empieza cuando fue
// cancelada o cuando su espacio también lo usa otra jornada a esa hora, y propone los espacios
// que están libres. Se calcula con las jornadas guardadas en el dispositivo: sin conexión sigue
// funcionando con los datos ya descargados (y avisa de que pueden estar desactualizados).
export default function EspaciosAlternos({ jornada, jornadas, ahora, enLinea = true }) {
  const sugerencia = useMemo(
    () => sugerirEspaciosAlternos(jornada, jornadas, ahora),
    [jornada, jornadas, ahora]
  );
  if (!sugerencia) return null;

  const { motivo, ocupantes, libres } = sugerencia;
  const primera = ocupantes[0];
  const otras = ocupantes.length - 1;

  const motivoTexto =
    motivo === "cancelada"
      ? "Esta jornada fue cancelada. Estos espacios están libres a la misma hora:"
      : `${jornada.lugar} también lo usa «${primera?.titulo || "otra jornada"}»${
          otras > 0 ? ` y ${otras} ${palabraPlural(otras, "jornada más", "jornadas más")}` : ""
        } a esa hora. Estos espacios están libres:`;

  return (
    <View style={styles.tarjeta} accessibilityLabel="Espacios alternos libres a esa hora">
      <View style={styles.encabezado}>
        <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
        <Text style={styles.titulo}>Espacios alternos libres a esa hora</Text>
      </View>

      {libres.length > 0 ? (
        <>
          <Text style={styles.texto}>{motivoTexto}</Text>
          <View style={styles.chips}>
            {libres.map((espacio) => (
              <View key={espacio} style={styles.chip}>
                <Text style={styles.chipTexto}>{espacio}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.texto}>No hay otros espacios libres a esa hora.</Text>
      )}

      {!enLinea && (
        <Text style={styles.nota}>
          Sin conexión: se usan los datos guardados en el dispositivo y pueden estar desactualizados.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.primaryPale,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  encabezado: { flexDirection: "row", alignItems: "center", gap: 8 },
  titulo: { flexShrink: 1, fontSize: 14, fontWeight: "800", color: colors.textPrimary },
  texto: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipTexto: { fontSize: 12, fontWeight: "700", color: colors.primary },
  nota: { fontSize: 11, color: colors.textSecondary, fontStyle: "italic" },
});
