import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useJornadas } from "../../context/JornadasContext";
import { useJornadaMaestro } from "../../hooks/useJornadasMaestro";
import { useUsuarios } from "../../hooks/useAdmin";
import { auditar } from "../../services/adminService";
import SelectDesplegable from "../../components/SelectDesplegable";
import RelojHora from "../../components/RelojHora";
import { puedeSerResponsable } from "../../utils/roles";
import {
  buscarJornadaIgual,
  crearJornada,
  editarJornada,
  esErrorDeConexion,
  mensajeDeError,
} from "../../services/jornadaAdminService";
import { usaApi } from "../../config/api";
import BannerJornada from "../../components/BannerJornada";
import CalendarioRango from "../../components/CalendarioRango";
import { SkeletonFormularioJornada } from "../../components/Skeleton";
import { colors } from "../../theme/colors";
import { CATEGORIAS, categoriaDeJornada } from "../../utils/categorias";
import { ESPACIOS } from "../../utils/espacios";
import { espaciosOcupados, listaCorta } from "../../utils/espaciosLibres";
import { useOcupadosServidor } from "../../hooks/useEspaciosServidor";
import { permisosJornada } from "../../utils/estadoJornada";
import { esDuracionValida, formatearDuracion } from "../../utils/duracion";
import { aDayjsNegocio, formatearHora } from "../../utils/jornadaFecha";
import {
  DURACION_SUGERIDA,
  ENTIDAD_POR_DEFECTO,
  LIMITES,
  nuevaClaveCreacion,
  validarJornada,
} from "../../utils/jornadaForm";
import { combinarFechaHora, descomponerFecha } from "../../utils/zonaNegocio";

// Duraciones habituales para elegir con un toque (en minutos)
const DURACIONES_RAPIDAS = [30, 60, 90, 120, 180];
const OTRA = "__otra__";

const OPCIONES_DURACION = [
  ...DURACIONES_RAPIDAS.map((min) => ({ valor: String(min), etiqueta: formatearDuracion(min) })),
  { valor: OTRA, etiqueta: "Otra duración…" },
];
const OPCIONES_CATEGORIA = CATEGORIAS.map((c) => ({ valor: c, etiqueta: c }));

