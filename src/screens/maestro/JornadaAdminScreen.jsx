import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useInscritos, useJornadaMaestro } from "../../hooks/useJornadasMaestro";
import { useUsuarios } from "../../hooks/useAdmin";
import { auditar } from "../../services/adminService";
import {
  cancelarJornada,
  eliminarJornada,
  mensajeDeError,
  reactivarJornada,
} from "../../services/jornadaAdminService";
import { compartirPlanilla } from "../../services/planillaService";
import { registrarAsistenciaManual } from "../../services/asistenciaService";
import { estadoVentanaAsistencia } from "../../utils/asistencia";
import ModalQrAsistencia from "../../components/ModalQrAsistencia";
import EstadoJornadaChip from "../../components/EstadoJornadaChip";
import LoadingSpinner from "../../components/LoadingSpinner";
import { colors } from "../../theme/colors";
import { estadoJornada, permisosJornada } from "../../utils/estadoJornada";
import { formatearFecha, formatearHora } from "../../utils/jornadaFecha";
import { formatearFechaHoraNegocio } from "../../utils/zonaNegocio";

function Fila({ icono, etiqueta, valor, capitalizar = false }) {
  return (
    <View style={styles.fila}>
      <Ionicons name={icono} size={18} color={colors.primary} />
      <View style={styles.filaTexto}>
        <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
        <Text style={[styles.filaValor, capitalizar && styles.capitalizar]}>{valor}</Text>
      </View>
    </View>
  );
}

function Boton({ texto, icono, onPress, variante = "primario", deshabilitado }) {
  const estilos = {
    primario: [styles.boton, styles.botonPrimario],
    secundario: [styles.boton, styles.botonSecundario],
    peligro: [styles.boton, styles.botonPeligro],
  }[variante];
  const colorTexto = variante === "primario" ? colors.white : variante === "peligro" ? colors.error : colors.primary;
  return (
    <TouchableOpacity
      style={[...estilos, deshabilitado && styles.deshabilitado]}
      onPress={onPress}
      disabled={deshabilitado}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={texto}
      accessibilityState={{ disabled: !!deshabilitado }}
    >
      <Ionicons name={icono} size={18} color={colorTexto} />
      <Text style={[styles.botonTexto, { color: colorTexto }]}>{texto}</Text>
    </TouchableOpacity>
  );
}

