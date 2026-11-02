import React, { useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadasMaestro } from "../../hooks/useJornadasMaestro";
import JornadaCard from "../../components/JornadaCard";
import SaludoHeader from "../../components/SaludoHeader";
import LoadingSpinner from "../../components/LoadingSpinner";
import { colorEstado, estadoParaCard } from "../../components/EstadoJornadaChip";
import { colors } from "../../theme/colors";
import { conteoPlural, palabraPlural } from "../../utils/plural";
import {
  ESTADOS_JORNADA,
  ETIQUETA_ESTADO_PLURAL,
  contarPorEstado,
  estadoJornada,
} from "../../utils/estadoJornada";

const FILTROS = [
  { valor: "todas", etiqueta: "Todas", color: colors.primary },
  ...Object.values(ESTADOS_JORNADA).map((estado) => ({
    valor: estado,
    etiqueta: ETIQUETA_ESTADO_PLURAL[estado],
    color: colorEstado(estado),
  })),
];

// Inicio del gestor: saludo + las jornadas que tiene asignadas, filtradas por estado
export default function MaestroHomeScreen({ navigation }) {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const { jornadas, cargando, error, ahora } = useJornadasMaestro();
  const [filtro, setFiltro] = useState("todas");

  const nombre = (usuario?.displayName || usuario?.email || "Gestor").trim().split(" ")[0];
  const conteo = useMemo(() => contarPorEstado(jornadas, ahora), [jornadas, ahora]);
  const visibles = useMemo(
    () => (filtro === "todas" ? jornadas : jornadas.filter((j) => estadoJornada(j, ahora) === filtro)),
    [jornadas, filtro, ahora]
  );

  if (cargando) return <LoadingSpinner mensaje="Cargando tus jornadas..." />;

  const encabezado = (
    <View>
      <SaludoHeader
        nombre={nombre}
        rol="Gestor"
        texto="Administra tus jornadas: estado, inscritos y asistencia en un solo lugar."
      />
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Mis jornadas asignadas</Text>
        <Text style={styles.seccionConteo}>{conteoPlural(visibles.length, "jornada", "jornadas")}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtros}
        keyboardShouldPersistTaps="handled"
      >
        {FILTROS.map((f) => {
          const activo = filtro === f.valor;
          const cantidad = f.valor === "todas" ? conteo.total : conteo[f.valor];
          return (
            <TouchableOpacity
              key={f.valor}
              style={[styles.chip, activo && { backgroundColor: f.color, borderColor: f.color }]}
              onPress={() => setFiltro(f.valor)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: activo }}
              accessibilityLabel={`${f.etiqueta}: ${cantidad}`}
            >
              {!activo && f.valor !== "todas" && <View style={[styles.punto, { backgroundColor: f.color }]} />}
              <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{f.etiqueta}</Text>
              <View style={[styles.burbuja, activo && styles.burbujaActiva]}>
                <Text style={[styles.burbujaTexto, activo && styles.chipTextoActivo]}>{cantidad}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const vacio = (
    <View style={styles.vacio}>
      <Ionicons
        name={error || !enLinea ? "cloud-offline-outline" : "calendar-outline"}
        size={44}
        color={colors.textDisabled}
      />
      <Text style={styles.vacioTexto}>
        {error
          ? error
          : !enLinea && jornadas.length === 0
          ? "Sin conexión. Conéctate a internet para consultar y administrar tus jornadas."
          : jornadas.length === 0
          ? "Aún no tienes jornadas asignadas.\nUsa «Crear» en la barra inferior para empezar."
          : "No tienes jornadas en este estado."}
      </Text>
    </View>
  );

  return (
    <FlatList
      style={styles.contenedor}
      contentContainerStyle={styles.lista}
      data={visibles}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={encabezado}
      ListEmptyComponent={vacio}
      renderItem={({ item }) => (
        <JornadaCard
          jornada={item}
          estado={estadoParaCard(estadoJornada(item, ahora))}
          extra={`${item.cuposOcupados || 0} de ${item.cuposTotales || 0} ${palabraPlural(item.cuposTotales || 0, "cupo ocupado", "cupos ocupados")}`}
          onPress={() => navigation.navigate("JornadaAdmin", { jornadaId: item.id })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  lista: { paddingBottom: 24 },
  seccion: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  seccionTitulo: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  seccionConteo: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  filtros: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 14,
    paddingRight: 8,
  },
  punto: { width: 8, height: 8, borderRadius: 4 },
  chipTexto: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  chipTextoActivo: { color: colors.white },
  burbuja: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  burbujaActiva: { backgroundColor: "rgba(255,255,255,0.28)" },
  burbujaTexto: { fontSize: 11, fontWeight: "800", color: colors.textSecondary },
  vacio: { alignItems: "center", padding: 32, gap: 12 },
  vacioTexto: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
});