function Campo({ etiqueta, error, contador, children }) {
  return (
    <View style={styles.campo}>
      <View style={styles.etiquetaFila}>
        <Text style={styles.etiqueta}>{etiqueta}</Text>
        {!!contador && <Text style={styles.contador}>{contador}</Text>}
      </View>
      {children}
      {!!error && (
        <View style={styles.errorFila} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <Text style={styles.error}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// Tarjeta que agrupa campos relacionados
function Seccion({ icono, titulo, subtitulo, children }) {
  return (
    <View style={styles.seccion}>
      <View style={styles.seccionCabecera}>
        <View style={styles.seccionIcono}>
          <Ionicons name={icono} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.seccionTitulo}>{titulo}</Text>
          {!!subtitulo && <Text style={styles.seccionSubtitulo}>{subtitulo}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

// Campo de texto que resalta al enfocarlo
function Entrada({ error, style, ...props }) {
  const [enfocado, setEnfocado] = useState(false);
  return (
    <TextInput
      style={[styles.input, enfocado && styles.inputEnfocado, !!error && styles.inputError, style]}
      placeholderTextColor={colors.textDisabled}
      onFocus={() => setEnfocado(true)}
      onBlur={() => setEnfocado(false)}
      {...props}
    />
  );
}

// Crear (sin `jornadaId`) o editar una jornada propia. Solo con conexión.
export default function JornadaFormScreen({ navigation, route }) {
  const jornadaId = route.params?.jornadaId;
  const esEdicion = !!jornadaId;

  const { usuario, rol, esAdministrador } = useAuth();
  // El administrador elige el gestor responsable de la jornada (solo él puede listar usuarios)
  const { usuarios } = useUsuarios(esAdministrador);
  const responsables = usuarios.filter((u) => puedeSerResponsable(u.rol));
  const [gestorId, setGestorId] = useState(null);
  const { enLinea } = useConnectivity();
  // Todas las jornadas guardadas en el dispositivo (para marcar los espacios ocupados, FE-01)
  const { jornadasPorId } = useJornadas();
  // Al crear no hay jornada que leer (el hook no escucha nada con `null`)
  const { jornada, cargando, noExiste, propia, ahora } = useJornadaMaestro(
    esEdicion ? jornadaId : null
  );

  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    entidad: ENTIDAD_POR_DEFECTO,
    responsable: usuario?.displayName || "",
    lugar: "",
    dia: "",
    hora: "",
    duracionMin: DURACION_SUGERIDA,
    cuposTotales: "",
    // Por defecto la asistencia por QR se abre los primeros 20 minutos; activado, dura toda la jornada
    asistenciaTodaJornada: false,
    categoria: "",
    bannerUrl: "",
  });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [calendario, setCalendario] = useState(false);
  const [duracionOtra, setDuracionOtra] = useState(false);
  // FE-01: espacios ocupados según el servidor (con todas las jornadas); null = usar el cálculo local
  const franjaInicio = combinarFechaHora(form.dia, form.hora);
  const franjaFin =
    franjaInicio != null && /^\d+$/.test(form.duracionMin) && esDuracionValida(Number(form.duracionMin))
      ? franjaInicio + Number(form.duracionMin) * 60000
      : null;
  const ocupadosServidor = useOcupadosServidor(franjaInicio, franjaFin, jornadaId ?? null);
  const inicializado = useRef(false);
  // Evita jornadas duplicadas al reintentar «Crear» tras un error de conexión:
  //  - claveCreacion: clave de idempotencia del intento; se renueva en cuanto se cambia algo
  //  - falloPorConexion: tras un error de conexión se comprueba, antes de volver a crear, si el
  //    intento anterior sí se había guardado
  const claveCreacion = useRef(null);
  const falloPorConexion = useRef(false);

  // Al editar, el formulario parte de los datos actuales (una sola vez)
  useEffect(() => {
    if (!esEdicion || !jornada || !propia || inicializado.current) return;
    inicializado.current = true;
    const { dia, hora } = descomponerFecha(jornada.fecha);
    setGestorId(jornada.creadoPor || null);
    setForm({
      titulo: jornada.titulo || "",
      descripcion: jornada.descripcion || "",
      entidad: jornada.entidad || ENTIDAD_POR_DEFECTO,
      responsable: jornada.responsable || "",
      lugar: jornada.lugar || "",
      dia,
      hora,
      // Las jornadas anteriores al campo salen con la duración por defecto
      duracionMin: String(jornada.duracionMin ?? DURACION_SUGERIDA),
      cuposTotales: String(jornada.cuposTotales ?? ""),
      asistenciaTodaJornada: jornada.asistenciaTodaJornada === true,
      // Las jornadas anteriores a la categoría salen sin elegir: se pide al guardar
      categoria: categoriaDeJornada(jornada) || "",
      bannerUrl: jornada.bannerUrl || "",
    });
  }, [esEdicion, jornada, propia]);

  const cambiar = (campo, valor) => {
    claveCreacion.current = null;
    falloPorConexion.current = false;
    setForm((f) => ({ ...f, [campo]: valor }));
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  if (esEdicion && cargando) return <SkeletonFormularioJornada />;

  // Defensa en la interfaz; el servidor rechaza igualmente cualquier cambio ajeno
  const permisos = esEdicion && jornada ? permisosJornada({ rol, uid: usuario?.uid, jornada, ahora }) : null;
  if (esEdicion && (noExiste || !jornada || !permisos?.editar)) {
    const motivo = noExiste || !jornada
      ? "La jornada no existe o ya fue eliminada."
      : !propia
      ? "No tienes permiso para editar esta jornada: solo puedes administrar las que creaste."
      : "Esta jornada ya comenzó y no se puede editar.";
    return (
      <View style={styles.centrado}>
        <Ionicons name="lock-closed-outline" size={44} color={colors.textDisabled} />
        <Text style={styles.centradoTexto}>{motivo}</Text>
        <TouchableOpacity style={styles.botonSecundario} onPress={() => navigation.goBack()}>
          <Text style={styles.botonSecundarioTexto}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const guardar = async () => {
    const { errores: nuevosErrores, datos } = validarJornada(form, {
      ahora: Date.now(),
      cuposOcupados: jornada?.cuposOcupados ?? 0,
      // una jornada cancelada puede conservar una fecha pasada; las activas, no
      exigirFutura: !esEdicion || jornada.activa !== false,
    });
    setErrores(nuevosErrores);
    if (!datos) return;

    if (!enLinea) {
      Alert.alert(
        "Sin conexión",
        "Para guardar los cambios necesitas conexión a internet. Tus datos siguen en el formulario."
      );
      return;
    }

    setGuardando(true);
    try {
      // Un gestor siempre actúa a su nombre; el administrador, para el gestor elegido
      const responsable = esAdministrador ? gestorId || usuario.uid : usuario.uid;
      let idJornada = jornadaId;
      if (esEdicion) await editarJornada(jornadaId, datos, esAdministrador ? responsable : undefined);
      else {
        // Tras un error de conexión, ¿el intento anterior sí se guardó? Entonces no se crea otra
        const yaGuardada = falloPorConexion.current ? await buscarJornadaIgual(responsable, datos) : null;
        if (yaGuardada) {
          Alert.alert(
            "Jornada creada",
            "La jornada ya estaba guardada: el intento anterior sí llegó al servidor.",
            [{ text: "Aceptar", onPress: () => navigation.goBack() }]
          );
          return;
        }
        claveCreacion.current = claveCreacion.current || nuevaClaveCreacion();
        idJornada = (await crearJornada(responsable, datos, claveCreacion.current)).id;
      }

      if (esAdministrador) {
        const reasignada = esEdicion && responsable !== jornada.creadoPor;
        auditar(
          { uid: usuario.uid, nombre: usuario.displayName || usuario.email },
          {
            accion: !esEdicion ? "jornada.crear" : reasignada ? "jornada.reasignar" : "jornada.editar",
            entidad: "jornada",
            entidadId: idJornada,
            detalle: `${datos.titulo}${reasignada || !esEdicion ? ` · gestor: ${responsables.find((g) => g.id === responsable)?.nombre || responsable}` : ""}`,
          }
        );
      }
      Alert.alert(
        esEdicion ? "Jornada actualizada" : "Jornada creada",
        esEdicion
          ? "Los cambios se guardaron. Los estudiantes inscritos recibirán el aviso."
          : "La jornada ya está disponible para los estudiantes.",
        [{ text: "Aceptar", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      console.warn("Error al guardar la jornada:", err);
      if (!esEdicion && esErrorDeConexion(err)) falloPorConexion.current = true;
      Alert.alert("No se pudo guardar", mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  // Aviso de cuándo terminará la jornada con la hora y la duración escritas
  const inicioMs = combinarFechaHora(form.dia, form.hora);
  const duracion = Number(form.duracionMin);
  const finMs =
    inicioMs != null && /^\d+$/.test(form.duracionMin) && esDuracionValida(duracion)
      ? inicioMs + duracion * 60000
      : null;
  const textoFin = finMs
    ? `Termina a las ${formatearHora(finMs)}${
        aDayjsNegocio(finMs).format("YYYY-MM-DD") !== form.dia ? " del día siguiente" : ""
      }.`
    : "La jornada aparece «En curso» hasta que termina su duración.";

  // FE-01: espacios que ya tienen una jornada en esa franja. Los calcula el servidor; si no responde
  // (sin conexión o cargando) se calcula con las jornadas guardadas en el dispositivo. Al editar no
  // cuenta la propia jornada.
  const ocupados =
    ocupadosServidor ??
    espaciosOcupados(Array.from(jornadasPorId.values()), inicioMs, finMs, {
      excluirId: jornadaId ?? null,
      ahora: Date.now(),
    });
  const ocupadosElegido = form.lugar ? ocupados.get(form.lugar) : undefined;
  const libres = ESPACIOS.filter((espacio) => !ocupados.has(espacio));

  // «Otra duración»: se escribe a mano cuando el valor no está entre las opciones
  const duracionPersonalizada =
    duracionOtra || (form.duracionMin !== "" && !DURACIONES_RAPIDAS.map(String).includes(form.duracionMin));

  const etiquetaDia = form.dia
    ? dayjs(form.dia).locale("es").format("dddd D [de] MMMM [de] YYYY")
    : "Elegir fecha";

  const ajustarCupos = (delta) => {
    const actual = parseInt(form.cuposTotales, 10) || 0;
    cambiar("cuposTotales", String(Math.max(1, Math.min(LIMITES.cuposMaximos, actual + delta))));
  };

  return (
    <KeyboardAvoidingView
      style={styles.contenedor}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <View style={styles.introIcono}>
            <Ionicons name={esEdicion ? "create" : "add-circle"} size={26} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitulo}>{esEdicion ? "Editar jornada" : "Nueva jornada"}</Text>
            <Text style={styles.introTexto}>
              {esEdicion
                ? "Cambia lo que necesites. Los inscritos serán avisados."
                : "Completa los datos para publicarla y abrir las inscripciones."}
            </Text>
          </View>
        </View>

        <Seccion icono="document-text-outline" titulo="Información" subtitulo="Qué es y de qué trata">
          <Campo etiqueta="Título" error={errores.titulo} contador={`${form.titulo.length}/${LIMITES.titulo}`}>
            <Entrada
              error={errores.titulo}
              value={form.titulo}
              onChangeText={(v) => cambiar("titulo", v)}
              maxLength={LIMITES.titulo}
              placeholder="Ej. Jornada de salud"
              accessibilityLabel="Título"
            />
          </Campo>

          <Campo
            etiqueta="Descripción"
            error={errores.descripcion}
            contador={`${form.descripcion.length}/${LIMITES.descripcion}`}
          >
            <Entrada
              error={errores.descripcion}
              style={styles.inputMultilinea}
              value={form.descripcion}
              onChangeText={(v) => cambiar("descripcion", v)}
              maxLength={LIMITES.descripcion}
              multiline
              textAlignVertical="top"
              placeholder="¿De qué trata la jornada?"
              accessibilityLabel="Descripción"
            />
          </Campo>

          <Campo etiqueta="Categoría" error={errores.categoria}>
            <SelectDesplegable
              titulo="Categoría"
              icono="pricetag-outline"
              placeholder="Elegir categoría"
              valor={form.categoria}
              opciones={OPCIONES_CATEGORIA}
              onChange={(v) => cambiar("categoria", v)}
              error={!!errores.categoria}
            />
          </Campo>
        </Seccion>

        <Seccion icono="business-outline" titulo="Organización" subtitulo="Quién la organiza">
          <Campo etiqueta="Entidad organizadora" error={errores.entidad}>
            <Entrada
              error={errores.entidad}
              value={form.entidad}
              onChangeText={(v) => cambiar("entidad", v)}
              maxLength={LIMITES.entidad}
              accessibilityLabel="Entidad organizadora"
            />
          </Campo>

          <Campo etiqueta="Responsables" error={errores.responsable}>
            <Entrada
              error={errores.responsable}
              value={form.responsable}
              onChangeText={(v) => cambiar("responsable", v)}
              maxLength={LIMITES.responsable}
              placeholder="Ej. Ana Pérez, Luis Gómez"
              accessibilityLabel="Responsables"
            />
            <Text style={styles.ayuda}>
              Si hay más de un responsable, sepáralos con comas. Ejemplo: Ana Pérez, Luis Gómez.
            </Text>
          </Campo>

          {esAdministrador && (
            <Campo etiqueta="Gestor responsable">
              <SelectDesplegable
                titulo="Gestor responsable"
                icono="person-outline"
                placeholder="Elegir gestor"
                valor={gestorId || usuario.uid}
                opciones={responsables.map((g) => ({ valor: g.id, etiqueta: g.nombre || g.email }))}
                onChange={(id) => {
                  claveCreacion.current = null;
                  falloPorConexion.current = false;
                  setGestorId(id);
                }}
              />
            </Campo>
          )}
        </Seccion>

        <Seccion icono="calendar-outline" titulo="Lugar y horario" subtitulo="Dónde y cuándo ocurre">
          <Campo etiqueta="Fecha" error={errores.dia}>
            <TouchableOpacity
              style={[styles.input, styles.selectorFecha, errores.dia && styles.inputError]}
              onPress={() => setCalendario(true)}
              accessibilityRole="button"
              accessibilityLabel="Elegir fecha"
            >
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={[styles.selectorFechaTexto, !form.dia && { color: colors.textDisabled }]}>
                {etiquetaDia}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </Campo>

          <View style={styles.dosColumnas}>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Hora de inicio" error={errores.hora}>
                <RelojHora valor={form.hora} onChange={(v) => cambiar("hora", v)} error={!!errores.hora} />
              </Campo>
            </View>
            <View style={{ flex: 1 }}>
              <Campo etiqueta="Duración" error={errores.duracionMin}>
                <SelectDesplegable
                  titulo="Duración"
                  icono="hourglass-outline"
                  placeholder="Elegir duración"
                  valor={duracionPersonalizada ? OTRA : form.duracionMin}
                  textoValor={form.duracionMin ? `${form.duracionMin} min` : undefined}
                  opciones={OPCIONES_DURACION}
                  onChange={(v) => {
                    if (v === OTRA) {
                      setDuracionOtra(true);
                      if (DURACIONES_RAPIDAS.map(String).includes(form.duracionMin)) cambiar("duracionMin", "");
                    } else {
                      setDuracionOtra(false);
                      cambiar("duracionMin", v);
                    }
                  }}
                  error={!!errores.duracionMin}
                />
              </Campo>
            </View>
          </View>

          {duracionPersonalizada && (
            <Entrada
              error={errores.duracionMin}
              style={styles.inputOtra}
              value={form.duracionMin}
              onChangeText={(v) => cambiar("duracionMin", v.replace(/[^0-9]/g, ""))}
              maxLength={4}
              keyboardType="number-pad"
              placeholder="Minutos (ej. 75)"
              accessibilityLabel="Duración en minutos"
            />
          )}

          <View style={styles.resumenHora}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={styles.resumenHoraTexto}>{textoFin}</Text>
          </View>

          <View style={styles.filaAsistencia}>
            <View style={styles.asistenciaTextos}>
              <Text style={styles.asistenciaTitulo}>Asistencia durante toda la jornada</Text>
              <Text style={styles.ayuda}>
                {form.asistenciaTodaJornada
                  ? "Los estudiantes podrán registrar su asistencia con el QR en cualquier momento mientras dure la jornada."
                  : "Por defecto, los estudiantes pueden registrar su asistencia con el QR durante los primeros 20 minutos."}
              </Text>
            </View>
            <Switch
              value={form.asistenciaTodaJornada}
              onValueChange={(valor) => cambiar("asistenciaTodaJornada", valor)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={form.asistenciaTodaJornada ? colors.primary : colors.surface}
              accessibilityLabel="Permitir registrar la asistencia durante toda la jornada"
            />
          </View>

          <Campo etiqueta="Espacio" error={errores.lugar}>
            <SelectDesplegable
              titulo="Espacio"
              icono="location-outline"
              placeholder="Elegir espacio"
              valor={form.lugar}
              opciones={ESPACIOS.map((espacio) => ({
                valor: espacio,
                etiqueta: espacio,
                // FE-01: ya tiene una jornada a la fecha y hora elegidas (solo informa; se puede elegir)
                aviso: ocupados.has(espacio) ? "Ocupado a esa hora" : undefined,
              }))}
              onChange={(v) => cambiar("lugar", v)}
              error={!!errores.lugar}
            />
            {ocupados.size > 0 && !ocupadosElegido && (
              <Text style={styles.ayuda}>
                Los espacios con el aviso ya tienen una jornada a esa fecha y hora. Puedes elegirlos igualmente.
              </Text>
            )}
            {!!ocupadosElegido && (
              <View style={styles.avisoEspacio} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.avisoEspacioTexto}>
                  {`${form.lugar} ya tiene «${ocupadosElegido[0].titulo}»${
                    ocupadosElegido.length > 1 ? ` y ${ocupadosElegido.length - 1} más` : ""
                  } a esa hora. ${
                    libres.length > 0
                      ? `Espacios libres: ${listaCorta(libres)}.`
                      : "No hay espacios libres a esa hora."
                  }`}
                </Text>
              </View>
            )}
          </Campo>
        </Seccion>

        <Seccion icono="people-outline" titulo="Cupos y difusión" subtitulo="Cuántas personas y cómo se ve">
          <Campo etiqueta="Cupos" error={errores.cuposTotales}>
            <View style={styles.cupos}>
              <TouchableOpacity
                style={styles.cuposBoton}
                onPress={() => ajustarCupos(-5)}
                accessibilityRole="button"
                accessibilityLabel="Quitar 5 cupos"
              >
                <Ionicons name="remove" size={22} color={colors.primary} />
              </TouchableOpacity>
              <Entrada
                error={errores.cuposTotales}
                style={styles.cuposInput}
                value={form.cuposTotales}
                onChangeText={(v) => cambiar("cuposTotales", v.replace(/[^0-9]/g, ""))}
                maxLength={4}
                keyboardType="number-pad"
                placeholder="40"
                textAlign="center"
                accessibilityLabel="Cupos"
              />
              <TouchableOpacity
                style={styles.cuposBoton}
                onPress={() => ajustarCupos(5)}
                accessibilityRole="button"
                accessibilityLabel="Agregar 5 cupos"
              >
                <Ionicons name="add" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </Campo>

          {/* Solo con la API: es quien guarda el campo (las reglas del modo local no lo admiten) */}
          {usaApi("jornadas") && (
            <Campo etiqueta="Banner (opcional)" error={errores.bannerUrl}>
              <Entrada
                error={errores.bannerUrl}
                value={form.bannerUrl}
                onChangeText={(v) => cambiar("bannerUrl", v)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://ejemplo.com/banner.jpg"
                accessibilityLabel="Enlace del banner"
              />
              <Text style={styles.ayuda}>
                Enlace https de una imagen. Déjalo vacío si la jornada no lleva banner.
              </Text>
              <BannerJornada
                url={form.bannerUrl.trim()}
                altura={110}
                mensajeError="No se pudo cargar la imagen de este enlace."
                style={{ marginTop: 8 }}
              />
            </Campo>
          )}
        </Seccion>
      </ScrollView>

      {/* Barra de acción fija: el botón siempre a la mano */}
      <View style={styles.barra}>
        <TouchableOpacity
          style={[styles.boton, guardando && styles.botonDeshabilitado]}
          onPress={guardar}
          disabled={guardando}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={esEdicion ? "Guardar cambios" : "Crear jornada"}
        >
          {guardando ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name={esEdicion ? "save-outline" : "checkmark-circle-outline"} size={20} color={colors.white} />
              <Text style={styles.botonTexto}>{esEdicion ? "Guardar cambios" : "Crear jornada"}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <CalendarioRango
        visible={calendario}
        desde={form.dia || null}
        hasta={form.dia || null}
        unDia
        titulo="Elegir la fecha de la jornada"
        onAplicar={(dia) => {
          cambiar("dia", dia);
          setCalendario(false);
        }}
        onCerrar={() => setCalendario(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 14, paddingBottom: 24 },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 16,
  },
  introIcono: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitulo: { fontSize: 20, fontWeight: "800", color: colors.white },
  introTexto: { fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.88)", marginTop: 2 },
  seccion: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  seccionCabecera: { flexDirection: "row", alignItems: "center", gap: 12 },
  seccionIcono: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  seccionTitulo: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  seccionSubtitulo: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  campo: { gap: 6 },
  etiquetaFila: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  etiqueta: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
  contador: { fontSize: 11, color: colors.textDisabled },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputEnfocado: { borderColor: colors.primary, backgroundColor: "#FBFEFC" },
  inputMultilinea: { minHeight: 110, paddingTop: 12 },
  inputError: { borderColor: colors.error },
  errorFila: { flexDirection: "row", alignItems: "center", gap: 4 },
  error: { color: colors.error, fontSize: 12, flex: 1 },
  inputOtra: { marginTop: -4 },
  ayuda: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  dosColumnas: { flexDirection: "row", gap: 12 },
  filaAsistencia: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
  },
  asistenciaTextos: { flex: 1, gap: 2 },
  asistenciaTitulo: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
  resumenHora: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primaryPale,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: -4,
  },
  resumenHoraTexto: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textPrimary, fontWeight: "600" },
  avisoEspacio: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FFF4DE",
    borderWidth: 1,
    borderColor: colors.warning,
  },
  avisoEspacioTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textPrimary },
  selectorFecha: { flexDirection: "row", alignItems: "center", gap: 10 },
  selectorFechaTexto: { flex: 1, fontSize: 15, color: colors.textPrimary, textTransform: "capitalize" },
  cupos: { flexDirection: "row", alignItems: "center", gap: 10 },
  cuposBoton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  cuposInput: { flex: 1, fontSize: 18, fontWeight: "800" },
  barra: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  boton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    minHeight: 52,
  },
  botonDeshabilitado: { opacity: 0.6 },
  botonTexto: { color: colors.white, fontSize: 16, fontWeight: "800" },
  centrado: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 14,
    backgroundColor: colors.background,
  },
  centradoTexto: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  botonSecundario: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  botonSecundarioTexto: { color: colors.primary, fontSize: 15, fontWeight: "700" },
});
