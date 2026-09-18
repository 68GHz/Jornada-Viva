import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import dayjs from "dayjs";
import { db } from "../../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../theme/colors";
import { combinarFechaHora, formatearDiasFaltan } from "../../utils/jornadaFecha";

export default function HomeScreen({ navigation }) {
  const { usuario, cerrarSesion } = useAuth();

  const nombre = usuario?.displayName || usuario?.email || "Usuario";

  const [misJornadas, setMisJornadas] = useState([]);
  const [cargandoJornadas, setCargandoJornadas] = useState(true);
  const [errorJornadas, setErrorJornadas] = useState(null);

  const cargarMisJornadas = useCallback(async () => {
    if (!usuario?.uid) return;

    try {
      setErrorJornadas(null);
      const q = query(
        collection(db, "inscripciones"),
        where("userId", "==", usuario.uid)
      );
      const snapshot = await getDocs(q);
      const inscripciones = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      const jornadasInscritas = await Promise.all(
        inscripciones.map(async (inscripcion) => {
          try {
            const jornadaSnap = await getDoc(doc(db, "jornadas", inscripcion.jornadaId));
            if (jornadaSnap.exists()) {
              return { id: jornadaSnap.id, ...jornadaSnap.data() };
            }
          } catch (err) {
            console.error("Error cargando jornada de inscripción:", err);
          }
          return {
            id: inscripcion.jornadaId,
            titulo: inscripcion.tituloJornada,
            fecha: inscripcion.fechaJornada,
            hora: null,
          };
        })
      );

      const ahora = dayjs();
      const proximas = jornadasInscritas
        .map((jornada) => ({
          ...jornada,
          fechaHora: combinarFechaHora(jornada.fecha, jornada.hora),
        }))
        .filter((jornada) => jornada.fechaHora?.isValid() && jornada.fechaHora.isAfter(ahora))
        .sort((a, b) => a.fechaHora.valueOf() - b.fechaHora.valueOf());

      setMisJornadas(proximas);
    } catch (err) {
      console.error("Error cargando mis jornadas:", err);
      setErrorJornadas("No se pudieron cargar tus jornadas inscritas.");
    } finally {
      setCargandoJornadas(false);
    }
  }, [usuario?.uid]);

  useFocusEffect(
    useCallback(() => {
      cargarMisJornadas();
    }, [cargarMisJornadas])
  );

  return (
    <ScrollView style={styles.contenedor} contentContainerStyle={styles.contenido}>
      {/* Saludo */}
      <View style={styles.saludo}>
        <View style={styles.saludoFila}>
          <Ionicons name="hand-right" size={22} color={colors.primary} />
          <Text style={styles.bienvenida}>Hola, {nombre.split(" ")[0]}</Text>
        </View>
        <Text style={styles.descripcion}>
          Aquí puedes explorar las jornadas comunitarias disponibles e inscribirte
          de forma rápida y segura.
        </Text>
      </View>

      {/* Tarjetas de acceso rápido */}
      <View style={styles.tarjetas}>
        <TouchableOpacity
          style={styles.tarjetaPrincipal}
          onPress={() => navigation.navigate("JornadasList")}
          activeOpacity={0.85}
        >
          <View style={styles.tarjetaEncabezado}>
            <Ionicons name="list-circle-outline" size={30} color={colors.white} />
            <Text style={styles.tarjetaTitulo}>Ver jornadas</Text>
          </View>
          <Text style={styles.tarjetaDescripcion}>
            Explora todas las jornadas disponibles en tu comunidad
          </Text>
        </TouchableOpacity>
      </View>

      {/* Mis jornadas inscritas */}
      <View style={styles.misJornadas}>
        <Text style={styles.misJornadasTitulo}>Mis próximas jornadas</Text>

        {cargandoJornadas ? (
          <View style={styles.misJornadasEstado}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.misJornadasEstadoTexto}>Cargando tus jornadas...</Text>
          </View>
        ) : errorJornadas ? (
          <View style={styles.misJornadasEstado}>
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <Text style={[styles.misJornadasEstadoTexto, { color: colors.error }]}>
              {errorJornadas}
            </Text>
          </View>
        ) : misJornadas.length === 0 ? (
          <View style={styles.misJornadasEstado}>
            <Ionicons name="calendar-outline" size={20} color={colors.textDisabled} />
            <Text style={styles.misJornadasEstadoTexto}>
              No tienes jornadas próximas. ¡Explora las disponibles!
            </Text>
          </View>
        ) : (
          <View style={styles.misJornadasLista}>
            {misJornadas.map((jornada) => (
              <View key={jornada.id} style={styles.jornadaItem}>
                <Text style={styles.jornadaTitulo} numberOfLines={2}>
                  {jornada.titulo}
                </Text>
                <View style={styles.jornadaDetalles}>
                  <View style={styles.jornadaDetalleFila}>
                    <Ionicons name="hourglass-outline" size={13} color={colors.primary} />
                    <Text style={styles.jornadaDetalleTexto}>
                      {formatearDiasFaltan(jornada.fechaHora)}
                    </Text>
                  </View>
                  <View style={styles.jornadaDetalleFila}>
                    <Ionicons name="time-outline" size={13} color={colors.primary} />
                    <Text style={styles.jornadaDetalleTexto}>
                      {jornada.hora || "Hora por confirmar"}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Info de sesión */}
      <View style={styles.sesionInfo}>
        <Text style={styles.sesionTexto}>
          Sesión activa: {usuario?.displayName}
        </Text>
      </View>

      {/* Cerrar sesión */}
      <TouchableOpacity
        style={styles.botonSalir}
        onPress={cerrarSesion}
        activeOpacity={0.85}
      >
        <Text style={styles.botonSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenido: {
    padding: 20,
    gap: 20,
  },
  saludo: {
    backgroundColor: colors.primaryPale,
    borderRadius: 14,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  saludoFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  bienvenida: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
  },
  descripcion: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  tarjetas: {
    gap: 12,
  },
  tarjetaPrincipal: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  tarjetaEncabezado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tarjetaTitulo: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.white,
  },
  tarjetaDescripcion: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 18,
  },
  misJornadas: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  misJornadasTitulo: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  misJornadasEstado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  misJornadasEstadoTexto: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  misJornadasLista: {
    gap: 10,
  },
  jornadaItem: {
    backgroundColor: colors.primaryPale,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  jornadaTitulo: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 19,
  },
  jornadaDetalles: {
    flexDirection: "row",
    gap: 16,
  },
  jornadaDetalleFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  jornadaDetalleTexto: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  sesionInfo: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sesionTexto: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  botonSalir: {
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  botonSalirTexto: {
    color: colors.error,
    fontSize: 15,
    fontWeight: "700",
  },
});