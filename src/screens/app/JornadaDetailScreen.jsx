import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
} from "firebase/firestore";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { db } from "../../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../theme/colors";

dayjs.locale("es");

export default function JornadaDetailScreen({ route }) {
  const { jornada } = route.params;
  const { usuario } = useAuth();

  const [inscrito, setInscrito] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [inscribiendo, setInscribiendo] = useState(false);

  const cuposRestantes = jornada.cuposTotales - jornada.cuposOcupados;
  const sinCupos = cuposRestantes <= 0;

  // Verificar si el usuario ya está inscrito
  useEffect(() => {
    const verificarInscripcion = async () => {
      try {
        const q = query(
          collection(db, "inscripciones"),
          where("userId", "==", usuario.uid),
          where("jornadaId", "==", jornada.id)
        );
        const snap = await getDocs(q);
        setInscrito(!snap.empty);
      } catch (err) {
        console.error("Error verificando inscripción:", err);
      } finally {
        setVerificando(false);
      }
    };

    verificarInscripcion();
  }, [jornada.id, usuario.uid]);

  const manejarInscripcion = async () => {
    if (sinCupos) {
      Alert.alert("Sin cupos", "Esta jornada ya no tiene cupos disponibles.");
      return;
    }

    Alert.alert(
      "Confirmar inscripción",
      `¿Deseas inscribirte en "${jornada.titulo}"?\n\nFecha: ${dayjs(jornada.fecha).format("DD [de] MMMM [de] YYYY")}\nLugar: ${jornada.lugar}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, inscribirme",
          style: "default",
          onPress: confirmarInscripcion,
        },
      ]
    );
  };

const confirmarInscripcion = async () => {
  setInscribiendo(true);
  try {
    // Doble verificación en el momento de inscribir (evita condición de carrera)
    const q = query(
      collection(db, "inscripciones"),
      where("userId", "==", usuario.uid),
      where("jornadaId", "==", jornada.id)
    );
    const verificacion = await getDocs(q);
    if (!verificacion.empty) {
      setInscrito(true);
      Alert.alert("Ya inscrito", "Ya tienes una inscripción activa en esta jornada.");
      return;
    }

    await addDoc(collection(db, "inscripciones"), {
      userId: usuario.uid,
      jornadaId: jornada.id,
      nombreUsuario: usuario.displayName || usuario.email,
      emailUsuario: usuario.email,
      tituloJornada: jornada.titulo,
      fechaJornada: jornada.fecha,
      inscritoEn: serverTimestamp(),
      asistio: false,
    });

    await updateDoc(doc(db, "jornadas", jornada.id), {
      cuposOcupados: increment(1),
    });

    setInscrito(true);
    Alert.alert(
      "¡Inscripción exitosa! ✅",
      `Quedaste registrado en "${jornada.titulo}".\n\nRecuerda presentarte el ${dayjs(jornada.fecha).format("DD [de] MMMM")} a las ${jornada.hora} en ${jornada.lugar}.`
    );
  } catch (err) {
    console.error("Error al inscribirse:", err);
    Alert.alert(
      "Error",
      "No se pudo completar la inscripción. Verifica tu conexión e intenta de nuevo."
    );
  } finally {
    setInscribiendo(false);
  }
};

  const renderBotonInscripcion = () => {
    if (verificando) {
      return (
        <View style={styles.botonCargando}>
          <ActivityIndicator color={colors.white} />
          <Text style={styles.botonTexto}>Verificando...</Text>
        </View>
      );
    }

    if (inscrito) {
      return (
        <View style={styles.botonInscrito}>
          <Text style={styles.botonTexto}>✅ Ya estás inscrito</Text>
        </View>
      );
    }

    if (sinCupos) {
      return (
        <View style={[styles.botonInscripcion, styles.botonAgotado]}>
          <Text style={styles.botonTexto}>Sin cupos disponibles</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.botonInscripcion, inscribiendo && styles.botonDeshabilitado]}
        onPress={manejarInscripcion}
        disabled={inscribiendo}
        activeOpacity={0.85}
      >
        {inscribiendo ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.botonTexto}>Inscribirme a esta jornada</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.contenedor} contentContainerStyle={styles.contenido}>
      {/* Encabezado */}
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>{jornada.titulo}</Text>
        <Text style={styles.entidad}>{jornada.entidad}</Text>
      </View>

      {/* Cupos */}
      <View
        style={[
          styles.cuposCard,
          sinCupos && styles.cuposCardAgotados,
        ]}
      >
        <Text style={styles.cuposNumero}>
          {sinCupos ? "0" : cuposRestantes}
        </Text>
        <Text style={styles.cuposEtiqueta}>
          {sinCupos ? "Sin cupos" : "cupos disponibles"}
        </Text>
        <Text style={styles.cuposSub}>
          {jornada.cuposOcupados} de {jornada.cuposTotales} lugares ocupados
        </Text>
      </View>

      {/* Info logística */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Información de la jornada</Text>

        <View style={styles.filaInfo}>
          <Text style={styles.filaIcono}>📅</Text>
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Fecha</Text>
            <Text style={styles.filaValor}>
              {dayjs(jornada.fecha).format("dddd, DD [de] MMMM [de] YYYY")}
            </Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Text style={styles.filaIcono}>🕐</Text>
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Hora</Text>
            <Text style={styles.filaValor}>{jornada.hora}</Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Text style={styles.filaIcono}>📍</Text>
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Lugar</Text>
            <Text style={styles.filaValor}>{jornada.lugar}</Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Text style={styles.filaIcono}>👤</Text>
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Responsable</Text>
            <Text style={styles.filaValor}>{jornada.responsable}</Text>
          </View>
        </View>
      </View>

      {/* Descripción */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Descripción</Text>
        <Text style={styles.descripcion}>{jornada.descripcion}</Text>
      </View>

      {/* Botón de inscripción */}
      <View style={styles.accion}>{renderBotonInscripcion()}</View>

      <View style={styles.confirmacionCard}>
        <Text style={styles.confirmacionTitulo}>🎉 ¡Estás inscrito!</Text>
        <Text style={styles.confirmacionTexto}>
          Tu lugar en esta jornada está reservado. Recuerda asistir el día indicado.
          </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenido: {
    padding: 16,
    gap: 16,
    paddingBottom: 36,
  },
  encabezado: {
    gap: 6,
  },
  titulo: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 28,
  },
  entidad: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  cuposCard: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    gap: 2,
  },
  cuposCardAgotados: {
    backgroundColor: colors.textDisabled,
  },
  cuposNumero: {
    fontSize: 48,
    fontWeight: "900",
    color: colors.white,
    lineHeight: 52,
  },
  cuposEtiqueta: {
    fontSize: 16,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },
  cuposSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    marginTop: 4,
  },
  seccion: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filaInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  filaIcono: {
    fontSize: 18,
    marginTop: 1,
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaEtiqueta: {
    fontSize: 11,
    color: colors.textDisabled,
    fontWeight: "600",
  },
  filaValor: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: "500",
    lineHeight: 20,
    textTransform: "capitalize",
  },
  separador: {
    height: 1,
    backgroundColor: colors.border,
  },
  descripcion: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 23,
  },
  accion: {
    marginTop: 4,
  },
  botonInscripcion: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  botonCargando: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    flexDirection: "row",
    gap: 10,
  },
  botonInscrito: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 54,
    justifyContent: "center",
  },
  botonAgotado: {
    backgroundColor: colors.textDisabled,
  },
  botonDeshabilitado: {
    opacity: 0.7,
  },
  botonTexto: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
});