import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../theme/colors";

export default function LoginScreen({ navigation }) {
  const { iniciarSesion } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const passwordRef = useRef(null);

  const manejarLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Campos requeridos", "Por favor ingresa tu correo y contraseña.");
      return;
    }

    setCargando(true);
    try {
      await iniciarSesion(email.trim(), password);
    } catch (error) {
      let mensaje = "No se pudo iniciar sesión. Intenta de nuevo.";
      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        mensaje = "Correo o contraseña incorrectos.";
      } else if (error.code === "auth/invalid-email") {
        mensaje = "El formato del correo no es válido.";
      } else if (error.code === "auth/too-many-requests") {
        mensaje = "Demasiados intentos fallidos. Espera unos minutos.";
      }
      Alert.alert("Error al ingresar", mensaje);
    } finally {
      setCargando(false);
    }
  };

  return (
    <SafeAreaView style={styles.wrapper} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.logoContenedor}>
          <Image
            source={require("../../../assets/Horizontal-tdea.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Logo del TdeA"
          />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Encabezado */}
          <View style={styles.encabezado}>
            <Text style={styles.titulo}>Jornada Viva</Text>
            <Text style={styles.subtitulo}>
              Accede para ver y registrarte en las jornadas de tu comunidad
            </Text>
          </View>

          {/* Formulario */}
          <View style={styles.formulario}>
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
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />

            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              returnKeyType="done"
              onSubmitEditing={manejarLogin}
            />

            <TouchableOpacity
              style={[styles.boton, cargando && styles.botonDeshabilitado]}
              onPress={manejarLogin}
              disabled={cargando}
              activeOpacity={0.85}
            >
              <Text style={styles.botonTexto}>
                {cargando ? "Ingresando..." : "Ingresar"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Registro */}
          <View style={styles.piePagina}>
            <Text style={styles.pieTexto}>¿Aún no tienes cuenta?</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Register")}>
              <Text style={styles.enlace}> Regístrate aquí</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  logoContenedor: {
    alignItems: "center",
    paddingTop: 16,
  },
  logo: {
    width: 150,
    height: 38,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 20,
  },
  encabezado: {
    alignItems: "center",
    marginBottom: 36,
  },
  icono: {
    fontSize: 52,
    marginBottom: 12,
  },
  titulo: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary,
    textAlign: "center",
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
    gap: 6,
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
});