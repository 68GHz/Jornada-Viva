import React, { useMemo } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useAuditoria } from "../../hooks/useAdmin";
import { SkeletonAuditoria } from "../../components/Skeleton";
import { Vacio } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { conteoPlural } from "../../utils/plural";
import { descomponerFecha } from "../../utils/zonaNegocio";

const ETIQUETA_ACCION = {
  "usuario.crear": "Cuenta creada",
  "usuario.rol": "Cambio de rol",
  "usuario.estado": "Cambio de estado de cuenta",
  "usuario.editar": "Usuario editado",
  "jornada.crear": "Jornada creada",
  "jornada.editar": "Jornada editada",
  "jornada.reasignar": "Jornada reasignada",
  "jornada.cancelar": "Jornada cancelada",
  "jornada.reactivar": "Jornada reactivada",
  "jornada.eliminar": "Jornada eliminada",
  "reporte.exportar": "Reporte exportado",
  "prestamo.crear": "Préstamo registrado",
  "prestamo.devolver": "Préstamo devuelto",
};

// Ícono y color de cada acción: lo que se crea o reactiva en verde, lo que se cancela o elimina en rojo
function estiloAccion(accion = "") {
  const [grupo, verbo] = accion.split(".");
  const icono =
    grupo === "usuario" ? "person-outline" : grupo === "jornada" ? "calendar-outline" : grupo === "reporte" ? "document-text-outline" : "library-outline";
  const color = ["cancelar", "eliminar"].includes(verbo)
    ? colors.error
    : ["crear", "reactivar", "devolver"].includes(verbo)
    ? colors.success
    : colors.primary;
  return { icono, color };
}

const hora = (ms) => (ms == null ? "" : descomponerFecha(ms).hora);

// «Hoy», «Ayer» o «lunes 2 de noviembre» (en la zona de negocio)
function etiquetaDia(dia) {
  const hoy = descomponerFecha(Date.now()).dia;
  const ayer = descomponerFecha(Date.now() - 24 * 60 * 60 * 1000).dia;
  if (dia === hoy) return "Hoy";
  if (dia === ayer) return "Ayer";
  if (!dia) return "Sin fecha";
  return dayjs(dia).locale("es").format("dddd D [de] MMMM");
}

// Historial de acciones administrativas (solo lectura, no se puede modificar), agrupado por día
export default function AuditoriaScreen() {
  const { registros, cargando, error, enLinea, reintentar } = useAuditoria(100);
  const [actualizando, setActualizando] = React.useState(false);

  const secciones = useMemo(() => {
    const porDia = new Map();
    for (const r of registros) {
      const dia = r.creadaEn == null ? "" : descomponerFecha(r.creadaEn).dia;
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(r);
    }
    return [...porDia].map(([dia, data]) => ({ titulo: etiquetaDia(dia), data }));
  }, [registros]);

  if (cargando) return <SkeletonAuditoria />;

  return (
    <SectionList
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      sections={secciones}
      keyExtractor={(r) => r.id}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={actualizando}
          onRefresh={async () => {
            setActualizando(true);
            await reintentar();
            setActualizando(false);
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <View style={styles.cabecera}>
          <Text style={styles.resumen}>
            {conteoPlural(registros.length, "acción administrativa reciente", "acciones administrativas recientes")}
          </Text>
          {!!error && (
            <View style={styles.aviso} accessibilityRole="alert">
              <Ionicons name="warning-outline" size={18} color={colors.error} />
              <Text style={styles.avisoTexto}>{error}</Text>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        <Vacio
          icono={!enLinea ? "cloud-offline-outline" : "shield-checkmark-outline"}
          texto={!enLinea ? "Sin conexión. Conéctate a internet para consultar la auditoría." : "Aún no hay acciones registradas."}
        />
      }
      renderSectionHeader={({ section }) => <Text style={styles.dia}>{section.titulo}</Text>}
      renderItem={({ item, index, section }) => {
        const { icono, color } = estiloAccion(item.accion);
        const ultimo = index === section.data.length - 1;
        return (
          <View style={styles.fila} accessible accessibilityLabel={`${ETIQUETA_ACCION[item.accion] || item.accion}. ${item.detalle || ""}. ${item.actorNombre || item.actorId}, ${hora(item.creadaEn)}`}>
            <View style={styles.linea}>
              <View style={[styles.icono, { backgroundColor: `${color}1F` }]}>
                <Ionicons name={icono} size={18} color={color} />
              </View>
              {!ultimo && <View style={styles.hilo} />}
            </View>
            <View style={styles.texto}>
              <View style={styles.encabezado}>
                <Text style={styles.accion} numberOfLines={2}>
                  {ETIQUETA_ACCION[item.accion] || item.accion}
                </Text>
                <Text style={styles.hora}>{hora(item.creadaEn)}</Text>
              </View>
              {!!item.detalle && (
                <Text style={styles.detalle} numberOfLines={3}>
                  {item.detalle}
                </Text>
              )}
              <Text style={styles.actor}>por {item.actorNombre || item.actorId}</Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, paddingBottom: 32 },
  cabecera: { gap: 10, marginBottom: 6 },
  resumen: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FDF2F2",
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 14,
    padding: 12,
  },
  avisoTexto: { flex: 1, fontSize: 13, color: colors.error },
  dia: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textPrimary,
    textTransform: "capitalize",
    marginTop: 16,
    marginBottom: 8,
  },
  fila: { flexDirection: "row", gap: 12 },
  linea: { alignItems: "center", width: 36 },
  icono: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  hilo: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  texto: { flex: 1, paddingBottom: 16, gap: 2 },
  encabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  accion: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  hora: { fontSize: 12, color: colors.textSecondary },
  detalle: { fontSize: 13, lineHeight: 18, color: colors.textPrimary },
  actor: { fontSize: 12, color: colors.textSecondary },
});
