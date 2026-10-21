import React, { useMemo, useState } from "react";
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadas } from "../../context/JornadasContext";
import JornadaCard from "../../components/JornadaCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import FiltrosJornadas, { FILTROS_INICIALES } from "../../components/FiltrosJornadas";
import { colors } from "../../theme/colors";
import { normalizarTexto, opcionesUnicas } from "../../utils/textoFiltro";
import { coincideFiltroFecha } from "../../utils/jornadaFecha";


export default function JornadasListScreen({ navigation }) {
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

  const onRefresh = async () => {
    setActualizando(true);
    await recargar();
    setActualizando(false);
  };

  // Opciones de filtro derivadas de los datos cargados
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

  if (cargando) {
    return <LoadingSpinner mensaje="Buscando jornadas disponibles..." />;
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Ionicons name="warning-outline" size={44} color={colors.error} />
        <Text style={styles.errorTexto}>{error}</Text>
      </View>
    );
  }

  const hayFiltros =
    filtros.busqueda.trim() !== "" ||
    filtros.categoria ||
    filtros.lugar ||
    filtros.fecha !== "todas";

  return (
    <View style={styles.contenedor}>
    <FiltrosJornadas
      filtros={filtros}
      onCambiar={setFiltros}
      categorias={categorias}
      lugares={lugares}
    />
    <FlatList
      keyboardShouldPersistTaps="handled"
      data={jornadasFiltradas}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const { pendiente } = estadoInscripcion(item.id);
        return (
          <JornadaCard
            jornada={item}
            estado={
              pendiente
                ? {
                    texto:
                      pendiente === "CANCELAR"
                        ? "Cancelación pendiente"
                        : "Pendiente por sincronizar",
                    color: colors.warning,
                  }
                : undefined
            }
            onPress={() =>
              navigation.navigate("JornadaDetail", { jornada: item })
            }
          />
        );
      }}
      contentContainerStyle={
        jornadasFiltradas.length === 0 ? styles.listaVacia : styles.lista
      }
      style={{ backgroundColor: colors.background }}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <Text style={styles.encabezadoLista}>
          {jornadasFiltradas.length} jornada{jornadasFiltradas.length !== 1 ? "s" : ""} disponible
          {jornadasFiltradas.length !== 1 ? "s" : ""}
        </Text>
      }
      ListEmptyComponent={
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
      }
    />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: colors.background,
  },
  lista: {
    paddingVertical: 8,
    paddingBottom: 24,
  },
  listaVacia: {
    flex: 1,
  },
  encabezadoLista: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  centrado: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  errorTexto: {
    fontSize: 15,
    color: colors.error,
    textAlign: "center",
    lineHeight: 22,
  },
  vacioTexto: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});