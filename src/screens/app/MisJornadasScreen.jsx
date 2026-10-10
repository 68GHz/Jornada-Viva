import React, { useCallback, useState } from "react";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
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
import dayjs from "dayjs";
import { db } from "../../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import JornadaCard from "../../components/JornadaCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import { colors } from "../../theme/colors";
import { combinarFechaHora } from "../../utils/jornadaFecha";

export default function MisJornadasScreen({ navigation }) {
  const { usuario } = useAuth();

  const [jornadas, setJornadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState(null);

  const cargarMisJornadas = useCallback(async () => {
    if (!usuario?.uid) return;

    try {
      setError(null);
      const q = query(
        collection(db, "inscripciones"),
        where("userId", "==", usuario.uid)
      );
      const snapshot = await getDocs(q);
      const idsJornadas = [...new Set(snapshot.docs.map((d) => d.data().jornadaId))];

      const resultados = await Promise.all(
        idsJornadas.map(async (jornadaId) => {
          const jornadaSnap = await getDoc(doc(db, "jornadas", jornadaId));
          return jornadaSnap.exists()
            ? { id: jornadaSnap.id, ...jornadaSnap.data() }
            : null;
        })
      );

      const ahora = dayjs();
      const datos = resultados
        .filter(Boolean)
        .map((jornada) => {
          const fechaHora = combinarFechaHora(jornada.fecha, jornada.hora);
          return {
            ...jornada,
            fechaHora,
            finalizada: !fechaHora?.isValid() || !fechaHora.isAfter(ahora),
          };
        })
        // Próximas primero (más cercanas arriba), luego las finalizadas
        .sort((a, b) => {
          if (a.finalizada !== b.finalizada) return a.finalizada ? 1 : -1;
          const diff = (a.fechaHora?.valueOf() || 0) - (b.fechaHora?.valueOf() || 0);
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
    <FlatList
      data={jornadas}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <JornadaCard
          jornada={item}
          estado={
            item.finalizada
              ? { texto: "Finalizada", color: colors.textDisabled }
              : { texto: "Inscrito", color: colors.success }
          }
          onPress={() => {
            // Los objetos dayjs no son serializables en los params de navegación
            const { fechaHora, finalizada, ...jornada } = item;
            navigation.navigate("JornadaDetail", { jornada });
          }}
        />
      )}
      contentContainerStyle={jornadas.length === 0 ? styles.listaVacia : styles.lista}
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
        jornadas.length > 0 ? (
          <Text style={styles.encabezadoLista}>
            {jornadas.length} inscripción{jornadas.length !== 1 ? "es" : ""}
          </Text>
        ) : null
      }
      ListEmptyComponent={
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
      }
    />
  );
}

const styles = StyleSheet.create({
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
