import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadasMaestro } from "../../hooks/useJornadasMaestro";
import JornadaCard from "../../components/JornadaCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import { colorEstado, estadoParaCard } from "../../components/EstadoJornadaChip";
import { colors } from "../../theme/colors";
import { palabraPlural } from "../../utils/plural";
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

// Panel del maestro: las jornadas que creó, con su estado, y acceso a crear nuevas
export default function MaestroHomeScreen({ navigation }) {
  const { usuario, cerrarSesion } = useAuth();
  const { enLinea } = useConnectivity();
  const { jornadas, cargando, error, ahora } = useJornadasMaestro();
  const [filtro, setFiltro] = useState("todas");

  const nombre = usuario?.displayName || usuario?.email || "Gestor";
  const conteo = useMemo(() => contarPorEstado(jornadas, ahora), [jornadas, ahora]);
  const visibles = useMemo(
    () => (filtro === "todas" ? jornadas : jornadas.filter((j) => estadoJornada(j, ahora) === filtro)),
    [jornadas, filtro, ahora]
  );

  if (cargando) return <LoadingSpinner mensaje="Cargando tus jornadas..." />;

  const encabezado = (
    <View style={styles.encabezado}>
      <View style={styles.saludo}>
        <View style={styles.saludoFila}>
          <Ionicons name="school-outline" size={22} color={colors.primary} />
          <Text style={styles.bienvenida}>Hola, {nombre.split(" ")[0]}</Text>
          <View style={styles.rol}>
            <Text style={styles.rolTexto}>Gestor</Text>
          </View>
        </View>
        <Text style={styles.descripcion}>
          Gestiona tus jornadas asignadas: crear, editar, cancelar, reactivar, eliminar y
          descargar la planilla de inscritos.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.botonCrear}
        onPress={() => navigation.navigate("JornadaForm")}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Crear jornada"
      >
        <Ionicons name="add-circle-outline" size={22} color={colors.white} />
        <Text style={styles.botonCrearTexto}>Crear jornada</Text>
      </TouchableOpacity>

      <Text style={styles.seccion}>Mis jornadas asignadas</Text>
      <View style={styles.filtros}>
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
              {!activo && f.valor !== "todas" && (
                <View style={[styles.punto, { backgroundColor: f.color }]} />
              )}
              <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>
                {f.etiqueta} ({cantidad})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
          ? "Aún no tienes jornadas asignadas.\nToca «Crear jornada» para empezar."
          : "No tienes jornadas en este estado."}
      </Text>
    </View>
  );

  return (
    <FlatList
      style={styles.contenedor}
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
      ListFooterComponent={
        <TouchableOpacity
          style={styles.botonSalir}
          onPress={cerrarSesion}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
        >
          <Text style={styles.botonSalirTexto}>Cerrar sesión</Text>
        </TouchableOpacity>
      }
    />
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  encabezado: { padding: 20, paddingBottom: 8, gap: 14 },
  saludo: {
    backgroundColor: colors.primaryPale,
    borderRadius: 14,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  saludoFila: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  bienvenida: { fontSize: 22, fontWeight: "800", color: colors.primary, flexShrink: 1 },
  rol: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  rolTexto: { color: colors.white, fontSize: 11, fontWeight: "700" },
  descripcion: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  botonCrear: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  botonCrearTexto: { color: colors.white, fontSize: 16, fontWeight: "700" },
  seccion: { fontSize: 17, fontWeight: "800", color: colors.textPrimary, marginTop: 4 },
  filtros: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  punto: { width: 8, height: 8, borderRadius: 4 },
  chipTexto: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  chipTextoActivo: { color: colors.white },
  vacio: { alignItems: "center", padding: 32, gap: 12 },
  vacioTexto: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
  botonSalir: {
    margin: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.error,
    paddingVertical: 13,
    alignItems: "center",
  },
  botonSalirTexto: { color: colors.error, fontSize: 15, fontWeight: "700" },
});
