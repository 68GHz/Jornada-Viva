import React, { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { crearUsuario, mensajeErrorAdmin } from "../../services/adminService";
import { Boton, Campo, Chip, Entrada, estilos } from "../../components/AdminUi";
import { ETIQUETA_ROL, ROLES } from "../../utils/roles";
import { validarUsuario } from "../../utils/usuariosAdmin";

// Alta de una cuenta con el rol elegido (la cuenta de acceso se crea sin cerrar la sesión del administrador)
export default function UsuarioFormScreen({ navigation, route }) {
  const { usuario } = useAuth();
  const { enLinea } = useConnectivity();
  const [form, setForm] = useState({ nombre: "", correo: "", clave: "", rol: route.params?.rol || ROLES.ESTUDIANTE });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

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
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <Campo etiqueta="Nombre" error={errores.nombre}>
        <Entrada value={form.nombre} onChangeText={(v) => cambiar("nombre", v)} maxLength={100} error={errores.nombre} accessibilityLabel="Nombre" />
      </Campo>
      <Campo etiqueta="Correo electrónico" error={errores.correo}>
        <Entrada
          value={form.correo}
          onChangeText={(v) => cambiar("correo", v)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={errores.correo}
          accessibilityLabel="Correo electrónico"
        />
      </Campo>
      <Campo etiqueta="Contraseña inicial (mínimo 6 caracteres)" error={errores.clave}>
        <Entrada
          value={form.clave}
          onChangeText={(v) => cambiar("clave", v)}
          secureTextEntry
          autoCapitalize="none"
          error={errores.clave}
          accessibilityLabel="Contraseña inicial"
        />
      </Campo>
      <Campo etiqueta="Rol" error={errores.rol}>
        <View style={estilos.fila}>
          {Object.values(ROLES).map((r) => (
            <Chip key={r} etiqueta={ETIQUETA_ROL[r]} activo={form.rol === r} onPress={() => cambiar("rol", r)} />
          ))}
        </View>
      </Campo>
      <Text style={estilos.texto}>El rol solo lo modifica un administrador. Comparte la contraseña inicial con la persona de forma segura.</Text>
      <Boton texto="Crear cuenta" onPress={guardar} cargando={guardando} />
    </ScrollView>
  );
}
