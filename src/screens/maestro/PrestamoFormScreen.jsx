import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Boton, Campo, Chip, Entrada } from "../../components/AdminUi";
import { useConnectivity } from "../../context/ConnectivityContext";
import { mensajeDeErrorPrestamo, registrarPrestamo } from "../../services/prestamoService";
import { colors } from "../../theme/colors";
import {
  ETIQUETA_TIPO_OBJETO,
  LIMITES_PRESTAMO,
  TIPOS_OBJETO,
  validarPrestamo,
} from "../../utils/prestamos";

// Plazos que se pueden elegir con un toque (días a partir de hoy)
const PLAZOS_DIAS = [3, 7, 15, 30];
const DIA_MS = 24 * 60 * 60 * 1000;

// FE-02 · Registrar el préstamo de un objeto (libro, equipo o material) a un estudiante. Solo con conexión.
export default function PrestamoFormScreen({ navigation }) {
  const { enLinea } = useConnectivity();
  const [form, setForm] = useState({ codigo: "", nombre: "", tipo: "libro", correo: "", dias: 7, nota: "" });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const guardar = async () => {
    const ahora = Date.now();
    const { errores: nuevos, datos } = validarPrestamo(
      { codigo: form.codigo, nombre: form.nombre, tipo: form.tipo, correo: form.correo, nota: form.nota, vence: ahora + form.dias * DIA_MS },
      { ahora }
    );
    setErrores(nuevos);
    if (!datos) return;
    if (!enLinea) {
      Alert.alert("Sin conexión", "Para registrar un préstamo necesitas conexión a internet. Tus datos siguen en el formulario.");
      return;
    }
    setGuardando(true);
    try {
      await registrarPrestamo(datos);
      Alert.alert("Préstamo registrado", `«${datos.nombre}» quedó prestado hasta dentro de ${form.dias} días.`, [
        { text: "Aceptar", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("No se pudo registrar", mensajeDeErrorPrestamo(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.contenedor} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Campo etiqueta="Código del objeto (inventario)" error={errores.codigo}>
          <Entrada
            value={form.codigo}
            onChangeText={(v) => cambiar("codigo", v)}
            maxLength={LIMITES_PRESTAMO.codigo}
            autoCapitalize="characters"
            placeholder="Ej. LIB-001"
            error={errores.codigo}
            accessibilityLabel="Código del objeto"
          />
        </Campo>

        <Campo etiqueta="Nombre del objeto" error={errores.nombre}>
          <Entrada
            value={form.nombre}
            onChangeText={(v) => cambiar("nombre", v)}
            maxLength={LIMITES_PRESTAMO.nombre}
            placeholder="Ej. Cálculo de una variable"
            error={errores.nombre}
            accessibilityLabel="Nombre del objeto"
          />
        </Campo>

        <Campo etiqueta="Tipo" error={errores.tipo}>
          <View style={styles.chips}>
            {TIPOS_OBJETO.map((t) => (
              <Chip key={t} etiqueta={ETIQUETA_TIPO_OBJETO[t]} activo={form.tipo === t} onPress={() => cambiar("tipo", t)} />
            ))}
          </View>
        </Campo>

        <Campo etiqueta="Correo del estudiante" error={errores.correo}>
          <Entrada
            value={form.correo}
            onChangeText={(v) => cambiar("correo", v)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="estudiante@correo.com"
            error={errores.correo}
            accessibilityLabel="Correo del estudiante"
          />
        </Campo>

        <Campo etiqueta="Devolver en" error={errores.vence}>
          <View style={styles.chips}>
            {PLAZOS_DIAS.map((d) => (
              <Chip key={d} etiqueta={`${d} días`} activo={form.dias === d} onPress={() => cambiar("dias", d)} />
            ))}
          </View>
        </Campo>

        <Campo etiqueta="Nota (opcional)" error={errores.nota}>
          <Entrada
            value={form.nota}
            onChangeText={(v) => cambiar("nota", v)}
            maxLength={LIMITES_PRESTAMO.nota}
            placeholder="Ej. con la carátula rayada"
            error={errores.nota}
            accessibilityLabel="Nota"
          />
        </Campo>

        {!enLinea && <Text style={styles.aviso}>Sin conexión: conéctate a internet para registrar el préstamo.</Text>}
        <Boton texto="Registrar préstamo" onPress={guardar} cargando={guardando} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 20, gap: 4, paddingBottom: 40 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  aviso: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
});
