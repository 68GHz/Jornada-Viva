import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useJornadas } from "../../context/JornadasContext";
import { useEstadisticasApi } from "../../hooks/useAdmin";
import { useJornadasMaestro } from "../../hooks/useJornadasMaestro";
import { useMisPrestamos, usePrestamosGestionados } from "../../hooks/usePrestamos";
import { usaApi } from "../../config/api";
import AvatarUsuario from "../../components/AvatarUsuario";
import { Cifra } from "../../components/Graficas";
import { SkeletonResumenPerfil } from "../../components/Skeleton";
import { colors } from "../../theme/colors";
import { contarPorEstado } from "../../utils/estadoJornada";
import { contarHistorial } from "../../utils/jornadaEstado";
import { formatearFecha } from "../../utils/jornadaFecha";
import { contarPrestamos } from "../../utils/prestamos";
import { ETIQUETA_ROL, ROLES } from "../../utils/roles";

// Qué puede hacer cada rol en la app
const PERMISOS = {
  [ROLES.ESTUDIANTE]: [
    ["calendar-outline", "Ver las jornadas disponibles e inscribirte"],
    ["close-circle-outline", "Cancelar tu inscripción dentro del plazo permitido"],
    ["qr-code-outline", "Registrar tu asistencia escaneando el código QR"],
    ["library-outline", "Consultar tus préstamos de objetos y tus avisos"],
  ],
  [ROLES.GESTOR]: [
    ["create-outline", "Crear y administrar las jornadas que tienes asignadas"],
    ["qr-code-outline", "Generar el código QR de asistencia y corregirla"],
    ["download-outline", "Descargar la planilla de inscritos en Excel"],
    ["library-outline", "Registrar y recibir los préstamos de objetos"],
  ],
  [ROLES.ADMINISTRADOR]: [
    ["people-outline", "Administrar cuentas, roles y estados"],
    ["calendar-outline", "Gestionar cualquier jornada y reasignar gestores"],
    ["bar-chart-outline", "Consultar estadísticas y descargar reportes"],
    ["shield-checkmark-outline", "Revisar la auditoría de las acciones administrativas"],
  ],
};

const ICONO_ROL = {
  [ROLES.ESTUDIANTE]: "school-outline",
  [ROLES.GESTOR]: "briefcase-outline",
  [ROLES.ADMINISTRADOR]: "shield-checkmark-outline",
};

const fechaDe = (texto) => {
  const ms = Date.parse(texto);
  return Number.isFinite(ms) ? formatearFecha(ms, "D [de] MMMM [de] YYYY, h:mm A") : null;
};

function Fila({ icono, etiqueta, valor, seleccionable }) {
  if (!valor) return null;
  return (
    <View style={styles.dato}>
      <View style={styles.datoIcono}>
        <Ionicons name={icono} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
        <Text style={styles.datoValor} selectable={seleccionable}>
          {valor}
        </Text>
      </View>
    </View>
  );
}

