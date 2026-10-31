import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadas } from "../../context/JornadasContext";
import { useSync } from "../../context/SyncContext";
import { colors } from "../../theme/colors";
import { formatearDiasFaltan, formatearFecha, formatearHora } from "../../utils/jornadaFecha";
import { conteoPlural } from "../../utils/plural";
import { resumenSincronizacion } from "../../utils/sincronizacion";
import { contarHistorial } from "../../utils/jornadaEstado";
import { useMisPrestamos } from "../../hooks/usePrestamos";
import { contarPrestamos } from "../../utils/prestamos";

export default function HomeScreen({ navigation }) {
  const { usuario, cerrarSesion } = useAuth();

  const nombre = usuario?.displayName || usuario?.email || "Usuario";

  const {
    misJornadas: inscritas,
    cargando: cargandoJornadas,
    error: errorJornadas,
  } = useJornadas();
  // Historial: cuántas jornadas tiene inscritas y a cuántas asistió (también sin conexión)
  const historial = useMemo(() => contarHistorial(inscritas), [inscritas]);
  const misJornadas = useMemo(
    () => inscritas.filter((j) => !j.finalizada && j.pendiente !== "CANCELAR"),
    [inscritas]
  );
  // Préstamos de objetos: resumen para la tarjeta de acceso (con copia local si no hay conexión)
  const { prestamos } = useMisPrestamos();
  const conteoPrestamos = useMemo(() => contarPrestamos(prestamos, Date.now()), [prestamos]);
  const avisoPrestamos =
    conteoPrestamos.vencidos > 0
      ? { alerta: true, color: colors.error, texto: `${conteoPlural(conteoPrestamos.vencidos, "préstamo vencido", "préstamos vencidos")}` }
      : conteoPrestamos.porVencer > 0
      ? { alerta: true, color: colors.warning, texto: `${conteoPlural(conteoPrestamos.porVencer, "préstamo por vencer", "préstamos por vencer")}` }
      : {
          alerta: false,
          color: colors.primary,
          texto: conteoPrestamos.activos > 0 ? `${conteoPlural(conteoPrestamos.activos, "objeto prestado", "objetos prestados")}` : "Sin objetos prestados",
        };
  const { enLinea } = useConnectivity();
  const { pendientes, rechazadas, ultimaSync } = useSync();
  const hayPendientes = pendientes.length > 0 || rechazadas.length > 0;
  const resumenSync = resumenSincronizacion({
    nPendientes: pendientes.length,
    nRechazadas: rechazadas.length,
  });
  const textoUltimaSync = ultimaSync
    ? `Última sincronización: ${formatearFecha(ultimaSync, "D MMM, h:mm A")}`
    : "Aún no hay sincronizaciones";

  // Cerrar sesión borra los datos locales: si hay algo en juego se informa y se pide confirmación
  const confirmarCerrarSesion = () => {
    const avisos = [];
    if (pendientes.length > 0) {
      const n = pendientes.length;
      avisos.push(
        `Tienes ${conteoPlural(n, "acción pendiente", "acciones pendientes")} por sincronizar. Si cierras sesión ahora se perderán.`
      );
    }
    if (!enLinea) {
      avisos.push(
        "No tienes conexión: al cerrar sesión se borrarán los datos guardados en el dispositivo y no podrás volver a iniciar sesión hasta recuperar internet."
      );
    }
    if (avisos.length === 0) {
      cerrarSesion();
      return;
    }
    Alert.alert("Cerrar sesión", `${avisos.join("\n\n")}\n\n¿Deseas continuar?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: cerrarSesion },
    ]);
  };

  return (
    <ScrollView style={styles.contenedor} contentContainerStyle={styles.contenido}>
      {/* Saludo */}
      <View style={styles.saludo}>
        <View style={styles.saludoFila}>
          <Ionicons name="hand-right" size={22} color={colors.primary} />
          <Text style={styles.bienvenida}>Hola, {nombre.split(" ")[0]}</Text>
        </View>
        <Text style={styles.descripcion}>
          Aquí puedes explorar las jornadas comunitarias disponibles e inscribirte
          de forma rápida y segura.
        </Text>
      </View>

      {/* Tarjetas de acceso rápido */}
      <View style={styles.tarjetas}>
        <TouchableOpacity
          style={styles.tarjetaPrincipal}
          onPress={() => navigation.navigate("JornadasList")}
          activeOpacity={0.85}
        >
          <View style={styles.tarjetaEncabezado}>
            <Ionicons name="list-circle-outline" size={30} color={colors.white} />
            <Text style={styles.tarjetaTitulo}>Ver jornadas</Text>
          </View>
          <Text style={styles.tarjetaDescripcion}>
            Explora todas las jornadas disponibles en tu comunidad
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tarjetaSecundaria}
          onPress={() => navigation.navigate("Notifications")}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Centro de notificaciones"
        >
          <View style={styles.tarjetaSecundariaFila}>
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            <Text style={styles.tarjetaSecundariaTitulo}>Centro de notificaciones</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>

        {/* FE-02 · Objetos prestados al estudiante, con alerta si hay vencidos o por vencer */}
        <TouchableOpacity
          style={styles.tarjetaSecundaria}
          onPress={() => navigation.navigate("MisPrestamos")}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Mis préstamos. ${avisoPrestamos.texto}`}
        >
          <View style={styles.tarjetaSecundariaFila}>
            <Ionicons name="library-outline" size={22} color={avisoPrestamos.color} />
            <View style={styles.tarjetaSecundariaTextos}>
              <Text style={styles.tarjetaSecundariaTitulo}>Mis préstamos</Text>
              <Text style={[styles.sincronizacionDetalle, avisoPrestamos.alerta && { color: avisoPrestamos.color, fontWeight: "700" }]}>
                {avisoPrestamos.texto}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>

        {/* Estado de la sincronización: se puede abrir siempre, aunque no haya errores */}
        <TouchableOpacity
          style={styles.tarjetaSecundaria}
          onPress={() => navigation.navigate("Sincronizacion")}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Sincronización. ${resumenSync}. ${textoUltimaSync}`}
        >
          <View style={styles.tarjetaSecundariaFila}>
            <Ionicons
              name={hayPendientes ? "sync-outline" : "checkmark-done-outline"}
              size={22}
              color={hayPendientes ? colors.warning : colors.primary}
            />
            <View style={styles.tarjetaSecundariaTextos}>
              <Text style={styles.tarjetaSecundariaTitulo}>Sincronización</Text>
              <Text style={[styles.sincronizacionDetalle, hayPendientes && styles.sincronizacionPendiente]}>
                {resumenSync}
              </Text>
              <Text style={styles.sincronizacionDetalle}>{textoUltimaSync}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Mis jornadas inscritas */}
      <View style={styles.misJornadas}>
        <View style={styles.misJornadasEncabezado}>
          <Text style={styles.misJornadasTitulo}>Mis próximas jornadas</Text>
          <TouchableOpacity
            style={styles.misJornadasAcceso}
            onPress={() => navigation.navigate("MisJornadas")}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Mis jornadas"
            accessibilityHint="Abre la lista de tus inscripciones"
          >
            <Text style={styles.misJornadasAccesoTexto}>Mis jornadas</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {!cargandoJornadas && !errorJornadas && historial.inscritas > 0 && (
          <Text style={styles.historialConteo} accessibilityLabel={`Tienes ${conteoPlural(historial.inscritas, "jornada inscrita", "jornadas inscritas")} y asististe a ${historial.asistidas}`}>
            {conteoPlural(historial.inscritas, "inscrita", "inscritas")} · {conteoPlural(historial.asistidas, "asistida", "asistidas")}
          </Text>
        )}

        {cargandoJornadas ? (
          <View style={styles.misJornadasEstado}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.misJornadasEstadoTexto}>Cargando tus jornadas...</Text>
          </View>
        ) : errorJornadas ? (
          <View style={styles.misJornadasEstado}>
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <Text style={[styles.misJornadasEstadoTexto, { color: colors.error }]}>
              {errorJornadas}
            </Text>
          </View>
        ) : misJornadas.length === 0 ? (
          <View style={styles.misJornadasEstado}>
            <Ionicons name="calendar-outline" size={20} color={colors.textDisabled} />
            <Text style={styles.misJornadasEstadoTexto}>
              No tienes jornadas próximas. ¡Explora las disponibles!
            </Text>
          </View>
        ) : (
          <View style={styles.misJornadasLista}>
            {misJornadas.map((jornada) => (
              <View key={jornada.id} style={styles.jornadaItem}>
                <Text style={styles.jornadaTitulo} numberOfLines={2}>
                  {jornada.titulo}
                </Text>
                {jornada.pendiente === "INSCRIBIR" && (
                  <Text style={styles.jornadaPendiente}>Pendiente por sincronizar</Text>
                )}
                <View style={styles.jornadaDetalles}>
                  <View style={styles.jornadaDetalleFila}>
                    <Ionicons name="hourglass-outline" size={13} color={colors.primary} />
                    <Text style={styles.jornadaDetalleTexto}>
                      {formatearDiasFaltan(jornada.fecha)}
                    </Text>
                  </View>
                  <View style={styles.jornadaDetalleFila}>
                    <Ionicons name="time-outline" size={13} color={colors.primary} />
                    <Text style={styles.jornadaDetalleTexto}>
                      {formatearHora(jornada.fecha)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Info de sesión */}
      <View style={styles.sesionInfo}>
        <Text style={styles.sesionTexto}>
          Sesión activa: {usuario?.displayName}
        </Text>
      </View>

      {/* Cerrar sesión */}
      <TouchableOpacity
        style={styles.botonSalir}
        onPress={confirmarCerrarSesion}
        activeOpacity={0.85}
      >
        <Text style={styles.botonSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  jornadaPendiente: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.warning,
  },
  contenedor: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenido: {
    padding: 20,
    gap: 20,
  },
  saludo: {
    backgroundColor: colors.primaryPale,
    borderRadius: 14,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  saludoFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  bienvenida: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.primary,
  },
  descripcion: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  tarjetas: {
    gap: 12,
  },
  tarjetaPrincipal: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  tarjetaEncabezado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tarjetaTitulo: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.white,
  },
  tarjetaDescripcion: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 18,
  },
  tarjetaSecundaria: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
  },
  tarjetaSecundariaFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  historialConteo: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: -4,
  },
  tarjetaSecundariaTextos: {
    flexShrink: 1,
    gap: 2,
  },
  tarjetaSecundariaTitulo: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  sincronizacionDetalle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  sincronizacionPendiente: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  misJornadasEncabezado: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  misJornadasAcceso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: 44,
    paddingLeft: 12,
  },
  misJornadasAccesoTexto: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  misJornadas: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  misJornadasTitulo: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  misJornadasEstado: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  misJornadasEstadoTexto: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  misJornadasLista: {
    gap: 10,
  },
  jornadaItem: {
    backgroundColor: colors.primaryPale,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  jornadaTitulo: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 19,
  },
  jornadaDetalles: {
    flexDirection: "row",
    gap: 16,
  },
  jornadaDetalleFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  jornadaDetalleTexto: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
  },
  sesionInfo: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sesionTexto: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  botonSalir: {
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  botonSalirTexto: {
    color: colors.error,
    fontSize: 15,
    fontWeight: "700",
  },
});