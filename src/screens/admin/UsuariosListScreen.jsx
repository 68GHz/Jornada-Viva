import React, { useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUsuarios } from "../../hooks/useAdmin";
import AvatarMini from "../../components/AvatarMini";
import { SkeletonUsuarios } from "../../components/Skeleton";
import { Buscador, Chip, Vacio } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { conteoPlural } from "../../utils/plural";
import { ETIQUETA_ROL, ROLES } from "../../utils/roles";
import { cuentaActiva, filtrarUsuarios } from "../../utils/usuariosAdmin";

const COLOR_ROL = {
  [ROLES.ADMINISTRADOR]: colors.error,
  [ROLES.GESTOR]: colors.primaryLight,
  [ROLES.ESTUDIANTE]: colors.textSecondary,
};

const ESTADOS = [
  ["todos", "Todas"],
  ["activos", "Activas"],
  ["inactivos", "Inactivas"],
];

// Listado de usuarios con búsqueda y filtros. Con `rol` en los parámetros muestra solo
// ese rol (así se usa también como listado de gestores de jornadas).
export default function UsuariosListScreen({ navigation, route }) {
  const rolFijo = route.params?.rol;
  const { usuarios, cargando, error, enLinea } = useUsuarios();
  const [texto, setTexto] = useState("");
  const [rol, setRol] = useState(rolFijo || "todos");
  const [estado, setEstado] = useState("todos");

  const lista = useMemo(() => filtrarUsuarios(usuarios, { texto, rol, estado }), [usuarios, texto, rol, estado]);
  // Contadores de los filtros (sobre todas las cuentas del alcance de la pantalla)
  const alcance = useMemo(() => (rolFijo ? usuarios.filter((u) => u.rol === rolFijo) : usuarios), [usuarios, rolFijo]);
  const porRol = useMemo(() => {
    const c = { todos: alcance.length };
    for (const r of Object.values(ROLES)) c[r] = alcance.filter((u) => u.rol === r).length;
    return c;
  }, [alcance]);
  const porEstado = useMemo(
    () => ({
      todos: alcance.length,
      activos: alcance.filter(cuentaActiva).length,
      inactivos: alcance.filter((u) => !cuentaActiva(u)).length,
    }),
    [alcance]
  );

  if (cargando) return <SkeletonUsuarios />;

  const crear = () => navigation.navigate("UsuarioForm", { rol: rolFijo });

  return (
    <FlatList
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      data={lista}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.cabecera}>
          <View style={styles.filaBuscar}>
            <Buscador value={texto} onChangeText={setTexto} placeholder="Buscar por nombre o correo" accesibilidad="Buscar usuarios" />
            <TouchableOpacity
              style={styles.botonCrear}
              onPress={crear}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={rolFijo === ROLES.GESTOR ? "Crear gestor de jornadas" : "Crear usuario"}
            >
              <Ionicons name="person-add-outline" size={22} color={colors.white} />
            </TouchableOpacity>
          </View>

          {!rolFijo && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              <Chip etiqueta="Todos" contador={porRol.todos} activo={rol === "todos"} onPress={() => setRol("todos")} />
              {Object.values(ROLES).map((r) => (
                <Chip key={r} etiqueta={ETIQUETA_ROL[r]} contador={porRol[r]} activo={rol === r} onPress={() => setRol(r)} />
              ))}
            </ScrollView>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {ESTADOS.map(([v, e]) => (
              <Chip key={v} etiqueta={e} contador={porEstado[v]} activo={estado === v} onPress={() => setEstado(v)} color={v === "inactivos" ? colors.error : colors.primary} />
            ))}
          </ScrollView>

          <Text style={styles.conteo}>{conteoPlural(lista.length, "resultado", "resultados")}</Text>
          {!!error && (
            <View style={styles.aviso} accessibilityRole="alert">
              <Ionicons name="warning-outline" size={18} color={colors.error} />
              <Text style={styles.avisoTexto}>{error}</Text>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        <Vacio
          icono={!enLinea && usuarios.length === 0 ? "cloud-offline-outline" : "people-outline"}
          texto={
            !enLinea && usuarios.length === 0
              ? "Sin conexión. Conéctate a internet para consultar los usuarios."
              : "No hay usuarios con esos criterios."
          }
        />
      }
      renderItem={({ item }) => {
        const activa = cuentaActiva(item);
        const color = COLOR_ROL[item.rol];
        return (
          <TouchableOpacity
            style={[styles.tarjeta, !activa && styles.tarjetaInactiva]}
            onPress={() => navigation.navigate("UsuarioDetalle", { usuarioId: item.id })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${item.nombre || item.email}, ${ETIQUETA_ROL[item.rol]}${activa ? "" : ", cuenta inactiva"}`}
          >
            <AvatarMini uid={item.id} nombre={item.nombre || item.email} size={48} />
            <View style={styles.datos}>
              <Text style={styles.nombre} numberOfLines={1}>
                {item.nombre || "Sin nombre"}
              </Text>
              <Text style={styles.correo} numberOfLines={1}>
                {item.email}
              </Text>
              <View style={styles.etiquetas}>
                <View style={[styles.pildora, { backgroundColor: `${color}1F` }]}>
                  <Text style={[styles.pildoraTexto, { color }]}>{ETIQUETA_ROL[item.rol]}</Text>
                </View>
                {!activa && (
                  <View style={[styles.pildora, { backgroundColor: "#FDECEC" }]}>
                    <Text style={[styles.pildoraTexto, { color: colors.error }]}>Cuenta inactiva</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 10, paddingBottom: 32 },
  cabecera: { gap: 12, marginBottom: 4 },
  filaBuscar: { flexDirection: "row", alignItems: "center", gap: 10 },
  botonCrear: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { gap: 8, paddingRight: 8 },
  conteo: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  aviso: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FDF2F2",
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 14,
    padding: 12,
  },
  avisoTexto: { flex: 1, fontSize: 13, color: colors.error },
  tarjeta: {
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
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  tarjetaInactiva: { opacity: 0.7 },
  datos: { flex: 1, gap: 2 },
  nombre: { fontSize: 15, fontWeight: "800", color: colors.textPrimary },
  correo: { fontSize: 12, color: colors.textSecondary },
  etiquetas: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  pildora: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pildoraTexto: { fontSize: 11, fontWeight: "800" },
});
