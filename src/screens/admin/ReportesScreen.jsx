import React, { useMemo, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useEstadisticasApi, useTodasJornadas, useUsuarios } from "../../hooks/useAdmin";
import { usaApi } from "../../config/api";
import { llamarApi } from "../../services/apiClient";
import { auditar } from "../../services/adminService";
import { compartirCsv } from "../../services/planillaService";
import LoadingSpinner from "../../components/LoadingSpinner";
import { Boton, Indicador, estilos } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { ETIQUETA_ESTADO, estadoJornada } from "../../utils/estadoJornada";
import { generarReporteJornadasCsv } from "../../utils/planilla";
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
  const { usuario } = useAuth();
  // Con la API (módulo "reportes") el servidor calcula las estadísticas y genera el reporte
  const conApi = usaApi("reportes");
  const u = useUsuarios(!conApi);
  const j = useTodasJornadas(null, !conApi);
  const remoto = useEstadisticasApi(conApi);
  const [exportando, setExportando] = useState(false);
  const ahora = Date.now();

  const local = useMemo(
    () => (conApi ? null : calcularEstadisticas(u.usuarios, j.jornadas, ahora)),
    [conApi, u.usuarios, j.jornadas] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nombres = useMemo(() => new Map(u.usuarios.map((x) => [x.id, x.nombre || x.email])), [u.usuarios]);

  if (conApi ? remoto.cargando && !remoto.estadisticas : u.cargando || j.cargando) {
    return <LoadingSpinner mensaje="Calculando estadísticas..." />;
  }

  const stats = (conApi ? remoto.estadisticas : local) ?? calcularEstadisticas([], []);
  const ordenar = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const porGestor = conApi
    ? (remoto.estadisticas?.porGestorNombre ?? []).map((g) => [g.nombre, g.jornadas]).sort((a, b) => b[1] - a[1])
    : ordenar(stats.porGestor).map(([id, n]) => [id === "sin-gestor" ? "Sin gestor asignado" : nombres.get(id) || "Gestor desconocido", n]);

  const exportar = async () => {
    setExportando(true);
    try {
      if (conApi) {
        // El servidor genera el reporte (y deja constancia en la auditoría)
        const csv = await llamarApi("GET", "/v1/admin/reporte-jornadas.csv", { texto: true });
        await compartirCsv("reporte-jornadas.csv", csv, "Reporte de jornadas");
        return;
      }
      const filas = j.jornadas.map((x) => ({
        titulo: x.titulo,
        fecha: x.fecha,
        lugar: x.lugar,
        estado: ETIQUETA_ESTADO[estadoJornada(x, ahora)],
        gestor: x.creadoPor ? nombres.get(x.creadoPor) || "Gestor desconocido" : "Sin gestor asignado",
        cuposTotales: x.cuposTotales || 0,
        cuposOcupados: x.cuposOcupados || 0,
      }));
      await compartirCsv("reporte-jornadas.csv", generarReporteJornadasCsv(filas), "Reporte de jornadas");
      auditar({ uid: usuario.uid, nombre: usuario.displayName || usuario.email }, { accion: "reporte.exportar", entidad: "reporte", entidadId: "jornadas", detalle: `${filas.length} jornadas` });
    } catch (e) {
      Alert.alert("No se pudo generar el reporte", e?.message || "Intenta de nuevo.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={estilos.fila}>
        <Indicador valor={stats.totalJornadas} etiqueta="Jornadas" />
        <Indicador valor={`${stats.ocupacion}%`} etiqueta="Ocupación de cupos" />
        <Indicador valor={stats.cuposOcupados} etiqueta="Inscripciones (cupos usados)" color={colors.primaryLight} />
      </View>
      <Tabla titulo="Jornadas por estado" filas={Object.entries(stats.porEstado).map(([e, n]) => [ETIQUETA_ESTADO[e], n])} />
      <Tabla titulo="Jornadas por espacio" filas={ordenar(stats.porEspacio)} />
      <Tabla titulo="Jornadas por gestor" filas={porGestor} />
      <Tabla
        titulo="Usuarios por rol"
        filas={[["Alumnos", stats.estudiantes], ["Gestores", stats.gestores], ["Administradores", stats.administradores], ["Cuentas inactivas", stats.cuentasInactivas]]}
      />
      <Boton texto="Descargar reporte de jornadas (Excel)" onPress={exportar} cargando={exportando} deshabilitado={stats.totalJornadas === 0} />
    </ScrollView>
  );
}
