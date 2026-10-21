import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadaMaestro } from "../../hooks/useJornadasMaestro";
import { crearJornada, editarJornada, mensajeDeError } from "../../services/jornadaAdminService";
import CalendarioRango from "../../components/CalendarioRango";
import LoadingSpinner from "../../components/LoadingSpinner";
import { colors } from "../../theme/colors";
import { ESPACIOS } from "../../utils/espacios";
import { permisosJornada } from "../../utils/estadoJornada";
import { ENTIDAD_POR_DEFECTO, LIMITES, validarJornada } from "../../utils/jornadaForm";
import { descomponerFecha } from "../../utils/zonaNegocio";

function Campo({ etiqueta, error, children }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      {children}
      {!!error && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

// Crear (sin `jornadaId`) o editar una jornada propia. Solo con conexión.
export default function JornadaFormScreen({ navigation, route }) {
  const jornadaId = route.params?.jornadaId;
  const esEdicion = !!jornadaId;

  const { usuario, rol } = useAuth();
  const { enLinea } = useConnectivity();
  // Al crear no hay jornada que leer (el hook no escucha nada con `null`)
  const { jornada, cargando, noExiste, propia, ahora } = useJornadaMaestro(
    esEdicion ? jornadaId : null
  );

  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    entidad: ENTIDAD_POR_DEFECTO,
    responsable: usuario?.displayName || "",
    lugar: "",
    dia: "",
    hora: "",
    cuposTotales: "",
  });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [calendario, setCalendario] = useState(false);
  const inicializado = useRef(false);

  // Al editar, el formulario parte de los datos actuales (una sola vez)
  useEffect(() => {
    if (!esEdicion || !jornada || !propia || inicializado.current) return;
    inicializado.current = true;
    const { dia, hora } = descomponerFecha(jornada.fecha);
    setForm({
      titulo: jornada.titulo || "",
      descripcion: jornada.descripcion || "",
      entidad: jornada.entidad || ENTIDAD_POR_DEFECTO,
      responsable: jornada.responsable || "",
      lugar: jornada.lugar || "",
      dia,
      hora,
      cuposTotales: String(jornada.cuposTotales ?? ""),
    });
  }, [esEdicion, jornada, propia]);

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  if (esEdicion && cargando) return <LoadingSpinner mensaje="Cargando jornada..." />;

  // Defensa en la interfaz; el servidor rechaza igualmente cualquier cambio ajeno
  const permisos = esEdicion && jornada ? permisosJornada({ rol, uid: usuario?.uid, jornada, ahora }) : null;
  if (esEdicion && (noExiste || !jornada || !permisos?.editar)) {
    const motivo = noExiste || !jornada
      ? "La jornada no existe o ya fue eliminada."
      : !propia
      ? "No tienes permiso para editar esta jornada: solo puedes administrar las que creaste."
      : "Esta jornada ya finalizó y no se puede editar.";
    return (
      <View style={styles.centrado}>
        <Ionicons name="lock-closed-outline" size={44} color={colors.textDisabled} />
        <Text style={styles.centradoTexto}>{motivo}</Text>
        <TouchableOpacity style={styles.botonSecundario} onPress={() => navigation.goBack()}>
          <Text style={styles.botonSecundarioTexto}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const guardar = async () => {
    const { errores: nuevosErrores, datos } = validarJornada(form, {
      ahora: Date.now(),
      cuposOcupados: jornada?.cuposOcupados ?? 0,
      // una jornada cancelada puede conservar una fecha pasada; las activas, no
      exigirFutura: !esEdicion || jornada.activa !== false,
    });
    setErrores(nuevosErrores);
    if (!datos) return;

    if (!enLinea) {
      Alert.alert(
        "Sin conexión",
        "Para guardar los cambios necesitas conexión a internet. Tus datos siguen en el formulario."
      );
      return;
    }

    setGuardando(true);
    try {
      if (esEdicion) await editarJornada(jornadaId, datos);
      else await crearJornada(usuario.uid, datos);
      Alert.alert(
        esEdicion ? "Jornada actualizada" : "Jornada creada",
        esEdicion
          ? "Los cambios se guardaron. Los estudiantes inscritos recibirán el aviso."
          : "La jornada ya está disponible para los estudiantes.",
        [{ text: "Aceptar", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      console.warn("Error al guardar la jornada:", err);
      Alert.alert("No se pudo guardar", mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const etiquetaDia = form.dia
    ? dayjs(form.dia).locale("es").format("dddd D [de] MMMM [de] YYYY")
    : "Elegir fecha";

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <Campo etiqueta="Título" error={errores.titulo}>
          <TextInput
            style={[styles.input, errores.titulo && styles.inputError]}
            value={form.titulo}
            onChangeText={(v) => cambiar("titulo", v)}
            maxLength={LIMITES.titulo}
            placeholder="Ej. Jornada de salud"
            placeholderTextColor={colors.textDisabled}
            accessibilityLabel="Título"
          />
        </Campo>

        <Campo etiqueta="Descripción" error={errores.descripcion}>
          <TextInput
            style={[styles.input, styles.inputMultilinea, errores.descripcion && styles.inputError]}
            value={form.descripcion}
            onChangeText={(v) => cambiar("descripcion", v)}
            maxLength={LIMITES.descripcion}
            multiline
            textAlignVertical="top"
            placeholder="¿De qué trata la jornada?"
            placeholderTextColor={colors.textDisabled}
            accessibilityLabel="Descripción"
          />
        </Campo>

        <Campo etiqueta="Entidad organizadora" error={errores.entidad}>
          <TextInput
            style={[styles.input, errores.entidad && styles.inputError]}
            value={form.entidad}
            onChangeText={(v) => cambiar("entidad", v)}
            maxLength={LIMITES.entidad}
            accessibilityLabel="Entidad organizadora"
          />
        </Campo>

        <Campo etiqueta="Responsable" error={errores.responsable}>
          <TextInput
            style={[styles.input, errores.responsable && styles.inputError]}
            value={form.responsable}
            onChangeText={(v) => cambiar("responsable", v)}
            maxLength={LIMITES.responsable}
            accessibilityLabel="Responsable"
          />
        </Campo>

        <Campo etiqueta="Espacio" error={errores.lugar}>
          <View style={styles.espacios}>
            {ESPACIOS.map((espacio) => {
              const activo = form.lugar === espacio;
              return (
                <TouchableOpacity
                  key={espacio}
                  style={[styles.espacio, activo && styles.espacioActivo]}
                  onPress={() => cambiar("lugar", espacio)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activo }}
                  accessibilityLabel={espacio}
                >
                  <Text style={[styles.espacioTexto, activo && styles.espacioTextoActivo]}>
                    {espacio}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Campo>

        <Campo etiqueta="Fecha" error={errores.dia}>
          <TouchableOpacity
            style={[styles.input, styles.selectorFecha, errores.dia && styles.inputError]}
            onPress={() => setCalendario(true)}
            accessibilityRole="button"
            accessibilityLabel="Elegir fecha"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <Text style={[styles.selectorFechaTexto, !form.dia && { color: colors.textDisabled }]}>
              {etiquetaDia}
            </Text>
          </TouchableOpacity>
        </Campo>

        <Campo etiqueta="Hora (formato 24 h, HH:mm)" error={errores.hora}>
          <TextInput
            style={[styles.input, errores.hora && styles.inputError]}
            value={form.hora}
            onChangeText={(v) => cambiar("hora", v)}
            maxLength={5}
            keyboardType="numbers-and-punctuation"
            placeholder="14:30"
            placeholderTextColor={colors.textDisabled}
            accessibilityLabel="Hora"
          />
        </Campo>

        <Campo etiqueta="Cupos" error={errores.cuposTotales}>
          <TextInput
            style={[styles.input, errores.cuposTotales && styles.inputError]}
            value={form.cuposTotales}
            onChangeText={(v) => cambiar("cuposTotales", v.replace(/[^0-9]/g, ""))}
            maxLength={4}
            keyboardType="number-pad"
            placeholder="Ej. 40"
            placeholderTextColor={colors.textDisabled}
            accessibilityLabel="Cupos"
          />
        </Campo>

        <TouchableOpacity
          style={[styles.boton, guardando && styles.botonDeshabilitado]}
          onPress={guardar}
          disabled={guardando}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={esEdicion ? "Guardar cambios" : "Crear jornada"}
        >
          {guardando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.botonTexto}>{esEdicion ? "Guardar cambios" : "Crear jornada"}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <CalendarioRango
        visible={calendario}
        desde={form.dia || null}
        hasta={form.dia || null}
        unDia
        titulo="Elegir la fecha de la jornada"
        onAplicar={(dia) => {
          cambiar("dia", dia);
          setCalendario(false);
        }}
        onCerrar={() => setCalendario(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 20, gap: 4, paddingBottom: 40 },
  campo: { marginBottom: 14 },
  etiqueta: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputMultilinea: { minHeight: 110 },
  inputError: { borderColor: colors.error },
  error: { color: colors.error, fontSize: 12, marginTop: 4 },
  espacios: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  espacio: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  espacioActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  espacioTexto: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
  espacioTextoActivo: { color: colors.white },
  selectorFecha: { flexDirection: "row", alignItems: "center", gap: 10 },
  selectorFechaTexto: { fontSize: 15, color: colors.textPrimary, textTransform: "capitalize" },
  boton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  botonDeshabilitado: { opacity: 0.6 },
  botonTexto: { color: colors.white, fontSize: 16, fontWeight: "700" },
  centrado: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 14,
    backgroundColor: colors.background,
  },
  centradoTexto: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  botonSecundario: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  botonSecundarioTexto: { color: colors.primary, fontSize: 15, fontWeight: "700" },
});
