import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import JornadaCard from "../../components/JornadaCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import FiltrosJornadas, { FILTROS_INICIALES } from "../../components/FiltrosJornadas";
import { colors } from "../../theme/colors";
import {
  normalizarJornada,
  jornadaYaPaso,
  coincideFiltroFecha,
} from "../../utils/jornadaFecha";


// Búsqueda sin distinguir mayúsculas ni tildes
const normalizar = (texto = "") =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function MisJornadasScreen({ navigation }) {
  const { usuario } = useAuth();

  const [jornadas, setJornadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);

  const cargarMisJornadas = useCallback(async () => {
    if (!usuario?.uid) return;

    try {
      setError(null);
      const q = query(
        collection(db, "inscripciones"),
        where("userId", "==", usuario.uid)
      );
      const snapshot = await getDocs(q);
      // Una inscripción por jornada (se ignoran duplicados)
      const inscripciones = [
        ...new Map(snapshot.docs.map((d) => [d.data().jornadaId, d.data()])).values(),
      ];

      const resultados = await Promise.all(
        inscripciones.map(async (inscripcion) => {
          const jornadaSnap = await getDoc(doc(db, "jornadas", inscripcion.jornadaId));
          if (jornadaSnap.exists()) {
            return normalizarJornada(jornadaSnap.id, jornadaSnap.data());
          }
          // Jornada eliminada: se conserva la inscripción con los datos guardados
          // en ella (igual que en el Home), marcada como no disponible.
          return {
            ...normalizarJornada(inscripcion.jornadaId, {
              titulo: inscripcion.tituloJornada,
              fecha: inscripcion.fechaJornada,
            }),
            noDisponible: true,
          };
        })
      );

      const datos = resultados
        .map((jornada) => ({ ...jornada, finalizada: jornadaYaPaso(jornada.fecha) }))
        // Próximas primero (más cercanas arriba), luego las finalizadas
        .sort((a, b) => {
          if (a.finalizada !== b.finalizada) return a.finalizada ? 1 : -1;
          const diff = (a.fecha || 0) - (b.fecha || 0);
          return a.finalizada ? -diff : diff;
        });

      setJornadas(datos);
    } catch (err) {
      console.error("Error cargando mis jornadas:", err);
      setError("No se pudieron cargar tus jornadas. Verifica tu conexión.");
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, [usuario?.uid]);

  // Recarga al volver (ej. tras cancelar una inscripción en el detalle)
  useFocusEffect(
    useCallback(() => {
      cargarMisJornadas();
    }, [cargarMisJornadas])
  );

  const onRefresh = () => {
    setActualizando(true);
    cargarMisJornadas();
  };

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
    return jornadas.filter((j) => {
      if (texto && !normalizar(j.titulo).includes(texto)) return false;
      if (filtros.categoria && j.categoria !== filtros.categoria) return false;
      if (filtros.lugar && j.lugar !== filtros.lugar) return false;
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
          onPress={() => {
            setCargando(true);
            cargarMisJornadas();
          }}
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
            item.noDisponible
              ? { texto: "No disponible", color: colors.textDisabled }
              : item.finalizada
              ? { texto: "Finalizada", color: colors.textDisabled }
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
            // `finalizada` es solo de la lista; el detalle la calcula por su cuenta
            const { finalizada, ...jornada } = item;
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
              Aún no te has inscrito a ninguna jornada.{"\n"}
              ¡Explora las disponibles!
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
