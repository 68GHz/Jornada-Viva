import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { crearUsuario, mensajeErrorAdmin } from "../../services/adminService";
import SelectDesplegable from "../../components/SelectDesplegable";
import { IntroForm, Seccion } from "../../components/FormUi";
import { Boton, Campo, Entrada } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { ETIQUETA_ROL, ROLES } from "../../utils/roles";
import { validarUsuario } from "../../utils/usuariosAdmin";

const OPCIONES_ROL = Object.values(ROLES).map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }));

// Alta de una cuenta con el rol elegido (la cuenta de acceso se crea sin cerrar la sesión del administrador)
export default function UsuarioFormScreen({ navigation, route }) {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const [form, setForm] = useState({ nombre: "", correo: "", clave: "", rol: route.params?.rol || ROLES.ESTUDIANTE });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [verClave, setVerClave] = useState(false);

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const guardar = async () => {
    const { errores: nuevos, datos } = validarUsuario(form);
    setErrores(nuevos);
    if (!datos) return;
    if (!enLinea) {
      Alert.alert("Sin conexión", "Necesitas conexión a internet para crear cuentas.");
      return;
    }
    setGuardando(true);
    try {
      await crearUsuario({ uid: usuario.uid, nombre: usuario.displayName || usuario.email }, datos);
      Alert.alert("Cuenta creada", `${datos.correo} ya puede iniciar sesión como ${ETIQUETA_ROL[datos.rol]}.`, [
        { text: "Aceptar", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("No se pudo crear la cuenta", mensajeErrorAdmin(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.contenedor} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <IntroForm
          icono="person-add"
          titulo="Nueva cuenta"
          texto="Crea el acceso de una persona y elige qué puede hacer en la app."
        />

        <Seccion icono="person-outline" titulo="Datos de la persona" subtitulo="Con esto inicia sesión">
          <Campo etiqueta="Nombre" error={errores.nombre}>
            <Entrada
              value={form.nombre}
              onChangeText={(v) => cambiar("nombre", v)}
              maxLength={100}
              error={errores.nombre}
              placeholder="Ej. Ana Pérez"
              accessibilityLabel="Nombre"
            />
          </Campo>
          <Campo etiqueta="Correo electrónico" error={errores.correo}>
            <Entrada
              value={form.correo}
              onChangeText={(v) => cambiar("correo", v)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={errores.correo}
              placeholder="persona@correo.com"
              accessibilityLabel="Correo electrónico"
            />
          </Campo>
          <Campo etiqueta="Contraseña inicial" error={errores.clave}>
            <View>
              <Entrada
                value={form.clave}
                onChangeText={(v) => cambiar("clave", v)}
                secureTextEntry={!verClave}
                autoCapitalize="none"
                autoCorrect={false}
                error={errores.clave}
                placeholder="Mínimo 6 caracteres"
                style={{ paddingRight: 48 }}
                accessibilityLabel="Contraseña inicial"
              />
              <TouchableOpacity
                style={styles.ojo}
                onPress={() => setVerClave((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                <Ionicons name={verClave ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </Campo>
        </Seccion>

        <Seccion icono="shield-checkmark-outline" titulo="Rol y permisos" subtitulo="Qué puede hacer en la app">
          <Campo etiqueta="Rol" error={errores.rol}>
            <SelectDesplegable
              titulo="Rol y permisos"
              icono="shield-checkmark-outline"
              valor={form.rol}
              opciones={OPCIONES_ROL}
              onChange={(v) => cambiar("rol", v)}
              error={!!errores.rol}
            />
          </Campo>
          <View style={styles.nota}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.notaTexto}>
              El rol solo lo modifica un administrador. Comparte la contraseña inicial con la persona de forma segura.
            </Text>
          </View>
        </Seccion>
      </ScrollView>

      <View style={styles.barra}>
        <Boton texto="Crear cuenta" icono="checkmark-circle-outline" onPress={guardar} cargando={guardando} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 14, paddingBottom: 24 },
  ojo: { position: "absolute", right: 0, top: 0, width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  nota: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  notaTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  barra: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
});
