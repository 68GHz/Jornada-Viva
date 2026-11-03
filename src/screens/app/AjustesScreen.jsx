import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AvatarUsuario from "../../components/AvatarUsuario";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useSync } from "../../context/SyncContext";
import { colors } from "../../theme/colors";
import { formatearFecha } from "../../utils/jornadaFecha";
import { conteoPlural } from "../../utils/plural";
import { resumenSincronizacion } from "../../utils/sincronizacion";

function Dato({ icono, etiqueta, valor }) {
  return (
    <View style={styles.dato}>
      <Ionicons name={icono} size={20} color={colors.primary} />
      <View style={styles.datoTextos}>
        <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
        <Text style={styles.datoValor} selectable>
          {valor}
        </Text>
      </View>
    </View>
  );
}

// Ajustes del estudiante: perfil, sincronización y cierre de sesión
export default function AjustesScreen({ navigation }) {
  const { usuario, cerrarSesion, esGestor, esAdministrador } = useAuth();
  const etiquetaRol = esAdministrador ? "Administrador" : esGestor ? "Gestor" : "Estudiante";
  const { enLinea } = useConnectivity();
  const { pendientes, rechazadas, ultimaSync } = useSync();

  const nombre = usuario?.displayName || etiquetaRol;
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
      avisos.push(
        `Tienes ${conteoPlural(pendientes.length, "acción pendiente", "acciones pendientes")} por sincronizar. Si cierras sesión ahora se perderán.`
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
      <View style={styles.perfil}>
        <AvatarUsuario uid={usuario?.uid} nombre={nombre} size={104} editable onPress={() => navigation.navigate("Perfil")} />
        <Text style={styles.nombre}>{nombre}</Text>
        <View style={styles.rol}>
          <Text style={styles.rolTexto}>{etiquetaRol}</Text>
        </View>
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tarjetaTitulo}>Información del perfil</Text>
        <Dato icono="person-outline" etiqueta="Nombre" valor={nombre} />
        <Dato icono="mail-outline" etiqueta="Correo electrónico" valor={usuario?.email || "—"} />
        {esAdministrador && (
          <Dato icono="key-outline" etiqueta="ID de la cuenta" valor={usuario?.uid || "—"} />
        )}
      </View>

      {esAdministrador && (
        <View style={styles.nota}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.notaTexto}>
            Tu rol y el estado de tu cuenta solo pueden cambiarlos otro administrador: nadie puede modificar los suyos.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.tarjetaAccion}
        onPress={() => navigation.navigate("Sincronizacion")}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Sincronización. ${resumenSync}. ${textoUltimaSync}`}
      >
        <Ionicons
          name={hayPendientes ? "sync-outline" : "checkmark-done-outline"}
          size={22}
          color={hayPendientes ? colors.warning : colors.primary}
        />
        <View style={styles.datoTextos}>
          <Text style={styles.datoValor}>Sincronización</Text>
          <Text style={styles.datoEtiqueta}>{resumenSync}</Text>
          <Text style={styles.datoEtiqueta}>{textoUltimaSync}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.botonSalir}
        onPress={confirmarCerrarSesion}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={styles.botonSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 20, gap: 16 },
  perfil: { alignItems: "center", gap: 8, paddingVertical: 8 },
  nombre: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
  rol: { backgroundColor: colors.primaryPale, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  rolTexto: { fontSize: 12, fontWeight: "700", color: colors.primary },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  tarjetaTitulo: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  dato: { flexDirection: "row", alignItems: "center", gap: 12 },
  datoTextos: { flex: 1, gap: 2 },
  datoEtiqueta: { fontSize: 12, color: colors.textSecondary },
  datoValor: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  nota: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingHorizontal: 4 },
  notaTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  tarjetaAccion: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  botonSalir: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.error,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  botonSalirTexto: { color: colors.error, fontSize: 15, fontWeight: "700" },
});
