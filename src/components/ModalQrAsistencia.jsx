import React, { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import {
  estadoVentanaAsistencia,
  generarPayloadQrAsistencia,
} from "../utils/asistencia";
import { formatearFecha, formatearHora } from "../utils/jornadaFecha";

export default function ModalQrAsistencia({ visible, jornada, alCerrar, ahora = Date.now() }) {
  const viewShotRef = useRef(null);
  const [compartiendo, setCompartiendo] = useState(false);

  if (!jornada) return null;

  const ventana = estadoVentanaAsistencia(jornada.fecha, ahora);
  const payload = generarPayloadQrAsistencia(jornada);

  const guardarOCompartirImagen = async () => {
    if (!viewShotRef.current?.capture) return;
    setCompartiendo(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Compartir no disponible", "Tu dispositivo no admite compartir archivos.");
        return;
      }

      const uriCaptura = await viewShotRef.current.capture();
      const nombreArchivo = `QR_Asistencia_${jornada.id || "jornada"}.png`;
      const archivoDestino = new File(Paths.cache, nombreArchivo);

      // Copiar el archivo generado a la caché para compartir
      const archivoOrigen = new File(uriCaptura);
      const bytes = await archivoOrigen.bytes();
      archivoDestino.create({ overwrite: true });
      await archivoDestino.write(bytes);

      await Sharing.shareAsync(archivoDestino.uri, {
        mimeType: "image/png",
        dialogTitle: `Código QR - ${jornada.titulo}`,
      });
    } catch (err) {
      console.warn("Error al compartir imagen QR:", err);
      Alert.alert("Error", "No se pudo generar o compartir la imagen del código QR.");
    } finally {
      setCompartiendo(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={alCerrar}>
      <View style={styles.fondo}>
        <View style={styles.tarjeta}>
          <View style={styles.cabecera}>
            <View style={{ flex: 1 }}>
              <Text style={styles.etiqueta}>ASISTENCIA POR QR</Text>
              <Text style={styles.titulo} numberOfLines={2}>
                {jornada.titulo}
              </Text>
            </View>
            <TouchableOpacity onPress={alCerrar} style={styles.botonCerrar}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Banner de estado de la ventana de 20 minutos */}
          <View
            style={[
              styles.bannerVentana,
              ventana.disponible
                ? styles.bannerAbierto
                : ventana.estado === "ANTES"
                ? styles.bannerAntes
                : styles.bannerExpirado,
            ]}
          >
            <Ionicons
              name={
                ventana.disponible
                  ? "time"
                  : ventana.estado === "ANTES"
                  ? "hourglass-outline"
                  : "alert-circle"
              }
              size={18}
              color={
                ventana.disponible
                  ? colors.success
                  : ventana.estado === "ANTES"
                  ? colors.primary
                  : colors.error
              }
            />
            <Text
              style={[
                styles.textoVentana,
                {
                  color: ventana.disponible
                    ? colors.success
                    : ventana.estado === "ANTES"
                    ? colors.primary
                    : colors.error,
                },
              ]}
            >
              {ventana.mensaje}
            </Text>
          </View>

          {/* Contenedor del QR capturable */}
          <ViewShot
            ref={viewShotRef}
            options={{ format: "png", quality: 1.0 }}
            style={styles.contenedorQr}
          >
            <Text style={styles.tituloQr}>{jornada.titulo}</Text>
            <Text style={styles.subtituloQr}>
              {formatearFecha(jornada.fecha, "DD/MM/YYYY")} · {formatearHora(jornada.fecha)}
            </Text>

            <View style={styles.marcoQr}>
              <QRCode
                value={payload}
                size={220}
                color={colors.textPrimary}
                backgroundColor={colors.white}
              />
            </View>

            <Text style={styles.pieQr}>Escanea con la app Jornada Viva</Text>
          </ViewShot>

          <View style={styles.acciones}>
            <TouchableOpacity
              style={styles.botonCompartir}
              onPress={guardarOCompartirImagen}
              disabled={compartiendo}
              activeOpacity={0.8}
            >
              {compartiendo ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color={colors.white} />
                  <Text style={styles.botonCompartirTexto}>Guardar / Compartir imagen</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.botonListo} onPress={alCerrar} activeOpacity={0.8}>
              <Text style={styles.botonListoTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  cabecera: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    gap: 10,
  },
  etiqueta: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  titulo: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
    marginTop: 2,
  },
  botonCerrar: {
    padding: 4,
  },
  bannerVentana: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    width: "100%",
  },
  bannerAbierto: {
    backgroundColor: "rgba(46, 125, 50, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(46, 125, 50, 0.3)",
  },
  bannerAntes: {
    backgroundColor: "rgba(33, 150, 243, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(33, 150, 243, 0.3)",
  },
  bannerExpirado: {
    backgroundColor: "rgba(211, 47, 47, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(211, 47, 47, 0.3)",
  },
  textoVentana: {
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  contenedorQr: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
  },
  tituloQr: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtituloQr: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  marcoQr: {
    padding: 10,
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  pieQr: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  acciones: {
    width: "100%",
    gap: 10,
    marginTop: 6,
  },
  botonCompartir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  botonCompartirTexto: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  botonListo: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  botonListoTexto: {
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 14,
  },
});
