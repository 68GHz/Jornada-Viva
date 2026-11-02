import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";

const SECCIONES = [
  {
    titulo: "Personas",
    accesos: [
      { titulo: "Usuarios", detalle: "Alumnos, gestores y administradores", icono: "people-outline", ruta: "UsuariosList", params: {} },
      { titulo: "Gestores de jornadas", detalle: "Quiénes organizan las jornadas", icono: "id-card-outline", ruta: "UsuariosList", params: { rol: "gestor" } },
    ],
  },
  {
    titulo: "Jornadas y objetos",
    accesos: [
      { titulo: "Jornadas", detalle: "Consulta, crea y administra jornadas", icono: "calendar-outline", ruta: "AdminJornadas" },
      { titulo: "Préstamos de objetos", detalle: "Libros, equipos y materiales prestados", icono: "library-outline", ruta: "Prestamos" },
    ],
  },
  {
    titulo: "Seguimiento",
    accesos: [
      { titulo: "Estadísticas y reportes", detalle: "Ocupación y descarga en Excel", icono: "bar-chart-outline", ruta: "Reportes" },
      { titulo: "Auditoría", detalle: "Últimas acciones administrativas", icono: "shield-checkmark-outline", ruta: "Auditoria" },
    ],
  },
];

// Accesos a cada módulo de administración
export default function AdminAdministrarScreen({ navigation }) {
  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      {SECCIONES.map((seccion) => (
        <View key={seccion.titulo} style={styles.seccion}>
          <Text style={styles.seccionTitulo}>{seccion.titulo}</Text>
          {seccion.accesos.map((a) => (
            <TouchableOpacity
              key={a.titulo}
              style={styles.acceso}
              onPress={() => navigation.navigate(a.ruta, a.params)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${a.titulo}. ${a.detalle}`}
            >
              <View style={styles.icono}>
                <Ionicons name={a.icono} size={22} color={colors.primary} />
              </View>
              <View style={styles.textos}>
                <Text style={styles.titulo}>{a.titulo}</Text>
                <Text style={styles.detalle}>{a.detalle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 22, paddingBottom: 32 },
  seccion: { gap: 10 },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginLeft: 4,
  },
  acceso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  icono: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  textos: { flex: 1, gap: 2 },
  titulo: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  detalle: { fontSize: 12, color: colors.textSecondary },
});
