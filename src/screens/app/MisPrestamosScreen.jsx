import React, { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import LoadingSpinner from "../../components/LoadingSpinner";
import PrestamoItem from "../../components/PrestamoItem";
import { useMisPrestamos } from "../../hooks/usePrestamos";
import { colors } from "../../theme/colors";
import { formatearFecha } from "../../utils/jornadaFecha";
import { conteoPlural } from "../../utils/plural";
import { contarPrestamos, ordenarPrestamos } from "../../utils/prestamos";

// FE-02 · Los objetos que el estudiante tiene prestados (libros, equipos, materiales) con la alerta
// de devolución. Funciona sin conexión con la última copia guardada.
export default function MisPrestamosScreen() {
  const { prestamos, cargando, error, guardadoEn, recargar } = useMisPrestamos();
  const [actualizando, setActualizando] = useState(false);
  const ahora = Date.now();
  const conteo = useMemo(() => contarPrestamos(prestamos, ahora), [prestamos, ahora]);
  const ordenados = useMemo(() => ordenarPrestamos(prestamos, ahora), [prestamos, ahora]);

  if (cargando && prestamos.length === 0) return <LoadingSpinner mensaje="Cargando tus préstamos..." />;

  const alerta =
    conteo.vencidos > 0
      ? {
          color: colors.error,
          texto: `${conteoPlural(conteo.vencidos, "préstamo vencido", "préstamos vencidos")}: devuélvelo${
            conteo.vencidos > 1 ? "s" : ""
          } lo antes posible.`,
        }
      : conteo.porVencer > 0
      ? {
          color: colors.accent,
          texto: `${conteoPlural(conteo.porVencer, "préstamo por vencer", "préstamos por vencer")}: revisa la fecha de devolución.`,
        }
      : null;

  const encabezado = (
    <View style={styles.encabezado}>
      {alerta && (
        <View style={[styles.alerta, { borderColor: alerta.color }]} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={18} color={alerta.color} />
          <Text style={styles.alertaTexto}>{alerta.texto}</Text>
        </View>
      )}
      {guardadoEn != null && (
        <Text style={styles.copia}>
          Sin conexión: datos guardados el {formatearFecha(guardadoEn, "D [de] MMMM, h:mm A")}.
        </Text>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );

  return (
    <FlatList
      style={styles.contenedor}
      data={ordenados}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={encabezado}
      renderItem={({ item }) => <PrestamoItem prestamo={item} ahora={ahora} />}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={async () => {
            setActualizando(true);
            await recargar();
            setActualizando(false);
          }}
          colors={[colors.primary]}
        />
      }
      ListEmptyComponent={
        !error ? (
          <View style={styles.vacio}>
            <Ionicons name="library-outline" size={44} color={colors.textDisabled} />
            <Text style={styles.vacioTexto}>No tienes objetos prestados.{"\n"}Aquí aparecerán los libros y equipos que te presten.</Text>
          </View>
        ) : null
      }
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  encabezado: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  alerta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
  },
  alertaTexto: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  copia: { fontSize: 12, color: colors.textSecondary },
  error: { fontSize: 13, color: colors.error },
  vacio: { alignItems: "center", gap: 12, padding: 32 },
  vacioTexto: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
});
