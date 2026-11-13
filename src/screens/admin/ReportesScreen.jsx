import React, { useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useEstadisticasApi } from "../../hooks/useAdmin";
import { usaApi } from "../../config/api";
import { compartirReporteJornadas } from "../../services/planillaService";
import { SkeletonReportes } from "../../components/Skeleton";
import { Boton, Indicador, estilos } from "../../components/AdminUi";
import {
  BarraSegmentada,
  BarrasRanking,
  COLOR_GRAFICA_ESTADO,
  Cifra,
  ColumnasMes,
  Medidor,
  TarjetaGrafica,
} from "../../components/Graficas";
import { descomponerFecha } from "../../utils/zonaNegocio";
import { colors } from "../../theme/colors";
import { ETIQUETA_ESTADO } from "../../utils/estadoJornada";
import { calcularEstadisticas } from "../../utils/usuariosAdmin";

function Tabla({ titulo, filas }) {
  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.seccion}>{titulo}</Text>
      {filas.length === 0 ? (
        <Text style={estilos.texto}>Sin datos.</Text>
      ) : (
        filas.map(([nombre, valor]) => (
          <View key={nombre} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={[estilos.texto, { flex: 1 }]}>{nombre}</Text>
            <Text style={{ fontWeight: "700", color: colors.textPrimary }}>{valor}</Text>
          </View>
        ))
      )}
    </View>
  );
}

// Estadísticas globales de la plataforma y reporte de jornadas descargable
export default function ReportesScreen() {
  // Con la API (módulo "reportes") el servidor calcula las estadísticas y genera el reporte
  const conApi = usaApi("reportes");
  const remoto = useEstadisticasApi(conApi);
  const [exportando, setExportando] = useState(false);
  // Gráficas (por defecto) o tablas con las mismas cifras
  const [vista, setVista] = useState("graficas");
  const [actualizando, setActualizando] = useState(false);
  const ahora = Date.now();

  if (conApi && remoto.cargando && !remoto.estadisticas) {
    return <SkeletonReportes />;
  }

  const stats = remoto.estadisticas ?? calcularEstadisticas([], []);
  const ordenar = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const porGestor = (remoto.estadisticas?.porGestorNombre ?? [])
    .map((g) => [g.nombre, g.jornadas])
    .sort((a, b) => b[1] - a[1]);

  const exportar = async () => {
    setExportando(true);
    try {
      if (!conApi) throw new Error("El servidor de Jornada Viva no está configurado en esta versión de la app.");
      // El servidor genera el reporte en Excel (y deja constancia en la auditoría)
      await compartirReporteJornadas();
    } catch (e) {
      Alert.alert("No se pudo generar el reporte", e?.message || "Intenta de nuevo.");
    } finally {
      setExportando(false);
    }
  };

  const alDeslizar = async () => {
    setActualizando(true);
    try {
      await remoto.recargar();
    } finally {
      setActualizando(false);
    }
  };

  const filasEstado = Object.entries(stats.porEstado);
  const filasRol = [
    ["Alumnos", stats.estudiantes],
    ["Gestores", stats.gestores],
    ["Administradores", stats.administradores],
  ];

  return (
    <ScrollView
      style={estilos.pantalla}
      contentContainerStyle={estilos.contenido}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={alDeslizar}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.selector} accessibilityRole="tablist">
        {[
          ["graficas", "Gráficas"],
          ["tablas", "Tablas"],
        ].map(([valor, etiqueta]) => (
          <TouchableOpacity
            key={valor}
            style={[styles.opcion, vista === valor && styles.opcionActiva]}
            onPress={() => setVista(valor)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: vista === valor }}
          >
            <Text style={[styles.opcionTexto, vista === valor && styles.opcionTextoActiva]}>{etiqueta}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {vista === "graficas" ? (
        <>
          <View style={styles.cifras}>
            <Cifra valor={stats.totalJornadas} etiqueta="Jornadas" />
            <Cifra valor={`${stats.ocupacion}%`} etiqueta="Ocupación de cupos" />
            <Cifra valor={stats.cuposOcupados} etiqueta="Inscripciones" color={colors.primaryLight} />
          </View>

          <TarjetaGrafica titulo="Ocupación de cupos" subtitulo="Cupos usados frente al total ofrecido">
            <Medidor valor={stats.cuposOcupados} total={stats.cuposTotales} etiqueta="cupos" />
          </TarjetaGrafica>

          {/* Solo si el cálculo trae el dato por mes (una API desactualizada no lo envía) */}
          {!!stats.porMes && (
            <TarjetaGrafica titulo="Jornadas por mes" subtitulo="Evolución de las jornadas programadas">
              <ColumnasMes porMes={stats.porMes} mesActual={descomponerFecha(ahora).dia.slice(0, 7)} />
            </TarjetaGrafica>
          )}

          <TarjetaGrafica titulo="Jornadas por estado" subtitulo="Cómo se reparte el total de jornadas">
            <BarraSegmentada
              segmentos={filasEstado.map(([estado, n]) => ({
                etiqueta: ETIQUETA_ESTADO[estado],
                valor: n,
                color: COLOR_GRAFICA_ESTADO[estado],
              }))}
            />
          </TarjetaGrafica>

          <TarjetaGrafica titulo="Jornadas por espacio" subtitulo="Espacios con más jornadas">
            <BarrasRanking filas={ordenar(stats.porEspacio)} tope={8} />
          </TarjetaGrafica>

          <TarjetaGrafica titulo="Jornadas por gestor" subtitulo="Quién organiza más jornadas">
            <BarrasRanking filas={porGestor} tope={6} color={colors.primaryLight} />
          </TarjetaGrafica>

          <TarjetaGrafica titulo="Usuarios por rol" subtitulo={`${stats.totalUsuarios} usuarios registrados`}>
            <BarrasRanking filas={filasRol} tope={6} unidad="usuarios" />
            {stats.cuentasInactivas > 0 && (
              <Text style={styles.nota}>
                {stats.cuentasInactivas} {stats.cuentasInactivas === 1 ? "cuenta inactiva" : "cuentas inactivas"}
              </Text>
            )}
          </TarjetaGrafica>
        </>
      ) : (
        <>
          <View style={estilos.fila}>
            <Indicador valor={stats.totalJornadas} etiqueta="Jornadas" />
            <Indicador valor={`${stats.ocupacion}%`} etiqueta="Ocupación de cupos" />
            <Indicador valor={stats.cuposOcupados} etiqueta="Inscripciones (cupos usados)" color={colors.primaryLight} />
          </View>
          <Tabla titulo="Jornadas por estado" filas={filasEstado.map(([e, n]) => [ETIQUETA_ESTADO[e], n])} />
          <Tabla titulo="Jornadas por espacio" filas={ordenar(stats.porEspacio)} />
          <Tabla titulo="Jornadas por gestor" filas={porGestor} />
          <Tabla titulo="Usuarios por rol" filas={[...filasRol, ["Cuentas inactivas", stats.cuentasInactivas]]} />
        </>
      )}

      <Boton texto="Descargar reporte de jornadas (Excel)" onPress={exportar} cargando={exportando} deshabilitado={stats.totalJornadas === 0} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: "row",
    backgroundColor: colors.border,
    borderRadius: 14,
    padding: 3,
  },
  opcion: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  opcionActiva: { backgroundColor: colors.surface },
  opcionTexto: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  opcionTextoActiva: { color: colors.primary },
  cifras: { flexDirection: "row", gap: 10 },
  nota: { fontSize: 12, fontWeight: "700", color: colors.error },
});
