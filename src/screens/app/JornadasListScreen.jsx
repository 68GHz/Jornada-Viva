import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  RefreshControl,
} from "react-native";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { db } from "../../../firebaseConfig";
import JornadaCard from "../../components/JornadaCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import FiltrosJornadas, { FILTROS_INICIALES } from "../../components/FiltrosJornadas";
import { colors } from "../../theme/colors";
import { combinarFechaHora } from "../../utils/jornadaFecha";

// Búsqueda sin distinguir mayúsculas ni tildes
const normalizar = (texto = "") =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function JornadasListScreen({ navigation }) {
  const [jornadas, setJornadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);

  const cargarJornadas = async () => {
    try {
      setError(null);
      const q = query(
        collection(db, "jornadas"),
        where("activa", "==", true)
      );
      const snapshot = await getDocs(q);
      const ahora = dayjs();
      const datos = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((jornada) => {
          const fechaHora = combinarFechaHora(jornada.fecha, jornada.hora);
          return fechaHora?.isValid() && fechaHora.isAfter(ahora);
        });

      // Ordenar por fecha en el cliente
      datos.sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
      setJornadas(datos);
    } catch (err) {
      console.error("Error cargando jornadas:", err);
      setError("No se pudieron cargar las jornadas. Verifica tu conexión.");
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  };

  useEffect(() => {
    cargarJornadas();
  }, []);

  const onRefresh = () => {
    setActualizando(true);
    cargarJornadas();
  };

  // Opciones de filtro derivadas de los datos cargados
  const categorias = useMemo(
    () => [...new Set(jornadas.map((j) => j.categoria).filter(Boolean))].sort(),
    [jornadas]
  );
  const lugares = useMemo(
    () => [...new Set(jornadas.map((j) => j.lugar).filter(Boolean))].sort(),
    [jornadas]
  );

  const jornadasFiltradas = useMemo(() => {
    const texto = normalizar(filtros.busqueda.trim());
    const hoy = dayjs().startOf("day");

    return jornadas.filter((j) => {
      if (texto && !normalizar(j.titulo).includes(texto)) return false;
      if (filtros.categoria && j.categoria !== filtros.categoria) return false;
      if (filtros.lugar && j.lugar !== filtros.lugar) return false;

      if (filtros.fecha !== "todas") {
        const fecha = dayjs(j.fecha).startOf("day");
        if (filtros.fecha === "hoy" && !fecha.isSame(hoy, "day")) return false;
        if (filtros.fecha === "semana" && fecha.diff(hoy, "day") > 7) return false;
        if (filtros.fecha === "mes" && !fecha.isSame(hoy, "month")) return false;
      }
      return true;
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
      renderItem={({ item }) => (
        <JornadaCard
          jornada={item}
          onPress={() =>
            navigation.navigate("JornadaDetail", { jornada: item })
          }
        />
      )}
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