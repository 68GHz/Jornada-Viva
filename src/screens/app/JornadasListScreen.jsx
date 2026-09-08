import React, { useEffect, useState } from "react";
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
import { db } from "../../../firebaseConfig";
import JornadaCard from "../../components/JornadaCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import { colors } from "../../theme/colors";

export default function JornadasListScreen({ navigation }) {
  const [jornadas, setJornadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState(null);

  const cargarJornadas = async () => {
    try {
      setError(null);
      const q = query(
        collection(db, "jornadas"),
        where("activa", "==", true)
      );
      const snapshot = await getDocs(q);
      const datos = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

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

  if (cargando) {
    return <LoadingSpinner mensaje="Buscando jornadas disponibles..." />;
  }

  if (error) {
    return (
      <View style={styles.centrado}>
        <Text style={styles.errorIcono}>⚠️</Text>
        <Text style={styles.errorTexto}>{error}</Text>
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
          onPress={() =>
            navigation.navigate("JornadaDetail", { jornada: item })
          }
        />
      )}
      contentContainerStyle={
        jornadas.length === 0 ? styles.listaVacia : styles.lista
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
          {jornadas.length} jornada{jornadas.length !== 1 ? "s" : ""} disponible
          {jornadas.length !== 1 ? "s" : ""}
        </Text>
      }
      ListEmptyComponent={
        <View style={styles.centrado}>
          <Text style={styles.vacioCicono}>📭</Text>
          <Text style={styles.vacioTexto}>
            No hay jornadas disponibles en este momento.{"\n"}
            Vuelve a revisar pronto.
          </Text>
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
  errorIcono: {
    fontSize: 40,
  },
  errorTexto: {
    fontSize: 15,
    color: colors.error,
    textAlign: "center",
    lineHeight: 22,
  },
  vacioCicono: {
    fontSize: 40,
  },
  vacioTexto: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});