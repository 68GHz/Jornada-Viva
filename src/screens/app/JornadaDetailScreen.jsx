import React, { useState, useEffect, useMemo } from "react";
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
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  increment,
} from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { db } from "../../../firebaseConfig";
import { useAuth } from "../../context/AuthContext";
import { useJornadas } from "../../context/JornadasContext";
import { colors } from "../../theme/colors";
import {
  puedeCancelarInscripcion,
  DIAS_LIMITE_CANCELACION,
  formatearFecha,
  formatearHora,
  jornadaYaPaso,
} from "../../utils/jornadaFecha";
import { jornadaDisponible } from "../../utils/jornadaEstado";

export default function JornadaDetailScreen({ route }) {
  const { jornada: jornadaInicial } = route.params;
  const { usuario } = useAuth();

  const { jornadasPorId, cargando: cargandoJornadas, ahora } = useJornadas();

  // Datos en vivo de Firestore (cupos, estado, etc.) sobre los recibidos al navegar
  const jornadaEnVivo = jornadasPorId.get(jornadaInicial.id);
  const jornada = useMemo(
    () => (jornadaEnVivo ? { ...jornadaInicial, ...jornadaEnVivo } : jornadaInicial),
    [jornadaInicial, jornadaEnVivo]
  );
  const vencida = jornadaYaPaso(jornada.fecha, ahora);
  // Mientras cargan los datos no se bloquea; luego debe existir, estar activa y no vencida
  const disponible =
    cargandoJornadas || (!!jornadaEnVivo && jornadaDisponible(jornadaEnVivo, ahora));

  const [inscrito, setInscrito] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [inscribiendo, setInscribiendo] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const cuposRestantes = jornada.cuposTotales - jornada.cuposOcupados;
  const sinCupos = cuposRestantes <= 0;
  const puedeCancelar = puedeCancelarInscripcion(jornada.fecha);

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
    if (!disponible) {
      Alert.alert("Jornada no disponible", "Esta jornada ya no está disponible para inscripción.");
      return;
    }

    if (sinCupos) {
      Alert.alert("Sin cupos", "Esta jornada ya no tiene cupos disponibles.");
      return;
    }

    Alert.alert(
      "Confirmar inscripción",
      `¿Deseas inscribirte en "${jornada.titulo}"?\n\nFecha: ${formatearFecha(jornada.fecha, "DD [de] MMMM [de] YYYY")}\nHora: ${formatearHora(jornada.fecha)}\nLugar: ${jornada.lugar}`,
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
      fechaJornada:
        jornada.fecha != null ? Timestamp.fromMillis(jornada.fecha) : null,
      inscritoEn: serverTimestamp(),
      asistio: false,
    });

    await updateDoc(doc(db, "jornadas", jornada.id), {
      cuposOcupados: increment(1),
    });

    setInscrito(true);
    Alert.alert(
      "¡Inscripción exitosa! ✅",
      `Quedaste registrado en "${jornada.titulo}".\n\nRecuerda presentarte el ${formatearFecha(jornada.fecha, "DD [de] MMMM")} a las ${formatearHora(jornada.fecha)} en ${jornada.lugar}.`
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

  const manejarCancelacion = () => {
    if (!puedeCancelarInscripcion(jornada.fecha)) {
      Alert.alert(
        "Plazo vencido",
        `Solo puedes cancelar hasta ${DIAS_LIMITE_CANCELACION} días antes de la jornada.`
      );
      return;
    }

    Alert.alert(
      "Cancelar inscripción",
      `¿Seguro que deseas cancelar tu inscripción en "${jornada.titulo}"?\n\nTu cupo quedará disponible para otras personas.`,
      [
        { text: "Mantener inscripción", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: confirmarCancelacion,
        },
      ]
    );
  };

  const confirmarCancelacion = async () => {
    setCancelando(true);
    try {
      const q = query(
        collection(db, "inscripciones"),
        where("userId", "==", usuario.uid),
        where("jornadaId", "==", jornada.id)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setInscrito(false);
        Alert.alert("Sin inscripción", "No tienes una inscripción activa en esta jornada.");
        return;
      }

      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      await updateDoc(doc(db, "jornadas", jornada.id), {
        cuposOcupados: increment(-1),
      });

      setInscrito(false);
      Alert.alert("Inscripción cancelada", `Cancelaste tu inscripción en "${jornada.titulo}".`);
    } catch (err) {
      console.error("Error al cancelar inscripción:", err);
      Alert.alert(
        "Error",
        "No se pudo cancelar la inscripción. Verifica tu conexión e intenta de nuevo."
      );
    } finally {
      setCancelando(false);
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
          <Ionicons name="checkmark-circle" size={20} color={colors.white} />
          <Text style={styles.botonTexto}>Ya estás inscrito</Text>
        </View>
      );
    }

    if (!disponible) {
      return (
        <View style={[styles.botonInscripcion, styles.botonAgotado]}>
          <Text style={styles.botonTexto}>Jornada no disponible</Text>
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

      {!disponible && (
        <View style={styles.avisoNoDisponible}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
          <Text style={styles.avisoNoDisponibleTexto}>
            {vencida
              ? "Esta jornada ya finalizó."
              : "Esta jornada fue desactivada y no está disponible por el momento."}
          </Text>
        </View>
      )}

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
          <Ionicons name="calendar-outline" size={18} color={colors.primary} style={styles.filaIcono} />
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Fecha</Text>
            <Text style={styles.filaValor}>
              {formatearFecha(jornada.fecha, "dddd, DD [de] MMMM [de] YYYY")}
            </Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Ionicons name="time-outline" size={18} color={colors.primary} style={styles.filaIcono} />
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Hora</Text>
            <Text style={styles.filaValor}>{formatearHora(jornada.fecha)}</Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Ionicons name="location-outline" size={18} color={colors.primary} style={styles.filaIcono} />
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Lugar</Text>
            <Text style={styles.filaValor}>{jornada.lugar}</Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Ionicons name="person-outline" size={18} color={colors.primary} style={styles.filaIcono} />
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

      {inscrito && (
        <View style={styles.confirmacionCard}>
          <View style={styles.confirmacionFila}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={styles.confirmacionTitulo}>¡Estás inscrito!</Text>
          </View>
          <Text style={styles.confirmacionTexto}>
            Tu lugar en esta jornada está reservado. Recuerda asistir el día indicado.
          </Text>
          {puedeCancelar ? (
            <TouchableOpacity
              style={[styles.botonCancelar, cancelando && styles.botonDeshabilitado]}
              onPress={manejarCancelacion}
              disabled={cancelando}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancelar inscripción"
              accessibilityHint="Libera tu cupo en esta jornada"
            >
              {cancelando ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                  <Text style={styles.botonCancelarTexto}>Cancelar inscripción</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.cancelacionNota}>
              El plazo para cancelar terminó ({DIAS_LIMITE_CANCELACION} días antes de la jornada).
            </Text>
          )}
        </View>
      )}
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
    marginTop: 1,
    width: 20,
    textAlign: "center",
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
    flexDirection: "row",
    gap: 8,
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
  botonCancelar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: colors.white,
  },
  botonCancelarTexto: {
    color: colors.error,
    fontSize: 15,
    fontWeight: "700",
  },
  avisoNoDisponible: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${colors.error}15`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  avisoNoDisponibleTexto: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
    fontWeight: "600",
  },
  cancelacionNota: {
    fontSize: 12,
    color: colors.textDisabled,
    marginTop: 4,
  },
  confirmacionCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    gap: 6,
    marginTop: 4,
  },
  confirmacionFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  confirmacionTitulo: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  confirmacionTexto: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
});