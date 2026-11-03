import React, { useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useTodasJornadas, useUsuarios } from "../../hooks/useAdmin";
import JornadaCard from "../../components/JornadaCard";
import CalendarioRango from "../../components/CalendarioRango";
import SelectDesplegable from "../../components/SelectDesplegable";
import { SkeletonJornadasAdmin } from "../../components/Skeleton";
import { colorEstado, estadoParaCard } from "../../components/EstadoJornadaChip";
import { Buscador, Chip, Vacio } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import {
  ESTADOS_JORNADA,
  ETIQUETA_ESTADO_PLURAL,
  contarPorEstado,
  estadoJornada,
  ordenarParaMaestro,
} from "../../utils/estadoJornada";
import { conteoPlural, palabraPlural } from "../../utils/plural";
import { puedeSerResponsable } from "../../utils/roles";
import { filtrarJornadas } from "../../utils/usuariosAdmin";
import { descomponerFecha } from "../../utils/zonaNegocio";

const etiquetaRango = (desde, hasta) => {
  if (!desde) return "Todas las fechas";
  const f = (d) => dayjs(d).locale("es").format("D MMM");
  return !hasta || hasta === desde ? f(desde) : `${f(desde)} – ${f(hasta)}`;
};

// Todas las jornadas de la plataforma, con filtros por estado, fecha, gestor y texto
export default function AdminJornadasScreen({ navigation }) {
  const { jornadas, cargando, error, enLinea } = useTodasJornadas();
  const { usuarios } = useUsuarios();
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState("todos");
  const [gestor, setGestor] = useState("todos");
  const [rango, setRango] = useState({ desde: null, hasta: null });
  const [calendario, setCalendario] = useState(false);

  const nombres = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre || u.email])), [usuarios]);
  const responsables = useMemo(() => usuarios.filter((u) => puedeSerResponsable(u.rol)), [usuarios]);
  const opcionesGestor = useMemo(
    () => [
      { valor: "todos", etiqueta: "Todos los gestores" },
      { valor: "sin-gestor", etiqueta: "Sin gestor asignado" },
      ...responsables.map((g) => ({ valor: g.id, etiqueta: g.nombre || g.email })),
    ],
    [responsables]
  );
  const conteo = useMemo(() => contarPorEstado(jornadas, Date.now()), [jornadas]);
  const lista = useMemo(
    () =>
      ordenarParaMaestro(
        filtrarJornadas(jornadas, { texto, estado, gestor, ...rango }, Date.now(), (ms) => descomponerFecha(ms).dia)
      ),
    [jornadas, texto, estado, gestor, rango]
  );

  if (cargando) return <SkeletonJornadasAdmin />;

  return (
    <>
      <FlatList
        style={styles.pantalla}
        contentContainerStyle={styles.contenido}
        data={lista}
        keyExtractor={(j) => j.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.cabecera}>
            <View style={styles.filaBuscar}>
              <Buscador value={texto} onChangeText={setTexto} placeholder="Buscar por título o espacio" accesibilidad="Buscar jornadas" />
              <TouchableOpacity
                style={styles.botonCrear}
                onPress={() => navigation.navigate("JornadaForm")}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Crear jornada"
              >
                <Ionicons name="add" size={26} color={colors.white} />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              <Chip etiqueta="Todas" contador={conteo.total} activo={estado === "todos"} onPress={() => setEstado("todos")} />
              {Object.values(ESTADOS_JORNADA).map((e) => (
                <Chip
                  key={e}
                  etiqueta={ETIQUETA_ESTADO_PLURAL[e]}
                  contador={conteo[e]}
                  color={colorEstado(e)}
                  activo={estado === e}
                  onPress={() => setEstado(e)}
                />
              ))}
            </ScrollView>

            <View style={styles.filaFiltros}>
              <View style={{ flex: 1 }}>
                <SelectDesplegable
                  titulo="Gestor"
                  icono="briefcase-outline"
                  valor={gestor}
                  opciones={opcionesGestor}
                  onChange={setGestor}
                />
              </View>
              <TouchableOpacity
                style={[styles.fecha, !!rango.desde && styles.fechaActiva]}
                onPress={() => setCalendario(true)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Rango de fechas: ${etiquetaRango(rango.desde, rango.hasta)}`}
              >
                <Ionicons name="calendar-outline" size={18} color={rango.desde ? colors.white : colors.primary} />
                <Text style={[styles.fechaTexto, !!rango.desde && { color: colors.white }]} numberOfLines={1}>
                  {etiquetaRango(rango.desde, rango.hasta)}
                </Text>
                {!!rango.desde && (
                  <TouchableOpacity
                    onPress={() => setRango({ desde: null, hasta: null })}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Quitar fechas"
                  >
                    <Ionicons name="close-circle" size={18} color={colors.white} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.conteo}>
              {lista.length} de {conteoPlural(jornadas.length, "jornada", "jornadas")}
            </Text>
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
            icono={!enLinea && jornadas.length === 0 ? "cloud-offline-outline" : "calendar-outline"}
            texto={
              !enLinea && jornadas.length === 0
                ? "Sin conexión. Conéctate a internet para consultar las jornadas."
                : "No hay jornadas con esos criterios."
            }
          />
        }
        renderItem={({ item }) => (
          <View style={{ marginHorizontal: -16 }}>
            <JornadaCard
              jornada={item}
              estado={estadoParaCard(estadoJornada(item))}
              extra={`${item.cuposOcupados || 0} de ${item.cuposTotales || 0} ${palabraPlural(item.cuposTotales || 0, "cupo", "cupos")} · Gestor: ${
                item.creadoPor ? nombres.get(item.creadoPor) || "desconocido" : "sin asignar"
              }`}
              onPress={() => navigation.navigate("JornadaAdmin", { jornadaId: item.id })}
            />
          </View>
        )}
      />
      <CalendarioRango
        visible={calendario}
        desde={rango.desde}
        hasta={rango.hasta}
        onAplicar={(desde, hasta) => {
          setRango({ desde, hasta });
          setCalendario(false);
        }}
        onCerrar={() => setCalendario(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 0, paddingBottom: 32 },
  cabecera: { gap: 12, marginBottom: 6 },
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
  filaFiltros: { flexDirection: "row", gap: 10, alignItems: "center" },
  fecha: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "50%",
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  fechaActiva: { backgroundColor: colors.primary, borderColor: colors.primary },
  fechaTexto: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, flexShrink: 1 },
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
});
