import React from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useSync } from "../../context/SyncContext";
import { colors } from "../../theme/colors";
import { ESTADOS, TIPOS, resumenSincronizacion } from "../../utils/sincronizacion";

const ETIQUETA_TIPO = {
  [TIPOS.INSCRIBIR]: "Inscripción",
  [TIPOS.CANCELAR]: "Cancelación de inscripción",
};

const estadoVisual = (accion) => {
  if (accion.estado === ESTADOS.RECHAZADA) {
    return { texto: "Con error", color: colors.error };
  }
  if (accion.estado === ESTADOS.SINCRONIZANDO) {
    return { texto: "Sincronizando", color: colors.primaryLight };
  }
  return { texto: "Pendiente por sincronizar", color: colors.warning };
};

// Acciones realizadas sin conexión que aún no llegan a Firestore
export default function SincronizacionScreen() {
  const { enLinea } = useConnectivity();
  const { cola, pendientes, rechazadas, sincronizando, ultimaSync, procesar, reintentar, descartar } =
    useSync();

  const sincronizarAhora = () => {
    if (!enLinea) {
      Alert.alert(
        "Sin conexión",
        "Necesitas conexión a internet para sincronizar. Tus acciones siguen guardadas en el dispositivo."
      );
      return;
    }
    procesar({ forzar: true });
  };

  const confirmarDescarte = (accion) => {
    Alert.alert(
      "Descartar acción",
      `Se eliminará "${ETIQUETA_TIPO[accion.tipo]}" de "${accion.tituloJornada || "la jornada"}" y no se enviará al servidor.\n\n¿Deseas continuar?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: () => descartar(accion.id) },
      ]
    );
  };

  const reintentarAccion = async (accion) => {
    await reintentar(accion.id);
    sincronizarAhora();
  };

  return (
    <View style={styles.contenedor}>
      <View style={styles.resumen}>
        <Text style={styles.resumenTitulo}>
          {resumenSincronizacion({ nPendientes: pendientes.length, nRechazadas: rechazadas.length })}
        </Text>
        <Text style={styles.resumenTexto}>
          {ultimaSync
            ? `Última sincronización: ${dayjs(ultimaSync).locale("es").format("D MMM, h:mm A")}`
            : "Aún no hay sincronizaciones"}
        </Text>
        <TouchableOpacity
          style={[styles.botonSincronizar, sincronizando && styles.deshabilitado]}
          onPress={sincronizarAhora}
          disabled={sincronizando}
          accessibilityRole="button"
          accessibilityLabel="Sincronizar ahora"
        >
          <Ionicons name="sync-outline" size={16} color={colors.white} />
          <Text style={styles.botonSincronizarTexto}>
            {sincronizando ? "Sincronizando..." : "Sincronizar ahora"}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={cola}
        keyExtractor={(item) => item.id}
        contentContainerStyle={cola.length === 0 ? styles.listaVacia : styles.lista}
        renderItem={({ item }) => {
          const estado = estadoVisual(item);
          return (
            <View style={styles.tarjeta}>
              <View style={styles.tarjetaFila}>
                <Text style={styles.titulo} numberOfLines={2}>
                  {item.tituloJornada || "Jornada"}
                </Text>
                <View style={[styles.chip, { backgroundColor: estado.color }]}>
                  <Text style={styles.chipTexto}>{estado.texto}</Text>
                </View>
              </View>
              <Text style={styles.detalle}>
                {ETIQUETA_TIPO[item.tipo]} · registrada el{" "}
                {dayjs(item.creadaEn).locale("es").format("D MMM, h:mm A")}
              </Text>
              {!!item.ultimoError && (
                <Text style={styles.error}>
                  {item.estado === ESTADOS.RECHAZADA
                    ? item.ultimoError
                    : `${item.ultimoError} Se reintentará automáticamente.`}
                </Text>
              )}
              {item.estado !== ESTADOS.SINCRONIZANDO && (
                <View style={styles.acciones}>
                  <TouchableOpacity
                    style={styles.accion}
                    onPress={() => reintentarAccion(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Reintentar"
                  >
                    <Ionicons name="refresh-outline" size={16} color={colors.primary} />
                    <Text style={styles.accionTexto}>Reintentar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.accion}
                    onPress={() => confirmarDescarte(item)}
                    accessibilityRole="button"
                    accessibilityLabel="Descartar"
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={[styles.accionTexto, { color: colors.error }]}>Descartar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.centrado}>
            <Ionicons name="checkmark-done-circle-outline" size={54} color={colors.textDisabled} />
            <Text style={styles.vacioTitulo}>Todo está sincronizado</Text>
            <Text style={styles.vacioTexto}>
              Las acciones que hagas sin conexión aparecerán aquí hasta enviarse.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  resumen: {
    padding: 16,
    gap: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resumenTitulo: { fontSize: 16, color: colors.textPrimary, fontWeight: "800" },
  resumenTexto: { fontSize: 13, color: colors.textSecondary, fontWeight: "600" },
  botonSincronizar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  botonSincronizarTexto: { color: colors.white, fontWeight: "700", fontSize: 14 },
  deshabilitado: { opacity: 0.6 },
  lista: { padding: 16, gap: 12 },
  listaVacia: { flex: 1 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tarjetaFila: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  titulo: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  chipTexto: { color: colors.white, fontSize: 11, fontWeight: "700" },
  detalle: { fontSize: 12, color: colors.textSecondary },
  error: { fontSize: 12, color: colors.error },
  acciones: { flexDirection: "row", gap: 16, marginTop: 4 },
  accion: { flexDirection: "row", alignItems: "center", gap: 4 },
  accionTexto: { fontSize: 13, fontWeight: "700", color: colors.primary },
  centrado: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  vacioTitulo: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  vacioTexto: { fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 20 },
});
