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
import {
  mensajeDeErrorAsistencia,
  registrarAsistenciaEstudiante,
} from "../../services/asistenciaService";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadas } from "../../context/JornadasContext";
import { useSync } from "../../context/SyncContext";
import { TIPOS } from "../../utils/sincronizacion";

export default function EscanearAsistenciaScreen({ navigation, route }) {
  const { jornadaId, jornadaFecha, duracionMin, tituloJornada } = route.params || {};
  const [permission, requestPermission] = useCameraPermissions();
  const [procesando, setProcesando] = useState(false);
  const [escaneado, setEscaneado] = useState(false);
  const { enLinea } = useConnectivity();
  const { estadoInscripcion } = useJornadas();
  const { encolar } = useSync();

  // Sin conexión (o si la red falla al enviar): el escaneo se guarda en el dispositivo y se envía
  // al reconectar con la hora en que se hizo; el servidor valida el código con esa hora.
  const guardarParaDespues = async (datos) => {
    const titulo = datos.titulo || tituloJornada || "la jornada";
    const { resultado } = await encolar({
      tipo: TIPOS.REGISTRAR_ASISTENCIA,
      jornadaId: datos.jornadaId,
      codigo: datos.codigo,
      tituloJornada: titulo,
      fechaJornada: jornadaFecha ?? null,
      sinConexion: true,
    });
    Alert.alert(
      resultado === "duplicada" ? "Asistencia ya guardada" : "Asistencia guardada",
      resultado === "duplicada"
        ? `Ya habías guardado tu asistencia a "${titulo}": está pendiente por sincronizar.`
        : `Tu asistencia a "${titulo}" quedó guardada en el dispositivo, pendiente por sincronizar. Se confirmará cuando recuperes la conexión.`,
      [{ text: "Aceptar", onPress: () => navigation.goBack() }]
    );
  };

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

    // Aviso rápido con el reloj del dispositivo; quien decide es el servidor
    const ventana = estadoVentanaAsistencia(jornadaFecha, Date.now(), duracionMin);

    if (jornadaFecha && !ventana.disponible) {
      Alert.alert("Asistencia no disponible", ventana.mensaje, [
        { text: "Entendido", onPress: () => navigation.goBack() },
      ]);
      return;
    }

    // Sin conexión: se comprueba con lo guardado que estás inscrito y se deja la asistencia pendiente
    if (!enLinea) {
      if (!estadoInscripcion(datos.jornadaId).inscrito) {
        Alert.alert("No estás inscrito", "Solo puedes registrar asistencia en jornadas en las que estás inscrito.", [
          { text: "Entendido", onPress: () => navigation.goBack() },
        ]);
        return;
      }
      setProcesando(true);
      try {
        await guardarParaDespues(datos);
      } catch (err) {
        console.warn("Error al guardar la asistencia:", err);
        Alert.alert("No se pudo guardar", "No se pudo guardar la asistencia en el dispositivo. Intenta de nuevo.", [
          { text: "Reintentar", onPress: () => setEscaneado(false) },
        ]);
      } finally {
        setProcesando(false);
      }
      return;
    }

    // El servidor valida el código del QR, la ventana de asistencia y tu inscripción
    setProcesando(true);
    try {
      const resultado = await registrarAsistenciaEstudiante(datos.jornadaId, datos.codigo);
      const titulo = datos.titulo || tituloJornada || "la jornada";
      Alert.alert(
        resultado === "ya-registrada" ? "Asistencia ya registrada" : "¡Asistencia Registrada!",
        resultado === "ya-registrada"
          ? `Tu asistencia a "${titulo}" ya estaba confirmada.`
          : `Se ha confirmado tu asistencia exitosamente a "${titulo}".`,
        [{ text: "Aceptar", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      console.warn("Error al registrar asistencia:", err);
      // Se cayó la red al enviar: no se pierde el escaneo, queda guardado para sincronizar
      if (err?.name === "ErrorRed") {
        try {
          await guardarParaDespues(datos);
          return;
        } catch (_e) {
          /* si tampoco se puede guardar, se informa el error original */
        }
      }
      Alert.alert("No se pudo registrar", mensajeDeErrorAsistencia(err), [
        { text: "Reintentar", onPress: () => setEscaneado(false) },
      ]);
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