function Tarjeta({ titulo, children }) {
  return (
    <View style={styles.tarjeta}>
      <Text style={styles.tarjetaTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

// ---- Resumen de actividad: cada rol ve cifras de lo suyo ----

function ResumenEstudiante() {
  const { misJornadas, cargando } = useJornadas();
  const { prestamos } = useMisPrestamos();
  const historial = useMemo(() => contarHistorial(misJornadas), [misJornadas]);
  const prest = useMemo(() => contarPrestamos(prestamos, Date.now()), [prestamos]);
  if (cargando) return <SkeletonResumenPerfil />;
  return (
    <View style={styles.cifras}>
      <Cifra valor={historial.inscritas} etiqueta="Jornadas inscritas" />
      <Cifra valor={historial.asistidas} etiqueta="Asistencias" color={colors.success} />
      <Cifra valor={prest.activos} etiqueta="Préstamos activos" color={prest.vencidos > 0 ? colors.error : colors.primaryLight} />
    </View>
  );
}

function ResumenGestor() {
  const { jornadas, cargando, ahora } = useJornadasMaestro();
  const { prestamos } = usePrestamosGestionados();
  const conteo = useMemo(() => contarPorEstado(jornadas, ahora), [jornadas, ahora]);
  const prest = useMemo(() => contarPrestamos(prestamos, Date.now()), [prestamos]);
  if (cargando) return <SkeletonResumenPerfil />;
  return (
    <View style={styles.cifras}>
      <Cifra valor={conteo.total} etiqueta="Jornadas asignadas" />
      <Cifra valor={conteo.activa + conteo.en_curso} etiqueta="Activas o en curso" color={colors.success} />
      <Cifra valor={prest.activos} etiqueta="Préstamos activos" color={prest.vencidos > 0 ? colors.error : colors.primaryLight} />
    </View>
  );
}

function ResumenAdministrador() {
  const conApi = usaApi("reportes");
  const { estadisticas, cargando } = useEstadisticasApi(conApi);
  if (conApi && cargando && !estadisticas) return <SkeletonResumenPerfil />;
  if (!estadisticas) return <Text style={styles.nota}>Conéctate para ver el resumen de la plataforma.</Text>;
  return (
    <View style={styles.cifras}>
      <Cifra valor={estadisticas.totalUsuarios} etiqueta="Usuarios" />
      <Cifra valor={estadisticas.totalJornadas} etiqueta="Jornadas" color={colors.primaryLight} />
      <Cifra valor={`${estadisticas.ocupacion}%`} etiqueta="Ocupación de cupos" color={colors.success} />
    </View>
  );
}

const RESUMEN = {
  [ROLES.ESTUDIANTE]: ResumenEstudiante,
  [ROLES.GESTOR]: ResumenGestor,
  [ROLES.ADMINISTRADOR]: ResumenAdministrador,
};

// Perfil del usuario (igual para los tres roles): identidad, datos de la cuenta, actividad y permisos
export default function PerfilScreen() {
  const { usuario, rol } = useAuth();
  const nombre = usuario?.displayName || ETIQUETA_ROL[rol] || "Usuario";
  const Resumen = RESUMEN[rol] || ResumenEstudiante;
  const registro = fechaDe(usuario?.metadata?.creationTime);
  const ultimoAcceso = fechaDe(usuario?.metadata?.lastSignInTime);

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido}>
      <View style={styles.hero}>
        <AvatarUsuario uid={usuario?.uid} nombre={nombre} size={112} editable />
        <Text style={styles.nombre}>{nombre}</Text>
        <Text style={styles.correo} selectable>
          {usuario?.email}
        </Text>
        <View style={styles.rol}>
          <Ionicons name={ICONO_ROL[rol] || "person-outline"} size={14} color={colors.primary} />
          <Text style={styles.rolTexto}>{ETIQUETA_ROL[rol] || "Usuario"}</Text>
        </View>
      </View>

      <Tarjeta titulo="Mi actividad">
        <Resumen />
      </Tarjeta>

      <Tarjeta titulo="Datos de la cuenta">
        <Fila icono="person-outline" etiqueta="Nombre" valor={nombre} />
        <Fila icono="mail-outline" etiqueta="Correo electrónico" valor={usuario?.email} seleccionable />
        <Fila icono={ICONO_ROL[rol] || "person-outline"} etiqueta="Rol" valor={ETIQUETA_ROL[rol]} />
        <Fila icono="calendar-outline" etiqueta="Cuenta creada el" valor={registro} />
        <Fila icono="time-outline" etiqueta="Último acceso" valor={ultimoAcceso} />
        <Fila icono="key-outline" etiqueta="ID de la cuenta" valor={usuario?.uid} seleccionable />
      </Tarjeta>

      <Tarjeta titulo="Lo que puedes hacer">
        {(PERMISOS[rol] || PERMISOS[ROLES.ESTUDIANTE]).map(([icono, texto]) => (
          <View key={texto} style={styles.permiso}>
            <Ionicons name={icono} size={18} color={colors.primary} />
            <Text style={styles.permisoTexto}>{texto}</Text>
          </View>
        ))}
      </Tarjeta>

      <View style={styles.aviso}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.avisoTexto}>
          Tu rol y el estado de tu cuenta solo pueden cambiarlos un administrador. Si algo de tus datos no es correcto,
          comunícate con el equipo de Bienestar.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  hero: { alignItems: "center", gap: 6, paddingVertical: 8 },
  nombre: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, textAlign: "center", marginTop: 4 },
  correo: { fontSize: 14, color: colors.textSecondary },
  rol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primaryPale,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 4,
  },
  rolTexto: { fontSize: 12, fontWeight: "800", color: colors.primary },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  tarjetaTitulo: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  cifras: { flexDirection: "row", gap: 10 },
  nota: { fontSize: 13, color: colors.textSecondary },
  dato: { flexDirection: "row", alignItems: "center", gap: 12 },
  datoIcono: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  datoEtiqueta: { fontSize: 12, color: colors.textSecondary },
  datoValor: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
  permiso: { flexDirection: "row", alignItems: "center", gap: 12 },
  permisoTexto: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  aviso: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingHorizontal: 4 },
  avisoTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
});
