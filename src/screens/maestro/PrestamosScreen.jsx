import React, { useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Boton, Chip } from "../../components/AdminUi";
import LoadingSpinner from "../../components/LoadingSpinner";
import PrestamoItem from "../../components/PrestamoItem";
import { useConnectivity } from "../../context/ConnectivityContext";
import { usePrestamosGestionados } from "../../hooks/usePrestamos";
import { marcarDevuelto, mensajeDeErrorPrestamo } from "../../services/prestamoService";
import { colors } from "../../theme/colors";
import { formatearFecha } from "../../utils/jornadaFecha";
import { conteoPlural } from "../../utils/plural";
import { contarPrestamos, estadoPrestamo, ordenarPrestamos } from "../../utils/prestamos";

// FE-02 · Préstamos de objetos que gestiona el gestor (los que registró) o el administrador (todos):
// quién tiene qué, hasta cuándo, qué está vencido, y marcar la devolución.
export default function PrestamosScreen({ navigation }) {
  const { enLinea } = useConnectivity();
  const { prestamos, cargando, error, guardadoEn, recargar } = usePrestamosGestionados();
  const [soloActivos, setSoloActivos] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [devolviendoId, setDevolviendoId] = useState(null);
  const ahora = Date.now();

  const conteo = useMemo(() => contarPrestamos(prestamos, ahora), [prestamos, ahora]);
  const visibles = useMemo(() => {
    const lista = soloActivos ? prestamos.filter((p) => estadoPrestamo(p, ahora) !== "devuelto") : prestamos;
    return ordenarPrestamos(lista, ahora);
  }, [prestamos, soloActivos, ahora]);

  const confirmarDevolucion = (prestamo) => {
    if (!enLinea) {
      Alert.alert("Sin conexión", "Para marcar una devolución necesitas conexión a internet.");
      return;
    }
    Alert.alert(
      "Marcar devolución",
      `¿Confirmas que ${prestamo.nombreUsuario || "el estudiante"} devolvió «${prestamo.nombre}» (${prestamo.codigo})?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, devuelto",
          onPress: async () => {
            setDevolviendoId(prestamo.id);
            try {
              await marcarDevuelto(prestamo.id);
              await recargar();
            } catch (err) {
              Alert.alert("No se pudo marcar", mensajeDeErrorPrestamo(err));
            } finally {
              setDevolviendoId(null);
            }
          },
        },
      ]
    );
  };

  if (cargando && prestamos.length === 0) return <LoadingSpinner mensaje="Cargando los préstamos..." />;

  const encabezado = (
    <View style={styles.encabezado}>
      <Boton texto="Registrar préstamo" onPress={() => navigation.navigate("PrestamoForm")} deshabilitado={!enLinea} />
      {!enLinea && <Text style={styles.nota}>Sin conexión: registrar o devolver exige internet; la lista es de la última descarga.</Text>}
      {guardadoEn != null && (
        <Text style={styles.nota}>Datos guardados el {formatearFecha(guardadoEn, "D [de] MMMM, h:mm A")}.</Text>
      )}
      {conteo.vencidos > 0 && (
        <View style={styles.alerta} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.alertaTexto}>
            {conteoPlural(conteo.vencidos, "préstamo vencido", "préstamos vencidos")} sin devolver.
          </Text>
        </View>
      )}
      <View style={styles.filtros}>
        <Chip etiqueta={`Activos (${conteo.activos})`} activo={soloActivos} onPress={() => setSoloActivos(true)} />
        <Chip etiqueta={`Todos (${prestamos.length})`} activo={!soloActivos} onPress={() => setSoloActivos(false)} />
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );

  return (
    <FlatList
      style={styles.contenedor}
      data={visibles}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={encabezado}
      renderItem={({ item }) => (
        <PrestamoItem prestamo={item} ahora={ahora} quien>
          {estadoPrestamo(item, ahora) !== "devuelto" && (
            <View style={{ marginTop: 8 }}>
              <Boton
                texto="Marcar devuelto"
                variante="secundario"
                onPress={() => confirmarDevolucion(item)}
                cargando={devolviendoId === item.id}
              />
            </View>
          )}
        </PrestamoItem>
      )}
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
            <Text style={styles.vacioTexto}>
              {soloActivos ? "No hay objetos prestados en este momento." : "Aún no se ha registrado ningún préstamo."}
            </Text>
          </View>
        ) : null
      }
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  encabezado: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  filtros: { flexDirection: "row", gap: 8 },
  alerta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: 10,
    padding: 12,
  },
  alertaTexto: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  nota: { fontSize: 12, color: colors.textSecondary },
  error: { fontSize: 13, color: colors.error },
  vacio: { alignItems: "center", gap: 12, padding: 32 },
  vacioTexto: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
});
