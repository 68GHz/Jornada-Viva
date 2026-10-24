import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useConnectivity } from "../context/ConnectivityContext";
import { useSync } from "../context/SyncContext";
import { navigationRef } from "../navigation/navigationRef";
import { colors } from "../theme/colors";
import { elegirAviso } from "../utils/sincronizacion";

// Aspecto de cada aviso; `abre` indica que al tocarlo se abre la pantalla de sincronización
const ESTILOS = {
  sincronizando: { fondo: colors.primaryLight, texto: colors.white, icono: null },
  conectado: { fondo: colors.primary, texto: colors.white, icono: "wifi" },
  "sin-conexion": {
    fondo: colors.textPrimary,
    texto: colors.white,
    icono: "cloud-offline-outline",
  },
  "error-sync": {
    fondo: colors.warning,
    texto: colors.textPrimary,
    icono: "alert-circle-outline",
    abre: true,
  },
  rechazadas: {
    fondo: colors.error,
    texto: colors.white,
    icono: "alert-circle-outline",
    abre: true,
  },
};

// Aviso del estado de conexión y de sincronización. Muestra un solo mensaje a la vez
// (ver elegirAviso) y no ocupa espacio cuando no hay nada que informar.
export default function ConnectionBanner() {
  const insets = useSafeAreaInsets();
  const { usuario, rol } = useAuth();
  const { enLinea } = useConnectivity();
  const { pendientes, rechazadas, sincronizando, avisoConexion, errorSync } = useSync();

  const aviso = elegirAviso({
    enLinea,
    sincronizando,
    avisoConexion,
    errorSync,
    nPendientes: pendientes.length,
    nRechazadas: rechazadas.length,
  });
  if (!aviso) return null;

  const estilo = ESTILOS[aviso.tipo];
  // La pantalla de sincronización existe solo para estudiantes con sesión iniciada
  const abrible = !!usuario && rol === "estudiante" && !!estilo.abre;
  const abrir = () => {
    if (abrible && navigationRef.isReady()) navigationRef.navigate("Sincronizacion");
  };

  return (
    <TouchableOpacity
      activeOpacity={abrible ? 0.8 : 1}
      onPress={abrir}
      disabled={!abrible}
      style={[
        styles.banner,
        { backgroundColor: estilo.fondo, paddingBottom: Math.max(insets.bottom, 4) },
      ]}
      accessibilityRole={abrible ? "button" : "text"}
      accessibilityLiveRegion="polite"
      accessibilityLabel={aviso.texto}
    >
      <View style={styles.fila}>
        {estilo.icono ? (
          <Ionicons name={estilo.icono} size={14} color={estilo.texto} />
        ) : (
          <ActivityIndicator size="small" color={estilo.texto} />
        )}
        <Text style={[styles.texto, { color: estilo.texto }]} numberOfLines={2}>
          {aviso.texto}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingTop: 5,
    paddingHorizontal: 12,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  texto: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