// Administración de una jornada propia: estado, acciones, inscritos y planilla
export default function JornadaAdminScreen({ navigation, route }) {
  const { jornadaId } = route.params || {};
  const { usuario, rol, esAdministrador } = useAuth();
  const { usuarios } = useUsuarios(esAdministrador);
  const { enLinea } = useConnectivity();
  const { jornada, cargando, noExiste, propia, ahora } = useJornadaMaestro(jornadaId);

  const permisos = jornada
    ? permisosJornada({ rol, uid: usuario?.uid, jornada, ahora })
    : null;
  const { inscritos, cargando: cargandoInscritos, error: errorInscritos, recargar } =
    useInscritos(jornadaId, !!permisos?.verInscritos);

  const [ocupado, setOcupado] = useState(false);
  const [modalQrVisible, setModalQrVisible] = useState(false);
  const [actualizandoAsistenciaId, setActualizandoAsistenciaId] = useState(null);

  const ventanaAsistencia = jornada ? estadoVentanaAsistencia(jornada.fecha, ahora) : null;

  const alternarAsistenciaManual = async (inscrito) => {
    if (!jornada) return;
    const nuevoValor = !inscrito.asistio;
    const ventana = estadoVentanaAsistencia(jornada.fecha, ahora);
    if (!ventana.disponible) {
      Alert.alert(
        "Ventana de asistencia no disponible",
        ventana.mensaje
      );
      return;
    }

    setActualizandoAsistenciaId(inscrito.id);
    try {
      await registrarAsistenciaManual(inscrito.id, jornada.fecha, nuevoValor);
      await recargar();
    } catch (err) {
      console.warn("Error al registrar asistencia manual:", err);
      Alert.alert("No se pudo actualizar", err?.message || "Ocurrió un error. Intenta de nuevo.");
    } finally {
      setActualizandoAsistenciaId(null);
    }
  };

  if (cargando) return <LoadingSpinner mensaje="Cargando jornada..." />;

  // Defensa en la interfaz: una jornada ajena (o anterior a los roles) no se administra.
  // El servidor también lo impide, aunque se manipulen los parámetros de navegación.
  if (noExiste || !jornada || !permisos?.verAdministracion) {
    return (
      <View style={styles.centrado}>
        <Ionicons name="lock-closed-outline" size={44} color={colors.textDisabled} />
        <Text style={styles.centradoTexto}>
          {noExiste || !jornada
            ? "La jornada no existe o ya fue eliminada."
            : propia
            ? "No tienes permiso para administrar esta jornada."
            : "No tienes permiso para administrar esta jornada: solo puedes administrar las que tienes asignadas."}
        </Text>
        <TouchableOpacity style={styles.volver} onPress={() => navigation.goBack()}>
          <Text style={styles.volverTexto}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const estado = estadoJornada(jornada, ahora);
  const totalInscritos = jornada.cuposOcupados || 0;

  // Las operaciones de administración necesitan conexión
  const ejecutar = async (operacion, exito, accionAuditoria) => {
    if (!enLinea) {
      Alert.alert("Sin conexión", "Necesitas conexión a internet para administrar la jornada.");
      return;
    }
    setOcupado(true);
    try {
      await operacion();
      // El administrador deja constancia de lo que hace (auditoría)
      if (esAdministrador && accionAuditoria) {
        auditar(
          { uid: usuario.uid, nombre: usuario.displayName || usuario.email },
          { accion: accionAuditoria, entidad: "jornada", entidadId: jornada.id, detalle: jornada.titulo }
        );
      }
      if (exito) exito();
    } catch (err) {
      console.warn("Error de administración:", err);
      Alert.alert("No se pudo completar", mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const confirmarCancelacion = () =>
    Alert.alert(
      "Cancelar jornada",
      `La jornada dejará de estar disponible${
        totalInscritos > 0 ? ` y los ${totalInscritos} estudiantes inscritos recibirán un aviso` : ""
      }. Podrás reactivarla después.\n\n¿Deseas cancelarla?`,
      [
        { text: "No, mantener", style: "cancel" },
        {
          text: "Sí, cancelar jornada",
          style: "destructive",
          onPress: () => ejecutar(() => cancelarJornada(jornada.id), undefined, "jornada.cancelar"),
        },
      ]
    );

  const confirmarReactivacion = () =>
    Alert.alert(
      "Reactivar jornada",
      `La jornada volverá a estar disponible para los estudiantes${
        totalInscritos > 0 ? ` y los ${totalInscritos} inscritos recibirán un aviso` : ""
      }.\n\n¿Deseas reactivarla?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, reactivar", onPress: () => ejecutar(() => reactivarJornada(jornada.id), undefined, "jornada.reactivar") },
      ]
    );

  const confirmarEliminacion = () =>
    Alert.alert(
      "Eliminar jornada",
      `Se eliminará "${jornada.titulo}" de forma permanente${
        totalInscritos > 0
          ? `. Los ${totalInscritos} estudiantes inscritos la verán como "No disponible"`
          : ""
      }. Esta acción no se puede deshacer.\n\n¿Deseas eliminarla?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, eliminar",
          style: "destructive",
          onPress: () => ejecutar(() => eliminarJornada(jornada.id), () => navigation.goBack(), "jornada.eliminar"),
        },
      ]
    );

  const descargarPlanilla = async () => {
    setOcupado(true);
    try {
      await compartirPlanilla(jornada, inscritos);
    } catch (err) {
      console.warn("No se pudo generar la planilla:", err);
      Alert.alert("No se pudo generar la planilla", err?.message || "Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <ScrollView style={styles.contenedor} contentContainerStyle={styles.contenido}>
      <View style={styles.encabezado}>
        <EstadoJornadaChip estado={estado} grande />
        <Text style={styles.titulo}>{jornada.titulo}</Text>
        <Text style={styles.entidad}>{jornada.entidad}</Text>
      </View>

      <View style={styles.seccion}>
        <Fila
          icono="calendar-outline"
          etiqueta="Fecha"
          valor={formatearFecha(jornada.fecha, "dddd, DD [de] MMMM [de] YYYY")}
          capitalizar
        />
        <Fila icono="time-outline" etiqueta="Hora" valor={formatearHora(jornada.fecha)} />
        <Fila icono="location-outline" etiqueta="Espacio" valor={jornada.lugar} />
        <Fila icono="person-outline" etiqueta="Responsable" valor={jornada.responsable} />
        {esAdministrador && (
          <Fila
            icono="briefcase-outline"
            etiqueta="Gestor asignado"
            valor={
              jornada.creadoPor
                ? usuarios.find((u) => u.id === jornada.creadoPor)?.nombre || "Gestor desconocido"
                : "Sin gestor asignado"
            }
          />
        )}
        <Fila
          icono="people-outline"
          etiqueta="Cupos"
          valor={`${totalInscritos} ocupados de ${jornada.cuposTotales} (${Math.max(
            0,
            (jornada.cuposTotales || 0) - totalInscritos
          )} disponibles)`}
        />
        <Text style={styles.descripcion}>{jornada.descripcion}</Text>
      </View>

      <View style={styles.acciones}>
        {permisos.editar && (
          <Boton
            texto="Generar QR de asistencia"
            icono="qr-code-outline"
            variante="primario"
            deshabilitado={ocupado}
            onPress={() => setModalQrVisible(true)}
          />
        )}
        {permisos.editar && (
          <Boton
            texto="Editar jornada"
            icono="create-outline"
            variante="secundario"
            deshabilitado={ocupado}
            onPress={() => navigation.navigate("JornadaForm", { jornadaId: jornada.id })}
          />
        )}
        {permisos.cancelar && (
          <Boton texto="Cancelar jornada" icono="close-circle-outline" variante="secundario" deshabilitado={ocupado} onPress={confirmarCancelacion} />
        )}
        {permisos.reactivar && (
          <Boton texto="Reactivar jornada" icono="refresh-circle-outline" deshabilitado={ocupado} onPress={confirmarReactivacion} />
        )}
        {permisos.eliminar && (
          <Boton texto="Eliminar jornada" icono="trash-outline" variante="peligro" deshabilitado={ocupado} onPress={confirmarEliminacion} />
        )}
        {ocupado && <ActivityIndicator color={colors.primary} />}
      </View>

      {permisos.verInscritos && (
        <View style={styles.seccion}>
          <View style={styles.inscritosCabecera}>
            <Text style={styles.seccionTitulo}>
              Estudiantes inscritos{cargandoInscritos ? "" : ` (${inscritos.length})`}
            </Text>
            <TouchableOpacity
              onPress={recargar}
              disabled={cargandoInscritos}
              accessibilityRole="button"
              accessibilityLabel="Actualizar inscritos"
              style={styles.actualizar}
            >
              <Ionicons name="refresh-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {cargandoInscritos ? (
            <ActivityIndicator color={colors.primary} />
          ) : errorInscritos ? (
            <Text style={styles.errorTexto}>{errorInscritos}</Text>
          ) : inscritos.length === 0 ? (
            <Text style={styles.vacio}>Aún no hay estudiantes inscritos.</Text>
          ) : (
            inscritos
              .slice()
              .sort((a, b) => (a.inscritoEn ?? 0) - (b.inscritoEn ?? 0))
              .map((inscrito, i) => (
                <View key={inscrito.id} style={styles.inscrito}>
                  <Text style={styles.inscritoNumero}>{i + 1}</Text>
                  <View style={styles.inscritoDatos}>
                    <Text style={styles.inscritoNombre}>{inscrito.nombreUsuario || "Sin nombre"}</Text>
                    <Text style={styles.inscritoCorreo}>{inscrito.emailUsuario}</Text>
                    <Text style={styles.inscritoCorreo}>
                      Inscrito el {formatearFechaHoraNegocio(inscrito.inscritoEn)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.asistio,
                      inscrito.asistio && styles.asistioSi,
                      actualizandoAsistenciaId === inscrito.id && styles.deshabilitado,
                    ]}
                    onPress={() => alternarAsistenciaManual(inscrito)}
                    disabled={actualizandoAsistenciaId === inscrito.id}
                    accessibilityRole="button"
                    accessibilityLabel={inscrito.asistio ? "Marcar como no asistió" : "Marcar como asistió"}
                  >
                    {actualizandoAsistenciaId === inscrito.id ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={[styles.asistioTexto, inscrito.asistio && styles.asistioTextoSi]}>
                        {inscrito.asistio ? "✓ Asistió" : "Marcar"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
          )}

          {permisos.descargarPlanilla && (
            <Boton
              texto="Descargar planilla (Excel)"
              icono="download-outline"
              deshabilitado={ocupado || cargandoInscritos || !!errorInscritos || inscritos.length === 0}
              onPress={descargarPlanilla}
            />
          )}
        </View>
      )}

      {/* Modal interactivo para visualizar y compartir QR de asistencia */}
      <ModalQrAsistencia
        visible={modalQrVisible}
        jornada={jornada}
        ahora={ahora}
        alCerrar={() => setModalQrVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 20, gap: 16, paddingBottom: 40 },
  encabezado: { gap: 8 },
  titulo: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
  entidad: { fontSize: 13, color: colors.textSecondary },
  seccion: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seccionTitulo: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  fila: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  filaTexto: { flex: 1 },
  filaEtiqueta: { fontSize: 11, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" },
  filaValor: { fontSize: 15, color: colors.textPrimary },
  capitalizar: { textTransform: "capitalize" },
  descripcion: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  acciones: { gap: 10 },
  boton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
  },
  botonPrimario: { backgroundColor: colors.primary, borderColor: colors.primary },
  botonSecundario: { backgroundColor: colors.surface, borderColor: colors.primary },
  botonPeligro: { backgroundColor: colors.surface, borderColor: colors.error },
  botonTexto: { fontSize: 15, fontWeight: "700" },
  deshabilitado: { opacity: 0.5 },
  inscritosCabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actualizar: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  inscrito: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inscritoNumero: { width: 24, fontSize: 13, fontWeight: "700", color: colors.textSecondary },
  inscritoDatos: { flex: 1 },
  inscritoNombre: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  inscritoCorreo: { fontSize: 12, color: colors.textSecondary },
  asistio: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.border },
  asistioSi: { backgroundColor: colors.success },
  asistioTexto: { fontSize: 11, fontWeight: "700", color: colors.textSecondary },
  asistioTextoSi: { color: colors.white },
  vacio: { fontSize: 14, color: colors.textSecondary, textAlign: "center" },
  errorTexto: { fontSize: 14, color: colors.error, textAlign: "center" },
  centrado: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 14,
    backgroundColor: colors.background,
  },
  centradoTexto: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  volver: { borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary, paddingVertical: 12, paddingHorizontal: 28 },
  volverTexto: { color: colors.primary, fontSize: 15, fontWeight: "700" },
});
