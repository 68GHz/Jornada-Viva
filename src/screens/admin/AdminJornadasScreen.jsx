import React, { useMemo, useState } from "react";
import { FlatList, ScrollView, Text, TouchableOpacity, View } from "react-native";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useTodasJornadas, useUsuarios } from "../../hooks/useAdmin";
import JornadaCard from "../../components/JornadaCard";
import CalendarioRango from "../../components/CalendarioRango";
import LoadingSpinner from "../../components/LoadingSpinner";
import { estadoParaCard } from "../../components/EstadoJornadaChip";
import { Boton, Chip, Entrada, Vacio, estilos } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { ESTADOS_JORNADA, ETIQUETA_ESTADO, estadoJornada, ordenarParaMaestro } from "../../utils/estadoJornada";
import { puedeSerResponsable } from "../../utils/roles";
import { filtrarJornadas } from "../../utils/usuariosAdmin";
import { descomponerFecha } from "../../utils/zonaNegocio";

const etiquetaRango = (desde, hasta) => {
  if (!desde) return "Rango de fechas";
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
  const lista = useMemo(
    () =>
      ordenarParaMaestro(
        filtrarJornadas(jornadas, { texto, estado, gestor, ...rango }, Date.now(), (ms) => descomponerFecha(ms).dia)
      ),
    [jornadas, texto, estado, gestor, rango]
  );

  if (cargando) return <LoadingSpinner mensaje="Cargando jornadas..." />;

  return (
    <>
      <FlatList
        style={estilos.pantalla}
        contentContainerStyle={estilos.contenido}
        data={lista}
        keyExtractor={(j) => j.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Boton texto="Crear jornada" onPress={() => navigation.navigate("JornadaForm")} />
            <Entrada value={texto} onChangeText={setTexto} placeholder="Buscar por título o espacio" accessibilityLabel="Buscar jornadas" />
            <View style={estilos.fila}>
              <Chip etiqueta="Todos los estados" activo={estado === "todos"} onPress={() => setEstado("todos")} />
              {Object.values(ESTADOS_JORNADA).map((e) => (
                <Chip key={e} etiqueta={ETIQUETA_ESTADO[e]} activo={estado === e} onPress={() => setEstado(e)} />
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip etiqueta="Todos los gestores" activo={gestor === "todos"} onPress={() => setGestor("todos")} />
              <Chip etiqueta="Sin gestor" activo={gestor === "sin-gestor"} onPress={() => setGestor("sin-gestor")} />
              {responsables.map((g) => (
                <Chip key={g.id} etiqueta={g.nombre || g.email} activo={gestor === g.id} onPress={() => setGestor(g.id)} />
              ))}
            </ScrollView>
            <View style={estilos.fila}>
              <Chip etiqueta={etiquetaRango(rango.desde, rango.hasta)} activo={!!rango.desde} onPress={() => setCalendario(true)} />
              {!!rango.desde && <Chip etiqueta="Quitar fechas" onPress={() => setRango({ desde: null, hasta: null })} />}
            </View>
            <Text style={estilos.texto}>
              {lista.length} de {jornadas.length} jornadas
            </Text>
            {!!error && <Text style={{ color: colors.error }}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <Vacio
            texto={
              !enLinea && jornadas.length === 0
                ? "Sin conexión. Conéctate a internet para consultar las jornadas."
                : "No hay jornadas con esos criterios."
            }
          />
        }
        renderItem={({ item }) => (
          <View>
            <JornadaCard
              jornada={item}
              estado={estadoParaCard(estadoJornada(item))}
              extra={`${item.cuposOcupados || 0} de ${item.cuposTotales || 0} cupos · Gestor: ${
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
