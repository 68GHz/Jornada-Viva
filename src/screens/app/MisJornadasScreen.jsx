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
import { conteoPlural } from "../../utils/plural";
import {
  MODOS_HISTORIAL,
  contarHistorial,
  distintivoHistorial,
  filtrarHistorial,
} from "../../utils/jornadaEstado";


export default function MisJornadasScreen({ navigation }) {
  const { misJornadas: jornadas, cargando, error, recargar } = useJornadas();
  const { enLinea } = useConnectivity();

  const [actualizando, setActualizando] = useState(false);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  // Pestaña del historial: todas las inscripciones o solo aquellas a las que se asistió
  const [modo, setModo] = useState(MODOS_HISTORIAL.INSCRITAS);
  const conteos = useMemo(() => contarHistorial(jornadas), [jornadas]);

  const onRefresh = async () => {
    setActualizando(true);
    await recargar();
    setActualizando(false);
  };

  const categorias = useMemo(() => opcionesUnicas(jornadas, "categoria"), [jornadas]);
  const lugares = useMemo(() => opcionesUnicas(jornadas, "lugar"), [jornadas]);

  const jornadasFiltradas = useMemo(() => {
    const texto = normalizarTexto(filtros.busqueda);
    return filtrarHistorial(jornadas, modo).filter((j) => {
      if (texto && !normalizarTexto(j.titulo).includes(texto)) return false;
      if (filtros.categoria && normalizarTexto(j.categoria) !== filtros.categoria) return false;
      if (filtros.lugar && normalizarTexto(j.lugar) !== filtros.lugar) return false;
      return coincideFiltroFecha(j.fecha, filtros.fecha, filtros.desde, filtros.hasta);
    });
  }, [jornadas, filtros, modo]);

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
      <View style={styles.pestanas} accessibilityRole="tablist">
        {[
          { clave: MODOS_HISTORIAL.INSCRITAS, texto: `Inscritas (${conteos.inscritas})` },
          { clave: MODOS_HISTORIAL.ASISTIDAS, texto: `Asistidas (${conteos.asistidas})` },
        ].map((p) => {
          const activa = modo === p.clave;
          return (
            <TouchableOpacity
              key={p.clave}
              style={[styles.pestana, activa && styles.pestanaActiva]}
              onPress={() => setModo(p.clave)}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: activa }}
              accessibilityLabel={p.texto}
            >
              <Text style={[styles.pestanaTexto, activa && styles.pestanaTextoActiva]}>{p.texto}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    )}
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
          estado={(() => {
            const { tipo, texto } = distintivoHistorial(item);
            return { texto, color: COLOR_DISTINTIVO[tipo] };
          })()}
          onPress={() => {
            if (item.noDisponible) {
              Alert.alert(
                "Jornada no disponible",
                "Esta jornada ya no existe. Tu inscripción se muestra solo como registro."
              );
              return;
            }
            // `finalizada`, `enCurso` y `pendiente` son solo de la lista; el detalle los calcula por su cuenta
            const { finalizada, enCurso, pendiente, asistio, ...jornada } = item;
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
            {modo === MODOS_HISTORIAL.ASISTIDAS
              ? conteoPlural(jornadasFiltradas.length, "asistencia", "asistencias")
              : conteoPlural(jornadasFiltradas.length, "inscripción", "inscripciones")}
          </Text>
        ) : null
      }
      ListEmptyComponent={
        jornadas.length > 0 && modo === MODOS_HISTORIAL.ASISTIDAS && !hayFiltros ? (
          <View style={styles.centrado}>
            <Ionicons name="checkmark-done-outline" size={44} color={colors.textDisabled} />
            <Text style={styles.vacioTexto}>
              Aún no tienes asistencias registradas.{"\n"}
              Aparecerán aquí cuando registres tu asistencia en una jornada.
            </Text>
          </View>
        ) : jornadas.length > 0 ? (
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

// Color del distintivo según su tipo (ver distintivoHistorial)
const COLOR_DISTINTIVO = {
  pendiente: colors.warning,
  noDisponible: colors.textDisabled,
  asistio: colors.primary,
  noAsistio: colors.textDisabled,
  enCurso: colors.accent,
  inscrito: colors.success,
};

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pestanas: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pestana: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pestanaActiva: { backgroundColor: colors.primary, borderColor: colors.primary },
  pestanaTexto: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  pestanaTextoActiva: { color: colors.white },
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
