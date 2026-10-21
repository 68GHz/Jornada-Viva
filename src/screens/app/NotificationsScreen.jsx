import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "../../context/NotificationContext";
import NotificationItem from "../../components/NotificationItem";
import { colors } from "../../theme/colors";

export default function NotificationsScreen({ navigation }) {
  const {
    notificaciones,
    cargando,
    marcarComoLeida,
    marcarTodasComoLeidas,
    borrarNotificacion,
  } = useNotifications();

  const handlePressNotificacion = async (notificacion) => {
    if (!notificacion.leida) {
      marcarComoLeida(notificacion.id);
    }

    // Una jornada cancelada o eliminada no tiene detalle al que navegar
    const sinDetalle = notificacion.tipo === "cancelacion" || notificacion.tipo === "eliminacion";

    if (notificacion.jornadaId && !sinDetalle) {
      navigation.navigate("JornadaDetail", {
        jornada: {
          id: notificacion.jornadaId,
          titulo: notificacion.datosJornada?.titulo || notificacion.titulo,
          lugar: notificacion.datosJornada?.lugar || "",
          fecha: notificacion.datosJornada?.fecha?.toMillis
            ? notificacion.datosJornada.fecha.toMillis()
            : notificacion.datosJornada?.fecha || Date.now(),
        },
      });
    } else if (notificacion.tipo === "cancelacion") {
      Alert.alert(
        "Jornada Cancelada",
        `La jornada "${notificacion.datosJornada?.titulo || "esta jornada"}" ha sido cancelada y ya no está disponible.`
      );
    } else if (notificacion.tipo === "eliminacion") {
      Alert.alert(
        "Jornada eliminada",
        `La jornada "${notificacion.datosJornada?.titulo || "esta jornada"}" fue eliminada por el organizador y ya no está disponible.`
      );
    }
  };

  const handleMarcarTodas = () => {
    marcarTodasComoLeidas();
  };

  const handleEliminar = (id) => {
    Alert.alert(
      "Eliminar notificación",
      "¿Deseas eliminar esta notificación?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => borrarNotificacion(id),
        },
      ]
    );
  };

  const hayNoLeidas = notificaciones.some((n) => !n.leida);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.cargandoTexto}>Cargando notificaciones...</Text>
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
      {notificaciones.length > 0 && (
        <View style={styles.barraHerramientas}>
          <Text style={styles.conteoTexto}>
            {notificaciones.length} notificación{notificaciones.length !== 1 ? "es" : ""}
          </Text>
          {hayNoLeidas && (
            <TouchableOpacity
              style={styles.botonMarcarTodas}
              onPress={handleMarcarTodas}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-done" size={16} color={colors.primary} />
              <Text style={styles.botonMarcarTodasTexto}>Marcar todas como leídas</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        data={notificaciones}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem
            notificacion={item}
            onPress={handlePressNotificacion}
            onMarcarLeida={marcarComoLeida}
            onEliminar={handleEliminar}
          />
        )}
        contentContainerStyle={
          notificaciones.length === 0 ? styles.listaVacia : styles.lista
        }
        ListEmptyComponent={
          <View style={styles.centrado}>
            <Ionicons name="notifications-off-outline" size={54} color={colors.textDisabled} />
            <Text style={styles.tituloVacio}>Sin notificaciones</Text>
            <Text style={styles.textoVacio}>
              Te avisaremos aquí sobre cualquier cambio, reprogramación o cancelación en las jornadas a las que estés inscrito.
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
  barraHerramientas: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  conteoTexto: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  botonMarcarTodas: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  botonMarcarTodasTexto: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "700",
  },
  lista: {
    padding: 16,
    paddingBottom: 24,
  },
  listaVacia: {
    flex: 1,
  },
  centrado: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  cargandoTexto: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  tituloVacio: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  textoVacio: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});

