import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useEstadisticasApi, useTodasJornadas, useUsuarios } from "../../hooks/useAdmin";
import { usaApi } from "../../config/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import SaludoHeader from "../../components/SaludoHeader";
import { colors } from "../../theme/colors";
import { calcularEstadisticas } from "../../utils/usuariosAdmin";

const COLOR_ALUMNOS = colors.primary;
const COLOR_GESTORES = colors.accent;
const COLOR_ADMINS = colors.textSecondary;

function Leyenda({ color, etiqueta, valor }) {
  return (
    <View style={styles.leyenda} accessibilityLabel={`${etiqueta}: ${valor}`}>
      <View style={[styles.leyendaPunto, { backgroundColor: color }]} />
      <Text style={styles.leyendaTexto}>{etiqueta}</Text>
      <Text style={styles.leyendaValor}>{valor}</Text>
    </View>
  );
}

function Mosaico({ icono, color, valor, etiqueta }) {
  return (
    <View style={styles.mosaico} accessibilityLabel={`${etiqueta}: ${valor}`}>
      <View style={[styles.mosaicoIcono, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icono} size={20} color={color} />
      </View>
      <Text style={styles.mosaicoValor}>{valor}</Text>
      <Text style={styles.mosaicoEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

// Panel de control del administrador: saludo e indicadores globales de usuarios y jornadas
export default function AdminDashboardScreen() {
  const { usuario } = useAuth();
  // Con la API (módulo "reportes") el servidor calcula los indicadores
  const conApi = usaApi("reportes");
  const u = useUsuarios(!conApi);
  const j = useTodasJornadas(null, !conApi);
  const remoto = useEstadisticasApi(conApi);
  const local = useMemo(
    () => (conApi ? null : calcularEstadisticas(u.usuarios, j.jornadas)),
    [conApi, u.usuarios, j.jornadas]
  );
  // Sin datos (p. ej. sin conexión) se muestran los indicadores en cero, igual que antes
  const stats = (conApi ? remoto.estadisticas : local) ?? calcularEstadisticas([], []);

  const [actualizando, setActualizando] = useState(false);
  const reintentar = useCallback(async () => {
    if (conApi) {
      await remoto.recargar();
    } else {
      // Datos locales: se vuelve a abrir la escucha (se actualiza sola al llegar los datos)
      u.reintentar();
      j.reintentar();
    }
  }, [conApi, remoto.recargar, u.reintentar, j.reintentar]);
  const alDeslizar = async () => {
    setActualizando(true);
    await reintentar();
    setActualizando(false);
  };

  if (conApi ? remoto.cargando && !remoto.estadisticas : u.cargando || j.cargando) {
    return <LoadingSpinner mensaje="Cargando el panel..." />;
  }

  const error = conApi ? remoto.error : u.error || j.error;
  const sinDatos = conApi ? !remoto.estadisticas : u.usuarios.length === 0;
  const enLinea = conApi ? remoto.enLinea : u.enLinea;
  const nombre = (usuario?.displayName || "Administrador").trim().split(" ")[0];

  const total = stats.totalUsuarios || 0;
  const parte = (n) => (total > 0 ? Math.max(0, n) / total : 0);
  const ocupacion = Math.min(100, Math.max(0, Number(stats.ocupacion) || 0));

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={alDeslizar}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <SaludoHeader
        nombre={nombre}
        rol="Administrador"
        texto="Así va la plataforma: usuarios, jornadas y ocupación en un vistazo."
      />

      <View style={styles.cuerpo}>
        {!!error && (
          <View style={[styles.aviso, styles.avisoError]} accessibilityRole="alert">
            <Ionicons name="warning-outline" size={18} color={colors.error} />
            <Text style={[styles.avisoTexto, { color: colors.error }]}>{error}</Text>
            <TouchableOpacity
              style={styles.reintentar}
              onPress={reintentar}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Reintentar"
            >
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={styles.reintentarTexto}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        )}
        {!enLinea && sinDatos && (
          <View style={styles.aviso}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.avisoTexto}>
              Sin conexión: conéctate a internet para ver los datos de la plataforma.
            </Text>
          </View>
        )}

        <Text style={styles.seccion}>Usuarios</Text>
        <View style={styles.tarjeta}>
          <View style={styles.totalFila}>
            <Text style={styles.totalValor}>{total}</Text>
            <Text style={styles.totalEtiqueta}>usuarios registrados</Text>
          </View>
          <View style={styles.barra} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {total > 0 && (
              <>
                <View style={{ flex: parte(stats.estudiantes), backgroundColor: COLOR_ALUMNOS }} />
                <View style={{ flex: parte(stats.gestores), backgroundColor: COLOR_GESTORES }} />
                <View style={{ flex: parte(stats.administradores), backgroundColor: COLOR_ADMINS }} />
              </>
            )}
          </View>
          <Leyenda color={COLOR_ALUMNOS} etiqueta="Alumnos" valor={stats.estudiantes} />
          <Leyenda color={COLOR_GESTORES} etiqueta="Gestores" valor={stats.gestores} />
          <Leyenda color={COLOR_ADMINS} etiqueta="Administradores" valor={stats.administradores} />
          {stats.cuentasInactivas > 0 && (
            <View style={styles.inactivas} accessibilityLabel={`Cuentas inactivas: ${stats.cuentasInactivas}`}>
              <Ionicons name="person-remove-outline" size={16} color={colors.error} />
              <Text style={styles.inactivasTexto}>
                {stats.cuentasInactivas} {stats.cuentasInactivas === 1 ? "cuenta inactiva" : "cuentas inactivas"}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.seccion}>Jornadas</Text>
        <View style={styles.tarjeta}>
          <View style={styles.totalFila}>
            <Text style={styles.totalValor}>{stats.totalJornadas}</Text>
            <Text style={styles.totalEtiqueta}>jornadas en total</Text>
          </View>
          <View
            style={styles.ocupacion}
            accessibilityLabel={`Ocupación de cupos: ${ocupacion}%`}
          >
            <View style={styles.ocupacionCabecera}>
              <Text style={styles.ocupacionEtiqueta}>Ocupación de cupos</Text>
              <Text style={styles.ocupacionValor}>{ocupacion}%</Text>
            </View>
            <View style={styles.pista}>
              <View style={[styles.relleno, { width: `${ocupacion}%` }]} />
            </View>
          </View>
        </View>

        <View style={styles.mosaicos}>
          <Mosaico icono="checkmark-circle-outline" color={colors.success} valor={stats.porEstado.activa} etiqueta="Activas" />
          <Mosaico icono="play-circle-outline" color={colors.accent} valor={stats.porEstado.en_curso} etiqueta="En curso" />
          <Mosaico icono="close-circle-outline" color={colors.error} valor={stats.porEstado.cancelada} etiqueta="Canceladas" />
          <Mosaico icono="flag-outline" color={colors.textSecondary} valor={stats.porEstado.finalizada} etiqueta="Finalizadas" />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { paddingBottom: 32 },
  cuerpo: { padding: 16, gap: 12 },
  seccion: { fontSize: 18, fontWeight: "800", color: colors.textPrimary, marginTop: 8 },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  avisoError: { borderColor: colors.error, backgroundColor: "#FDF2F2" },
  reintentar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.error,
  },
  reintentarTexto: { fontSize: 13, fontWeight: "800", color: colors.white },
  avisoTexto: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  totalFila: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  totalValor: { fontSize: 38, fontWeight: "800", color: colors.primary },
  totalEtiqueta: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  barra: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  leyenda: { flexDirection: "row", alignItems: "center", gap: 10 },
  leyendaPunto: { width: 10, height: 10, borderRadius: 5 },
  leyendaTexto: { flex: 1, fontSize: 14, color: colors.textPrimary },
  leyendaValor: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  inactivas: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: "#FDF2F2",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inactivasTexto: { fontSize: 12, fontWeight: "700", color: colors.error },
  ocupacion: { gap: 8 },
  ocupacionCabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  ocupacionEtiqueta: { fontSize: 14, color: colors.textSecondary, fontWeight: "600" },
  ocupacionValor: { fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  pista: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: "hidden" },
  relleno: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  mosaicos: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  mosaico: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  mosaicoIcono: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  mosaicoValor: { fontSize: 26, fontWeight: "800", color: colors.textPrimary },
  mosaicoEtiqueta: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
});
