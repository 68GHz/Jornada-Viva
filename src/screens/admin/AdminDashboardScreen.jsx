import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useEstadisticasApi, useTodasJornadas, useUsuarios } from "../../hooks/useAdmin";
import { usaApi } from "../../config/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import { Boton, Indicador, estilos } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { calcularEstadisticas } from "../../utils/usuariosAdmin";

const ACCESOS = [
  { titulo: "Usuarios", ruta: "UsuariosList", params: {} },
  { titulo: "Gestores de jornadas", ruta: "UsuariosList", params: { rol: "gestor" } },
  { titulo: "Jornadas", ruta: "AdminJornadas" },
  { titulo: "Préstamos de objetos", ruta: "Prestamos" },
  { titulo: "Estadísticas y reportes", ruta: "Reportes" },
  { titulo: "Auditoría", ruta: "Auditoria" },
  { titulo: "Mi perfil", ruta: "AdminPerfil" },
];

// Panel de control del administrador: indicadores globales y accesos a cada módulo
export default function AdminDashboardScreen({ navigation }) {
  const { usuario } = useAuth();
  // Con la API (módulo "reportes") el servidor calcula los indicadores
  const conApi = usaApi("reportes");
  const u = useUsuarios(!conApi);
  const j = useTodasJornadas(null, !conApi);
  const remoto = useEstadisticasApi(conApi);
  const local = useMemo(
    () => (conApi ? null : calcularEstadisticas(u.usuarios, j.jornadas)),
    [conApi, u.usuarios, j.jornadas]
  );
  // Sin datos (p. ej. sin conexión) se muestran los indicadores en cero, igual que antes
  const stats = (conApi ? remoto.estadisticas : local) ?? calcularEstadisticas([], []);

  if (conApi ? remoto.cargando && !remoto.estadisticas : u.cargando || j.cargando) {
    return <LoadingSpinner mensaje="Cargando el panel..." />;
  }

  const error = conApi ? remoto.error : u.error || j.error;
  const sinDatos = conApi ? !remoto.estadisticas : u.usuarios.length === 0;
  const enLinea = conApi ? remoto.enLinea : u.enLinea;
  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={estilos.tarjeta}>
        <View style={estilos.fila}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
          <Text style={estilos.titulo}>Hola, {(usuario?.displayName || "Administrador").split(" ")[0]}</Text>
        </View>
        <Text style={estilos.texto}>Panel de administración de la plataforma.</Text>
      </View>

      {!!error && <Text style={{ color: colors.error }}>{error}</Text>}
      {!enLinea && sinDatos && (
        <Text style={estilos.texto}>Sin conexión: conéctate a internet para ver los datos de la plataforma.</Text>
      )}

      <Text style={estilos.seccion}>Usuarios</Text>
      <View style={estilos.fila}>
        <Indicador valor={stats.totalUsuarios} etiqueta="Total de usuarios" />
        <Indicador valor={stats.estudiantes} etiqueta="Alumnos" />
        <Indicador valor={stats.gestores} etiqueta="Gestores" color={colors.primaryLight} />
        <Indicador valor={stats.administradores} etiqueta="Administradores" />
        <Indicador valor={stats.cuentasInactivas} etiqueta="Cuentas inactivas" color={colors.error} />
      </View>

      <Text style={estilos.seccion}>Jornadas</Text>
      <View style={estilos.fila}>
        <Indicador valor={stats.totalJornadas} etiqueta="Total de jornadas" />
        <Indicador valor={stats.porEstado.activa} etiqueta="Activas" color={colors.success} />
        <Indicador valor={stats.porEstado.en_curso} etiqueta="En curso" color={colors.accent} />
        <Indicador valor={stats.porEstado.cancelada} etiqueta="Canceladas" color={colors.error} />
        <Indicador valor={stats.porEstado.finalizada} etiqueta="Finalizadas" color={colors.textDisabled} />
        <Indicador valor={`${stats.ocupacion}%`} etiqueta="Ocupación de cupos" />
      </View>

      <Text style={estilos.seccion}>Administrar</Text>
      <View style={{ gap: 10 }}>
        {ACCESOS.map((a) => (
          <Boton
            key={a.titulo}
            texto={a.titulo}
            variante="secundario"
            onPress={() => navigation.navigate(a.ruta, a.params)}
          />
        ))}
      </View>
    </ScrollView>
  );
}
