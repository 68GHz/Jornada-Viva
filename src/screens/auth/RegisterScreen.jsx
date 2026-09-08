import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../theme/colors";

export default function RegisterScreen({ navigation }) {
  const { registrar } = useAuth();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [cargando, setCargando] = useState(false);

  const manejarRegistro = async () => {
    if (!nombre.trim() || !email.trim() || !password || !confirmar) {
      Alert.alert(
        "Campos requeridos",
        "Completa todos los campos para continuar.",
      );
      return;
    }
    if (password !== confirmar) {
      Alert.alert(
        "Contraseñas distintas",
        "Las contraseñas no coinciden. Verifica e intenta de nuevo.",
      );
      return;
    }
    if (password.length < 6) {
      Alert.alert(
        "Contraseña muy corta",
        "La contraseña debe tener mínimo 6 caracteres.",
      );
      return;
    }

    setCargando(true);
    try {
      await registrar(nombre.trim(), email.trim(), password);
      // La navegación es automática por el cambio en AuthContext
    } catch (error) {
      let mensaje = "No se pudo crear la cuenta. Intenta de nuevo.";
      if (error.code === "auth/email-already-in-use") {
        mensaje = "Este correo ya está registrado. ¿Deseas iniciar sesión?";
      } else if (error.code === "auth/invalid-email") {
        mensaje = "El formato del correo no es válido.";
      } else if (error.code === "auth/weak-password") {
        mensaje =
          "La contraseña es demasiado débil. Usa al menos 6 caracteres.";
      }
      Alert.alert("Error al registrarse", mensaje);
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.encabezado}>
          <Text style={styles.titulo}>Crear cuenta</Text>
          <Text style={styles.subtitulo}>
            Únete para inscribirte en jornadas
          </Text>
        </View>

        <View style={styles.formulario}>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Tu nombre"
            placeholderTextColor={colors.textDisabled}
            autoCapitalize="words"
            value={nombre}
            onChangeText={setNombre}
          />

          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            style={styles.input}
            placeholder="tucorreo@ejemplo.com"
            placeholderTextColor={colors.textDisabled}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor={colors.textDisabled}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.label}>Confirmar contraseña</Text>
          <TextInput
            style={styles.input}
            placeholder="Repite tu contraseña"
            placeholderTextColor={colors.textDisabled}
            secureTextEntry
            value={confirmar}
            onChangeText={setConfirmar}
          />

          <TouchableOpacity
            style={[styles.boton, cargando && styles.botonDeshabilitado]}
            onPress={manejarRegistro}
            disabled={cargando}
            activeOpacity={0.85}
          >
            <Text style={styles.botonTexto}>
              {cargando ? "Creando cuenta..." : "Crear cuenta"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.piePagina}>
          <Text style={styles.pieTexto}>¿Ya tienes cuenta?</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.enlace}> Inicia sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  encabezado: {
    alignItems: "center",
    marginBottom: 28,
  },
  titulo: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 8,
  },
  subtitulo: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  formulario: {
    gap: 4,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 12,
    marginBottom: 4,
  },
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
  boton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  botonDeshabilitado: {
    opacity: 0.6,
  },
  botonTexto: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
  },
  piePagina: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  pieTexto: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  enlace: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },

  confirmacionCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    gap: 6,
    marginTop: 8,
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
});
