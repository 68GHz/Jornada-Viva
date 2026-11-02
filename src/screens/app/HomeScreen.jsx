import React, { useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadas } from "../../context/JornadasContext";
import SaludoHeader from "../../components/SaludoHeader";
import JornadaCard from "../../components/JornadaCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import FiltrosJornadas, { FILTROS_INICIALES } from "../../components/FiltrosJornadas";
import { colors } from "../../theme/colors";
import { normalizarTexto, opcionesUnicas } from "../../utils/textoFiltro";
import { coincideFiltroFecha } from "../../utils/jornadaFecha";
import { conteoPlural } from "../../utils/plural";

// Inicio del estudiante: saludo personalizado + jornadas disponibles
export default function HomeScreen({ navigation }) {
  const { usuario } = useAuth();
  const {
    jornadasDisponibles: jornadas,
    estadoInscripcion,
    cargando,
    error,
    recargar,
  } = useJornadas();
  const { enLinea } = useConnectivity();
  const [actualizando, setActualizando] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);

  const nombre = (usuario?.displayName || usuario?.email || "Usuario").trim().split(" ")[0];

  const onRefresh = async () => {
    setActualizando(true);
    await recargar();
    setActualizando(false);
  };

  const categorias = useMemo(() => opcionesUnicas(jornadas, "categoria"), [jornadas]);
  const lugares = useMemo(() => opcionesUnicas(jornadas, "lugar"), [jornadas]);

  const jornadasFiltradas = useMemo(() => {
    const texto = normalizarTexto(filtros.busqueda);
    return jornadas.filter((j) => {
      if (texto && !normalizarTexto(j.titulo).includes(texto)) return false;
      if (filtros.categoria && normalizarTexto(j.categoria) !== filtros.categoria) return false;
      if (filtros.lugar && normalizarTexto(j.lugar) !== filtros.lugar) return false;
      return coincideFiltroFecha(j.fecha, filtros.fecha, filtros.desde, filtros.hasta);
    });
  }, [jornadas, filtros]);

  const hayFiltros =
    filtros.busqueda.trim() !== "" || filtros.categoria || filtros.lugar || filtros.fecha !== "todas";

  return (
    <View style={styles.contenedor}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={cargando || error ? [] : jornadasFiltradas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const { pendiente } = estadoInscripcion(item.id);
          return (
            <JornadaCard
              jornada={item}
              estado={
                pendiente
                  ? {
                      texto: pendiente === "CANCELAR" ? "Cancelación pendiente" : "Pendiente por sincronizar",
                      color: colors.warning,
                    }
                  : undefined
              }
              onPress={() => navigation.navigate("JornadaDetail", { jornada: item })}
            />
          );
        }}
        contentContainerStyle={styles.lista}
        refreshControl={
          <RefreshControl
            refreshing={actualizando}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <SaludoHeader
              nombre={nombre}
              texto="Descubre las jornadas de tu comunidad e inscríbete en segundos."
            />
            <View style={styles.seccion}>
              <Text style={styles.seccionTitulo}>Jornadas disponibles</Text>
              {!cargando && !error && (
                <Text style={styles.seccionConteo}>
                  {conteoPlural(jornadasFiltradas.length, "jornada", "jornadas")}
                </Text>
              )}
            </View>
            <FiltrosJornadas
              filtros={filtros}
              onCambiar={setFiltros}
              categorias={categorias}
              lugares={lugares}
            />
          </View>
        }
        ListEmptyComponent={
          cargando ? (
            <LoadingSpinner mensaje="Buscando jornadas disponibles..." />
          ) : error ? (
            <View style={styles.centrado}>
              <Ionicons name="warning-outline" size={44} color={colors.error} />
              <Text style={styles.errorTexto}>{error}</Text>
            </View>
          ) : (
            <View style={styles.centrado}>
              <Ionicons
                name={hayFiltros ? "search-outline" : "file-tray-outline"}
                size={44}
                color={colors.textDisabled}
              />
              <Text style={styles.vacioTexto}>
                {hayFiltros
                  ? "No encontramos jornadas con esos criterios.\nPrueba con otra búsqueda o limpia los filtros."
                  : !enLinea
                  ? "Sin conexión y sin jornadas guardadas en el dispositivo.\nConéctate a internet para descargarlas."
                  : "No hay jornadas disponibles en este momento.\nVuelve a revisar pronto."}
              </Text>
            </View>
          )
        }
      />
    </View>
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
  centrado: { alignItems: "center", padding: 32, gap: 12 },
  errorTexto: { fontSize: 15, color: colors.error, textAlign: "center", lineHeight: 22 },
  vacioTexto: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
});
