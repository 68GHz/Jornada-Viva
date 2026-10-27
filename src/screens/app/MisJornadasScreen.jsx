import React, { useMemo, useState } from "react";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
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


export default function MisJornadasScreen({ navigation }) {
  const { misJornadas: jornadas, cargando, error, recargar } = useJornadas();
  const { enLinea } = useConnectivity();

  const [actualizando, setActualizando] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);

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
    filtros.busqueda.trim() !== "" ||
    filtros.categoria ||
    filtros.lugar ||
    filtros.fecha !== "todas";

  if (cargando) {
    return <LoadingSpinner mensaje="Cargando tus jornadas..." />;
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Ionicons name="warning-outline" size={44} color={colors.error} />
        <Text style={styles.errorTexto}>{error}</Text>
        <TouchableOpacity
          style={styles.botonReintentar}
          onPress={recargar}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Reintentar"
        >
          <Text style={styles.botonReintentarTexto}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
    {jornadas.length > 0 && (
      <FiltrosJornadas
        filtros={filtros}
        onCambiar={setFiltros}
        categorias={categorias}
        lugares={lugares}
      />
    )}
    <FlatList
      keyboardShouldPersistTaps="handled"
      data={jornadasFiltradas}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <JornadaCard
          jornada={item}
          estado={
            item.pendiente
              ? {
                  texto:
                    item.pendiente === "CANCELAR"
                      ? "Cancelación pendiente"
                      : "Pendiente por sincronizar",
                  color: colors.warning,
                }
              : item.noDisponible
              ? { texto: "No disponible", color: colors.textDisabled }
              : item.finalizada
              ? { texto: "Finalizada", color: colors.textDisabled }
              : item.enCurso
              ? { texto: "En curso", color: colors.accent }
              : { texto: "Inscrito", color: colors.success }
          }
          onPress={() => {
            if (item.noDisponible) {
              Alert.alert(
                "Jornada no disponible",
                "Esta jornada ya no existe. Tu inscripción se muestra solo como registro."
              );
              return;
            }
            // `finalizada`, `enCurso` y `pendiente` son solo de la lista; el detalle los calcula por su cuenta
            const { finalizada, enCurso, pendiente, ...jornada } = item;
            navigation.navigate("JornadaDetail", { jornada });
          }}
        />
      )}
      contentContainerStyle={jornadasFiltradas.length === 0 ? styles.listaVacia : styles.lista}
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
        jornadasFiltradas.length > 0 ? (
          <Text style={styles.encabezadoLista}>
            {jornadasFiltradas.length} inscripción{jornadasFiltradas.length !== 1 ? "es" : ""}
          </Text>
        ) : null
      }
      ListEmptyComponent={
        jornadas.length > 0 ? (
          <View style={styles.centrado}>
            <Ionicons name="search-outline" size={44} color={colors.textDisabled} />
            <Text style={styles.vacioTexto}>
              No encontramos inscripciones con esos criterios.{"\n"}
              Prueba con otra búsqueda o limpia los filtros.
            </Text>
          </View>
        ) : (
          <View style={styles.centrado}>
            <Ionicons name="calendar-outline" size={44} color={colors.textDisabled} />
            <Text style={styles.vacioTexto}>
              {enLinea
                ? "Aún no te has inscrito a ninguna jornada.\n¡Explora las disponibles!"
                : "Sin conexión y sin inscripciones guardadas en el dispositivo.\nConéctate a internet para consultarlas."}
            </Text>
            <TouchableOpacity
              style={styles.botonReintentar}
              onPress={() => navigation.navigate("JornadasList")}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Ver jornadas disponibles"
            >
              <Text style={styles.botonReintentarTexto}>Ver jornadas</Text>
            </TouchableOpacity>
          </View>
        )
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
  botonReintentar: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  botonReintentarTexto: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
