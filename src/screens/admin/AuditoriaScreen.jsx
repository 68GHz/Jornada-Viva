import React from "react";
import { FlatList, Text } from "react-native";
import { useAuditoria } from "../../hooks/useAdmin";
import LoadingSpinner from "../../components/LoadingSpinner";
import { Vacio, estilos } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { formatearFechaHoraNegocio } from "../../utils/zonaNegocio";

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
};

// Historial de acciones administrativas (solo lectura, no se puede modificar)
export default function AuditoriaScreen() {
  const { registros, cargando, error, enLinea } = useAuditoria(100);
  if (cargando) return <LoadingSpinner mensaje="Cargando auditoría..." />;

  return (
    <FlatList
      style={estilos.pantalla}
      contentContainerStyle={estilos.contenido}
      data={registros}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <Text style={estilos.texto}>Últimas {registros.length} acciones administrativas.{error ? `\n${error}` : ""}</Text>
      }
      ListEmptyComponent={
        <Vacio texto={!enLinea ? "Sin conexión. Conéctate a internet para consultar la auditoría." : "Aún no hay acciones registradas."} />
      }
      renderItem={({ item }) => (
        <>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textPrimary }}>
            {ETIQUETA_ACCION[item.accion] || item.accion}
          </Text>
          {!!item.detalle && <Text style={estilos.texto}>{item.detalle}</Text>}
          <Text style={[estilos.texto, { fontSize: 12 }]}>
            {item.actorNombre || item.actorId} · {formatearFechaHoraNegocio(item.creadaEn)}
          </Text>
        </>
      )}
      ItemSeparatorComponent={() => <Text style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />}
    />
  );
}
