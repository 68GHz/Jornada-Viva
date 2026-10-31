import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadas } from "../../context/JornadasContext";
import { useAccionesInscripcion } from "../../hooks/useAccionesInscripcion";
import BannerJornada from "../../components/BannerJornada";
import { colors } from "../../theme/colors";
import {
  puedeCancelarInscripcion,
  DIAS_LIMITE_CANCELACION,
  formatearFecha,
  formatearHora,
  jornadaYaPaso,
} from "../../utils/jornadaFecha";
import { jornadaDisponible } from "../../utils/jornadaEstado";
import { estadoVentanaAsistencia } from "../../utils/asistencia";
import { formatearDuracion, jornadaTerminada } from "../../utils/duracion";
import { palabraPlural } from "../../utils/plural";

const TITULO_ERROR = {
  YA_INSCRITO: "Ya inscrito",
  SIN_CUPOS: "Sin cupos",
  JORNADA_NO_DISPONIBLE: "Jornada no disponible",
  PLAZO_VENCIDO: "Plazo vencido",
};

export default function JornadaDetailScreen({ route, navigation }) {
  const { jornada: jornadaInicial } = route.params;

  const {
    jornadasPorId,
    inscripciones,
    estadoInscripcion,
    cargando: cargandoJornadas,
    ahora,
  } = useJornadas();
  const { enLinea } = useConnectivity();
  const { inscribirse, cancelarInscripcion } = useAccionesInscripcion();

  // Datos en vivo de Firestore (cupos, estado, etc.) sobre los recibidos al navegar
  const jornadaEnVivo = jornadasPorId.get(jornadaInicial.id);
  const jornada = useMemo(
    () => (jornadaEnVivo ? { ...jornadaInicial, ...jornadaEnVivo } : jornadaInicial),
    [jornadaInicial, jornadaEnVivo]
  );
  const vencida = jornadaYaPaso(jornada.fecha, ahora);
  // Mientras cargan los datos no se bloquea; luego debe existir, estar activa y no vencida
  const disponible =
    cargandoJornadas || (!!jornadaEnVivo && jornadaDisponible(jornadaEnVivo, ahora));

  // Incluye lo pendiente de sincronizar: `pendiente` es "INSCRIBIR", "CANCELAR" o null
  const { inscrito, pendiente } = estadoInscripcion(jornada.id);
  const verificando = cargandoJornadas;

  const inscripcionActual = useMemo(
    () => inscripciones?.find((i) => i.jornadaId === jornada.id),
    [inscripciones, jornada.id]
  );
  const yaAsistio = Boolean(inscripcionActual?.asistio);
  const ventanaAsistencia = estadoVentanaAsistencia(jornada.fecha, ahora, jornada.duracionMin);

  const [inscribiendo, setInscribiendo] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const cuposRestantes = jornada.cuposTotales - jornada.cuposOcupados;
  const sinCupos = cuposRestantes <= 0;
  const puedeCancelar = puedeCancelarInscripcion(jornada.fecha);

  const mostrarError = (err, mensajeGeneral) => {
    if (err?.name === "ErrorNegocio") {
      Alert.alert(TITULO_ERROR[err.codigo] || "No se pudo completar", err.message);
      return;
    }
    console.error(mensajeGeneral, err);
    Alert.alert("Error", `${mensajeGeneral} Intenta de nuevo.`);
  };

  const manejarInscripcion = async () => {
    if (!disponible) {
      Alert.alert("Jornada no disponible", "Esta jornada ya no está disponible para inscripción.");
      return;
    }

    if (sinCupos) {
      Alert.alert("Sin cupos", "Esta jornada ya no tiene cupos disponibles.");
      return;
    }

    const aviso = enLinea
      ? ""
      : "\n\nSin conexión: tu inscripción quedará guardada en el dispositivo como pendiente y se enviará automáticamente cuando recuperes internet. Solo se confirmará si aún hay cupos disponibles.";

    Alert.alert(
      "Confirmar inscripción",
      `¿Deseas inscribirte en "${jornada.titulo}"?\n\nFecha: ${formatearFecha(jornada.fecha, "DD [de] MMMM [de] YYYY")}\nHora: ${formatearHora(jornada.fecha)}\nLugar: ${jornada.lugar}${aviso}`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: enLinea ? "Sí, inscribirme" : "Sí, continuar",
          style: "default",
          onPress: confirmarInscripcion,
        },
      ]
    );
  };

  const confirmarInscripcion = async () => {
    setInscribiendo(true);
    try {
      const { estado } = await inscribirse(jornada);

      if (estado === "completada") {
        Alert.alert(
          "¡Inscripción exitosa! ✅",
          `Quedaste registrado en "${jornada.titulo}".\n\nRecuerda presentarte el ${formatearFecha(jornada.fecha, "DD [de] MMMM")} a las ${formatearHora(jornada.fecha)} en ${jornada.lugar}.`
        );
      } else if (estado === "pendiente") {
        Alert.alert(
          "Pendiente por sincronizar",
          `Tu inscripción en "${jornada.titulo}" quedó guardada en el dispositivo y se enviará cuando recuperes la conexión. Solo se confirmará si aún hay cupos disponibles.`
        );
      } else if (estado === "anulada") {
        Alert.alert(
          "Cancelación anulada",
          "Tenías una cancelación pendiente de enviar. Se anuló y sigues inscrito."
        );
      } else {
        Alert.alert("Ya en proceso", "Esta inscripción ya está pendiente de sincronizar.");
      }
    } catch (err) {
      mostrarError(err, "No se pudo completar la inscripción.");
    } finally {
      setInscribiendo(false);
    }
  };

  const manejarCancelacion = () => {
    if (!puedeCancelarInscripcion(jornada.fecha)) {
      Alert.alert(
        "Plazo vencido",
        `Solo puedes cancelar hasta ${DIAS_LIMITE_CANCELACION} días antes de la jornada.`
      );
      return;
    }

    const aviso = enLinea
      ? ""
      : "\n\nSin conexión: la cancelación quedará guardada en el dispositivo como pendiente y se enviará automáticamente cuando recuperes internet. El plazo se valida con la fecha de este dispositivo.";

    Alert.alert(
      "Cancelar inscripción",
      `¿Seguro que deseas cancelar tu inscripción en "${jornada.titulo}"?\n\nTu cupo quedará disponible para otras personas.${aviso}`,
      [
        { text: "Mantener inscripción", style: "cancel" },
        {
          text: enLinea ? "Sí, cancelar" : "Sí, continuar",
          style: "destructive",
          onPress: confirmarCancelacion,
        },
      ]
    );
  };

  const confirmarCancelacion = async () => {
    setCancelando(true);
    try {
      const { estado } = await cancelarInscripcion(jornada);

      if (estado === "completada") {
        Alert.alert("Inscripción cancelada", `Cancelaste tu inscripción en "${jornada.titulo}".`);
      } else if (estado === "pendiente") {
        Alert.alert(
          "Pendiente por sincronizar",
          `La cancelación de tu inscripción en "${jornada.titulo}" quedó guardada en el dispositivo. Tu cupo se liberará cuando recuperes la conexión.`
        );
      } else if (estado === "anulada") {
        Alert.alert(
          "Inscripción anulada",
          "Tu inscripción aún no se había enviado, así que se anuló y no se registrará en el servidor."
        );
      } else {
        Alert.alert("Ya en proceso", "Esta cancelación ya está pendiente de sincronizar.");
      }
    } catch (err) {
      mostrarError(err, "No se pudo cancelar la inscripción.");
    } finally {
      setCancelando(false);
    }
  };

  const renderBotonInscripcion = () => {
    if (verificando) {
      return (
        <View style={styles.botonCargando}>
          <ActivityIndicator color={colors.white} />
          <Text style={styles.botonTexto}>Verificando...</Text>
        </View>
      );
    }

    if (inscrito) {
      return (
        <View style={[styles.botonInscrito, pendiente === "INSCRIBIR" && styles.botonPendiente]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.white} />
          <Text style={styles.botonTexto}>
            {pendiente === "INSCRIBIR" ? "Inscripción pendiente por sincronizar" : "Ya estás inscrito"}
          </Text>
        </View>
      );
    }

    if (!disponible) {
      return (
        <View style={[styles.botonInscripcion, styles.botonAgotado]}>
          <Text style={styles.botonTexto}>Jornada no disponible</Text>
        </View>
      );
    }

    if (sinCupos) {
      return (
        <View style={[styles.botonInscripcion, styles.botonAgotado]}>
          <Text style={styles.botonTexto}>Sin cupos disponibles</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.botonInscripcion, inscribiendo && styles.botonDeshabilitado]}
        onPress={manejarInscripcion}
        disabled={inscribiendo}
        activeOpacity={0.85}
      >
        {inscribiendo ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.botonTexto}>Inscribirme a esta jornada</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={styles.contenedor} contentContainerStyle={styles.contenido}>
      {/* Banner opcional: si no hay enlace o no carga, no ocupa espacio */}
      <BannerJornada url={jornada.bannerUrl} altura={170} />

      {/* Encabezado */}
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>{jornada.titulo}</Text>
        <Text style={styles.entidad}>{jornada.entidad}</Text>
      </View>

      {!disponible && (
        <View style={styles.avisoNoDisponible}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
          <Text style={styles.avisoNoDisponibleTexto}>
            {vencida
              ? jornadaTerminada(jornada, ahora)
                ? "Esta jornada ya finalizó."
                : "Esta jornada ya comenzó y no admite nuevas inscripciones."
              : "Esta jornada fue desactivada y no está disponible por el momento."}
          </Text>
        </View>
      )}

      {/* Cupos */}
      <View
        style={[
          styles.cuposCard,
          sinCupos && styles.cuposCardAgotados,
        ]}
      >
        <Text style={styles.cuposNumero}>
          {sinCupos ? "0" : cuposRestantes}
        </Text>
        <Text style={styles.cuposEtiqueta}>
          {sinCupos ? "Sin cupos" : palabraPlural(cuposRestantes, "cupo disponible", "cupos disponibles")}
        </Text>
        <Text style={styles.cuposSub}>
          {jornada.cuposOcupados} de {jornada.cuposTotales}{" "}
          {palabraPlural(jornada.cuposTotales, "lugar ocupado", "lugares ocupados")}
        </Text>
      </View>

      {/* Info logística */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Información de la jornada</Text>

        <View style={styles.filaInfo}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} style={styles.filaIcono} />
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Fecha</Text>
            <Text style={styles.filaValor}>
              {formatearFecha(jornada.fecha, "dddd, DD [de] MMMM [de] YYYY")}
            </Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Ionicons name="time-outline" size={18} color={colors.primary} style={styles.filaIcono} />
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Hora</Text>
            <Text style={styles.filaValor}>{formatearHora(jornada.fecha)}</Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Ionicons name="hourglass-outline" size={18} color={colors.primary} style={styles.filaIcono} />
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Duración</Text>
            <Text style={[styles.filaValor, { textTransform: "none" }]}>
              {formatearDuracion(jornada.duracionMin)}
            </Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Ionicons name="location-outline" size={18} color={colors.primary} style={styles.filaIcono} />
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Lugar</Text>
            <Text style={styles.filaValor}>{jornada.lugar}</Text>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.filaInfo}>
          <Ionicons name="person-outline" size={18} color={colors.primary} style={styles.filaIcono} />
          <View style={styles.filaTexto}>
            <Text style={styles.filaEtiqueta}>Responsable</Text>
            <Text style={styles.filaValor}>{jornada.responsable}</Text>
          </View>
        </View>
      </View>

      {/* Descripción */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Descripción</Text>
        <Text style={styles.descripcion}>{jornada.descripcion}</Text>
      </View>

      {/* Botón de inscripción */}
      <View style={styles.accion}>{renderBotonInscripcion()}</View>

      {pendiente === "CANCELAR" && (
        <View style={styles.pendienteCard}>
          <Ionicons name="sync-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.pendienteTexto}>
            Cancelación pendiente por sincronizar. Tu cupo se liberará cuando recuperes la conexión.
          </Text>
        </View>
      )}

      {inscrito && (
        <View style={styles.confirmacionCard}>
          <View style={styles.confirmacionFila}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={styles.confirmacionTitulo}>¡Estás inscrito!</Text>
          </View>
          <Text style={styles.confirmacionTexto}>
            {pendiente === "INSCRIBIR"
              ? "Tu inscripción está guardada en el dispositivo y se confirmará al sincronizar."
              : "Tu lugar en esta jornada está reservado. Recuerda asistir el día indicado."}
          </Text>

          {/* Asistencia (Autónoma por QR) */}
          {yaAsistio ? (
            <View style={styles.asistenciaExitosaCard}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.asistenciaExitosaTexto}>
                ¡Asistencia confirmada para esta jornada!
              </Text>
            </View>
          ) : (
            <View style={styles.bloqueAsistencia}>
              <TouchableOpacity
                style={[
                  styles.botonEscanearAsistencia,
                  !ventanaAsistencia.disponible && styles.botonDeshabilitado,
                ]}
                disabled={!ventanaAsistencia.disponible}
                onPress={() =>
                  navigation?.navigate("EscanearAsistencia", {
                    jornadaId: jornada.id,
                    jornadaFecha: jornada.fecha,
                    duracionMin: jornada.duracionMin,
                    tituloJornada: jornada.titulo,
                  })
                }
                activeOpacity={0.85}
              >
                <Ionicons name="qr-code-outline" size={20} color={colors.white} />
                <Text style={styles.botonEscanearTexto}>
                  {ventanaAsistencia.disponible
                    ? "Registrar asistencia (Escanear QR)"
                    : ventanaAsistencia.estado === "ANTES"
                    ? `Asistencia disponible en ${ventanaAsistencia.minutosRestantes} min`
                    : "Ventana de asistencia finalizada"}
                </Text>
              </TouchableOpacity>
              {ventanaAsistencia.disponible && (
                <Text style={styles.asistenciaNota}>
                  Solo puedes registrar asistencia durante los primeros 20 minutos de la jornada.
                </Text>
              )}
            </View>
          )}
          {puedeCancelar ? (
            <TouchableOpacity
              style={[styles.botonCancelar, cancelando && styles.botonDeshabilitado]}
              onPress={manejarCancelacion}
              disabled={cancelando}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Cancelar inscripción"
              accessibilityHint="Libera tu cupo en esta jornada"
            >
              {cancelando ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                  <Text style={styles.botonCancelarTexto}>Cancelar inscripción</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.cancelacionNota}>
              El plazo para cancelar terminó ({DIAS_LIMITE_CANCELACION} días antes de la jornada).
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contenido: {
    padding: 16,
    gap: 16,
    paddingBottom: 36,
  },
  encabezado: {
    gap: 6,
  },
  titulo: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 28,
  },
  entidad: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  cuposCard: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    gap: 2,
  },
  cuposCardAgotados: {
    backgroundColor: colors.textDisabled,
  },
  cuposNumero: {
    fontSize: 48,
    fontWeight: "900",
    color: colors.white,
    lineHeight: 52,
  },
  cuposEtiqueta: {
    fontSize: 16,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },
  cuposSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    marginTop: 4,
  },
  seccion: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filaInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  filaIcono: {
    marginTop: 1,
    width: 20,
    textAlign: "center",
  },
  filaTexto: {
    flex: 1,
    gap: 2,
  },
  filaEtiqueta: {
    fontSize: 11,
    color: colors.textDisabled,
    fontWeight: "600",
  },
  filaValor: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: "500",
    lineHeight: 20,
    textTransform: "capitalize",
  },
  separador: {
    height: 1,
    backgroundColor: colors.border,
  },
  descripcion: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 23,
  },
  accion: {
    marginTop: 4,
  },
  botonInscripcion: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  botonCargando: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    flexDirection: "row",
    gap: 10,
  },
  botonInscrito: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 54,
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  botonAgotado: {
    backgroundColor: colors.textDisabled,
  },
  botonDeshabilitado: {
    opacity: 0.7,
  },
  botonTexto: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  botonCancelar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.error,
    backgroundColor: colors.white,
  },
  botonCancelarTexto: {
    color: colors.error,
    fontSize: 15,
    fontWeight: "700",
  },
  botonPendiente: {
    backgroundColor: colors.warning,
  },
  pendienteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${colors.warning}30`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  pendienteTexto: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  avisoNoDisponible: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${colors.error}15`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  avisoNoDisponibleTexto: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
    fontWeight: "600",
  },
  cancelacionNota: {
    fontSize: 12,
    color: colors.textDisabled,
    marginTop: 4,
  },
  confirmacionCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    gap: 6,
    marginTop: 4,
  },
  confirmacionFila: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  confirmacionTitulo: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  confirmacionTexto: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  bloqueAsistencia: {
    marginTop: 8,
    marginBottom: 4,
    gap: 6,
  },
  botonEscanearAsistencia: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  botonEscanearTexto: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  asistenciaNota: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: "italic",
    textAlign: "center",
  },
  asistenciaExitosaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(46, 125, 50, 0.12)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(46, 125, 50, 0.3)",
  },
  asistenciaExitosaTexto: {
    color: colors.success,
    fontWeight: "700",
    fontSize: 13,
    flex: 1,
  },
});