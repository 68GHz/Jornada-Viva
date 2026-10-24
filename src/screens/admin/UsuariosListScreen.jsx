import React, { useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { useUsuarios } from "../../hooks/useAdmin";
import LoadingSpinner from "../../components/LoadingSpinner";
import { Boton, Chip, Entrada, Vacio, estilos } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { ETIQUETA_ROL, ROLES } from "../../utils/roles";
import { cuentaActiva, filtrarUsuarios } from "../../utils/usuariosAdmin";

const COLOR_ROL = {
  [ROLES.ADMINISTRADOR]: colors.error,
  [ROLES.GESTOR]: colors.primaryLight,
  [ROLES.ESTUDIANTE]: colors.textSecondary,
};

// Listado de usuarios con búsqueda y filtros. Con `rol` en los parámetros muestra solo
// ese rol (así se usa también como listado de gestores de jornadas).
export default function UsuariosListScreen({ navigation, route }) {
  const rolFijo = route.params?.rol;
  const { usuarios, cargando, error, enLinea } = useUsuarios();
  const [texto, setTexto] = useState("");
  const [rol, setRol] = useState(rolFijo || "todos");
  const [estado, setEstado] = useState("todos");

  const lista = useMemo(() => filtrarUsuarios(usuarios, { texto, rol, estado }), [usuarios, texto, rol, estado]);
  if (cargando) return <LoadingSpinner mensaje="Cargando usuarios..." />;

  return (
    <FlatList
      style={estilos.pantalla}
      contentContainerStyle={estilos.contenido}
      data={lista}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Boton
            texto={rolFijo === ROLES.GESTOR ? "Crear gestor de jornadas" : "Crear usuario"}
            onPress={() => navigation.navigate("UsuarioForm", { rol: rolFijo })}
          />
          <Entrada
            value={texto}
            onChangeText={setTexto}
            placeholder="Buscar por nombre o correo"
            accessibilityLabel="Buscar usuarios"
            autoCapitalize="none"
          />
          {!rolFijo && (
            <View style={estilos.fila}>
              <Chip etiqueta="Todos los roles" activo={rol === "todos"} onPress={() => setRol("todos")} />
              {Object.values(ROLES).map((r) => (
                <Chip key={r} etiqueta={ETIQUETA_ROL[r]} activo={rol === r} onPress={() => setRol(r)} />
              ))}
            </View>
          )}
          <View style={estilos.fila}>
            {[["todos", "Todas las cuentas"], ["activos", "Activas"], ["inactivos", "Inactivas"]].map(([v, e]) => (
              <Chip key={v} etiqueta={e} activo={estado === v} onPress={() => setEstado(v)} />
            ))}
          </View>
          <Text style={estilos.texto}>
            {lista.length} {lista.length === 1 ? "resultado" : "resultados"}
          </Text>
          {!!error && <Text style={{ color: colors.error }}>{error}</Text>}
        </View>
      }
      ListEmptyComponent={
        <Vacio
          texto={
            !enLinea && usuarios.length === 0
              ? "Sin conexión. Conéctate a internet para consultar los usuarios."
              : "No hay usuarios con esos criterios."
          }
        />
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={estilos.tarjeta}
          onPress={() => navigation.navigate("UsuarioDetalle", { usuarioId: item.id })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${item.nombre || item.email}, ${ETIQUETA_ROL[item.rol]}${cuentaActiva(item) ? "" : ", cuenta inactiva"}`}
        >
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textPrimary }}>
            {item.nombre || "Sin nombre"}
          </Text>
          <Text style={estilos.texto}>{item.email}</Text>
          <View style={estilos.fila}>
            <Text style={{ color: COLOR_ROL[item.rol], fontWeight: "700", fontSize: 12 }}>
              {ETIQUETA_ROL[item.rol]}
            </Text>
            {!cuentaActiva(item) && <Text style={{ color: colors.error, fontWeight: "700", fontSize: 12 }}>· Cuenta inactiva</Text>}
          </View>
        </TouchableOpacity>
      )}
    />
  );
}
