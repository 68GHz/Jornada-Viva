import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import {
  parsearPayloadQrAsistencia,
  estadoVentanaAsistencia,
} from "../../utils/asistencia";
import { registrarAsistenciaEstudiante } from "../../services/asistenciaService";

export default function EscanearAsistenciaScreen({ navigation, route }) {
  const { jornadaId, jornadaFecha, inscripcionId, tituloJornada } = route.params || {};
  const [permission, requestPermission] = useCameraPermissions();
  const [procesando, setProcesando] = useState(false);
  const [escaneado, setEscaneado] = useState(false);

  if (!permission) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.texto}>Verificando permisos de cámara...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centrado}>
        <Ionicons name="camera-outline" size={54} color={colors.textSecondary} />
        <Text style={styles.tituloPermiso}>Permiso de cámara necesario</Text>
        <Text style={styles.textoPermiso}>
          Para registrar tu asistencia autónoma escaneando el código QR proyectado por el gestor,
          necesitamos acceso a la cámara.
        </Text>
        <TouchableOpacity style={styles.botonPermiso} onPress={requestPermission}>
          <Text style={styles.botonPermisoTexto}>Conceder permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const manejarCodigoBarras = async ({ data }) => {
    if (escaneado || procesando) return;
    setEscaneado(true);

    const { valido, datos, error } = parsearPayloadQrAsistencia(data);
    if (!valido) {
      Alert.alert("Código QR inválido", error, [
        { text: "Intentar de nuevo", onPress: () => setEscaneado(false) },
      ]);
      return;
    }

    if (jornadaId && datos.jornadaId !== jornadaId) {
      Alert.alert(
        "Jornada incorrecta",
        `Este código QR corresponde a otra jornada ("${datos.titulo || datos.jornadaId}"). Escanea el código de la jornada en la que estás presente.`,
        [{ text: "Reintentar", onPress: () => setEscaneado(false) }]
      );
      return;
    }

    const fechaEvaluada = jornadaFecha || datos.fecha;
    const ventana = estadoVentanaAsistencia(fechaEvaluada);

    if (!ventana.disponible) {
      Alert.alert("Asistencia no disponible", ventana.mensaje, [
        { text: "Entendido", onPress: () => navigation.goBack() },
      ]);
      return;
    }

    // Registrar en Firestore
    const targetInscripcionId = inscripcionId || `${datos.jornadaId}`;
    setProcesando(true);
    try {
      await registrarAsistenciaEstudiante(targetInscripcionId, fechaEvaluada);
      Alert.alert(
        "¡Asistencia Registrada!",
        `Se ha confirmado tu asistencia exitosamente a "${datos.titulo || tituloJornada || "la jornada"}".`,
        [{ text: "Aceptar", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      console.warn("Error al registrar asistencia:", err);
      Alert.alert(
        "No se pudo registrar",
        err?.message || "Ocurrió un error al procesar tu asistencia. Intenta nuevamente.",
        [{ text: "Reintentar", onPress: () => setEscaneado(false) }]
      );
    } finally {
      setProcesando(false);
    }
  };

  return (
    <View style={styles.contenedor}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={escaneado ? undefined : manejarCodigoBarras}
      />

      <View style={styles.mascara}>
        <View style={styles.cabecera}>
          <Text style={styles.tituloCabecera}>Escanear Asistencia</Text>
          <Text style={styles.subtituloCabecera}>
            Apunta la cámara al código QR de la jornada (primeros 20 minutos).
          </Text>
        </View>

        <View style={styles.recuadroObjetivo}>
          <View style={[styles.esquina, styles.esquinaTL]} />
          <View style={[styles.esquina, styles.esquinaTR]} />
          <View style={[styles.esquina, styles.esquinaBL]} />
          <View style={[styles.esquina, styles.esquinaBR]} />

          {procesando && (
            <View style={styles.cargandoOverlay}>
              <ActivityIndicator size="large" color={colors.white} />
              <Text style={styles.textoCargando}>Confirmando asistencia...</Text>
            </View>
          )}
        </View>

        <View style={styles.pie}>
          <TouchableOpacity style={styles.botonCancelar} onPress={() => navigation.goBack()}>
            <Text style={styles.botonCancelarTexto}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: "#000",
  },
  centrado: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
    backgroundColor: colors.background,
  },
  tituloPermiso: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  textoPermiso: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  botonPermiso: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 8,
  },
  botonPermisoTexto: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
  texto: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  mascara: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  cabecera: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
  },
  tituloCabecera: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "800",
  },
  subtituloCabecera: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    textAlign: "center",
  },
  recuadroObjetivo: {
    width: 250,
    height: 250,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  esquina: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: colors.white,
  },
  esquinaTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  esquinaTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  esquinaBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  esquinaBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  cargandoOverlay: {
    backgroundColor: "rgba(0,0,0,0.75)",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    gap: 10,
  },
  textoCargando: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 13,
  },
  pie: {
    alignItems: "center",
  },
  botonCancelar: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  botonCancelarTexto: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
});
