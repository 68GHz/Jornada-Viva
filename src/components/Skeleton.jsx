import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { colors } from "../theme/colors";

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loading — REGLA DEL PROYECTO (ver AGENTS.md)
// Mientras una pantalla carga su contenido se muestra un esqueleto con la forma EXACTA de lo que esa
// pantalla va a mostrar: cada pantalla tiene su propio skeleton (`Skeleton<NombreDeLaPantalla>`), con
// los mismos bloques, proporciones y orden que la pantalla real. Nunca un spinner a pantalla completa
// ni el texto «Cargando…». Si se rediseña una pantalla, se rediseña también su skeleton.
// Todas las piezas comparten UNA sola animación (un pulso suave) y respetan «reducir movimiento».
// ─────────────────────────────────────────────────────────────────────────────

// ---- Animación compartida: un solo pulso para todos los bloques visibles ----
const pulso = new Animated.Value(0);
let suscriptores = 0;
let bucle = null;

function usarPulso() {
  suscriptores += 1;
  if (suscriptores === 1) {
    bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    bucle.start();
  }
  return () => {
    suscriptores -= 1;
    if (suscriptores === 0) {
      bucle?.stop();
      pulso.setValue(0);
    }
  };
}

const opacidad = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

// Bloque básico. `ancho` admite número o porcentaje («60%»).
export function Skeleton({ ancho = "100%", alto = 14, radio = 8, style }) {
  const [reducir, setReducir] = useState(false);
  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => vivo && setReducir(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducir);
    return () => {
      vivo = false;
      sub?.remove?.();
    };
  }, []);
  useEffect(() => (reducir ? undefined : usarPulso()), [reducir]);

  return (
    <Animated.View
      style={[
        { width: ancho, height: alto, borderRadius: radio, backgroundColor: colors.border },
        { opacity: reducir ? 0.75 : opacidad },
        style,
      ]}
    />
  );
}

// Contenedor de una pantalla en carga: un solo elemento accesible («Cargando …») que oculta los bloques.
// `enLista`: para usarlo dentro de una lista o sección que ya está en pantalla (no ocupa toda la pantalla).
export function Cargando({ etiqueta = "Cargando", children, style, enLista = false }) {
  return (
    <View
      style={[enLista ? null : s.pantalla, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={etiqueta}
      accessibilityLiveRegion="polite"
      importantForAccessibility="yes"
    >
      <View style={enLista ? null : s.relleno} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>
    </View>
  );
}

// ─────────────────────────── Piezas que imitan componentes reales ───────────────────────────

const Fila = ({ children, gap = 12, style }) => <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;

// JornadaCard. `pie`: "cupos" (barra + cupos restantes) o "estado" (chip de estado). `extra`: línea de personas.
function JornadaCardSk({ pie = "cupos", extra = false, categoria = true }) {
  return (
    <View style={s.tarjeta}>
      <View style={s.cuerpoTarjeta}>
        <Skeleton ancho={54} alto={62} radio={14} />
        <View style={s.col}>
          {categoria && <Skeleton ancho={96} alto={20} radio={10} />}
          <Skeleton ancho="88%" alto={16} />
          <Skeleton ancho="42%" alto={12} />
          <Fila gap={6}>
            <Skeleton ancho={64} alto={12} />
            <Skeleton ancho="38%" alto={12} />
          </Fila>
          {extra && <Skeleton ancho="78%" alto={12} />}
        </View>
      </View>
      <View style={s.pieTarjeta}>
        {pie === "cupos" ? (
          <>
            <Skeleton alto={6} radio={3} style={{ flex: 1 }} />
            <Skeleton ancho={58} alto={12} />
          </>
        ) : (
          <Skeleton ancho={96} alto={24} radio={12} style={{ flex: 1, maxWidth: 96 }} />
        )}
        <Skeleton ancho={18} alto={18} radio={9} style={{ marginLeft: pie === "cupos" ? 0 : "auto" }} />
      </View>
    </View>
  );
}

// PrestamoItem. `quien`: línea «Prestado a…» (gestor). `boton`: botón «Marcar devuelto» (gestor).
function PrestamoCardSk({ quien = false, boton = false }) {
  return (
    <View style={[s.tarjeta, { padding: 14, gap: 12 }]}>
      <Fila>
        <Skeleton ancho={46} alto={46} radio={14} />
        <View style={[s.col, { gap: 7 }]}>
          <Skeleton ancho="72%" alto={15} />
          <Skeleton ancho="46%" alto={12} />
        </View>
        <Skeleton ancho={66} alto={22} radio={12} />
      </Fila>
      <Skeleton alto={40} radio={12} />
      {quien && (
        <Fila gap={6}>
          <Skeleton ancho={14} alto={14} radio={7} />
          <Skeleton ancho="55%" alto={12} />
        </Fila>
      )}
      {boton && <Skeleton alto={46} radio={10} />}
    </View>
  );
}

// NotificationItem
function AvisoCardSk() {
  return (
    <View style={[s.tarjeta, { marginHorizontal: 0, marginVertical: 0 }]}>
      <View style={[s.cuerpoTarjeta, { gap: 14 }]}>
        <Skeleton ancho={46} alto={46} radio={14} />
        <View style={s.col}>
          <Fila style={{ justifyContent: "space-between" }}>
            <Skeleton ancho={82} alto={18} radio={9} />
            <Skeleton ancho={52} alto={10} />
          </Fila>
          <Skeleton ancho="78%" alto={15} />
          <Skeleton ancho="96%" alto={12} />
          <Skeleton ancho="62%" alto={12} />
        </View>
      </View>
      <View style={[s.pieTarjeta, { justifyContent: "flex-end", gap: 18 }]}>
        <Skeleton ancho={120} alto={14} />
        <Skeleton ancho={64} alto={14} />
      </View>
    </View>
  );
}

// SaludoHeader (bloque del saludo), con etiqueta de rol opcional
function SaludoSk({ rol = false }) {
  return (
    <View style={s.saludo}>
      <Fila gap={8}>
        <Skeleton ancho={104} alto={13} />
        {rol && <Skeleton ancho={64} alto={18} radio={9} />}
      </Fila>
      <Skeleton ancho={170} alto={30} radio={10} style={{ marginTop: 8 }} />
      <Skeleton ancho="78%" alto={13} style={{ marginTop: 12 }} />
      <Skeleton ancho="52%" alto={13} style={{ marginTop: 6 }} />
    </View>
  );
}

// Encabezado de sección: título a la izquierda y conteo a la derecha
const SeccionSk = ({ titulo = 170, conteo = 64 }) => (
  <Fila style={s.seccion}>
    <Skeleton ancho={titulo} alto={20} />
    <Skeleton ancho={conteo} alto={13} />
  </Fila>
);

// FiltrosJornadas: buscador + botón de filtros
const FiltrosJornadasSk = () => (
  <Fila gap={10} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
    <Skeleton alto={46} radio={14} style={{ flex: 1 }} />
    <Skeleton ancho={46} alto={46} radio={14} />
  </Fila>
);

// Campo de formulario: etiqueta + campo
const CampoSk = ({ etiqueta = 110, alto = 48 }) => (
  <View style={{ gap: 8 }}>
    <Skeleton ancho={etiqueta} alto={12} />
    <Skeleton alto={alto} radio={12} />
  </View>
);

// Tarjeta de AdminUi (radio 12)
const TarjetaAdminSk = ({ children, style }) => <View style={[s.tarjetaAdmin, style]}>{children}</View>;

// Fila de chips de AdminUi
const ChipsSk = ({ anchos }) => (
  <Fila gap={8} style={{ flexWrap: "wrap" }}>
    {anchos.map((a, i) => (
      <Skeleton key={i} ancho={a} alto={34} radio={17} />
    ))}
  </Fila>
);

// ─────────────────────────── Un skeleton por pantalla ───────────────────────────

// ESTUDIANTE · Inicio — solo las cards: el saludo, el título y los filtros ya están en pantalla
export function SkeletonInicioEstudiante() {
  return (
    <Cargando etiqueta="Buscando jornadas disponibles" enLista>
      {[0, 1, 2].map((i) => (
        <JornadaCardSk key={i} pie="cupos" />
      ))}
    </Cargando>
  );
}

// ESTUDIANTE · Mis jornadas — pestañas Inscritas/Asistidas, filtros y cards con su distintivo
export function SkeletonMisJornadas() {
  return (
    <Cargando etiqueta="Cargando tus jornadas">
      <Fila gap={8} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Skeleton alto={42} radio={21} style={{ flex: 1 }} />
        <Skeleton alto={42} radio={21} style={{ flex: 1 }} />
      </Fila>
      <FiltrosJornadasSk />
      {[0, 1, 2].map((i) => (
        <JornadaCardSk key={i} pie="estado" />
      ))}
    </Cargando>
  );
}

// ESTUDIANTE · Lista de jornadas disponibles (pantalla independiente) — filtros, conteo y cards
export function SkeletonJornadasDisponibles() {
  return (
    <Cargando etiqueta="Buscando jornadas disponibles">
      <FiltrosJornadasSk />
      <Skeleton ancho={120} alto={13} style={{ marginHorizontal: 16, marginBottom: 4 }} />
      {[0, 1, 2].map((i) => (
        <JornadaCardSk key={i} pie="cupos" />
      ))}
    </Cargando>
  );
}

// ESTUDIANTE · Mis préstamos — cards de objeto prestado
export function SkeletonMisPrestamos() {
  return (
    <Cargando etiqueta="Cargando tus préstamos">
      <View style={{ paddingTop: 8 }}>
        {[0, 1, 2].map((i) => (
          <PrestamoCardSk key={i} />
        ))}
      </View>
    </Cargando>
  );
}

// ESTUDIANTE · Avisos — barra con el conteo y «Marcar todas», y las notificaciones
export function SkeletonAvisos() {
  return (
    <Cargando etiqueta="Cargando notificaciones">
      <Fila style={{ justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
        <Skeleton ancho={110} alto={13} />
        <Skeleton ancho={170} alto={30} radio={15} />
      </Fila>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <AvisoCardSk key={i} />
        ))}
      </View>
    </Cargando>
  );
}

// ESTUDIANTE · Cámara — verificación de permisos para escanear el QR
export function SkeletonCamara() {
  return (
    <Cargando etiqueta="Verificando permisos de cámara">
      <View style={{ padding: 20, gap: 16, alignItems: "center" }}>
        <Skeleton alto={320} radio={20} />
        <Skeleton ancho="62%" alto={16} />
        <Skeleton ancho="44%" alto={12} />
      </View>
    </Cargando>
  );
}

// GESTOR · Inicio — saludo con rol, título con conteo, chips de estado con contador y cards con cupos
export function SkeletonInicioGestor() {
  return (
    <Cargando etiqueta="Cargando tus jornadas">
      <SaludoSk rol />
      <SeccionSk titulo={190} />
      <Fila gap={8} style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        {[88, 98, 104, 96].map((a, i) => (
          <Skeleton key={i} ancho={a} alto={40} radio={20} />
        ))}
      </Fila>
      {[0, 1].map((i) => (
        <JornadaCardSk key={i} pie="estado" extra />
      ))}
    </Cargando>
  );
}

// GESTOR · Préstamos — botón registrar, filtros Activos/Todos y cards con «Prestado a» y «Marcar devuelto»
export function SkeletonPrestamosGestor() {
  return (
    <Cargando etiqueta="Cargando los préstamos">
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton alto={48} radio={10} />
        <Fila gap={8}>
          <Skeleton ancho={104} alto={34} radio={17} />
          <Skeleton ancho={88} alto={34} radio={17} />
        </Fila>
      </View>
      {[0, 1].map((i) => (
        <PrestamoCardSk key={i} quien boton />
      ))}
    </Cargando>
  );
}

// GESTOR/ADMIN · Administrar jornada — estado, título, datos, acciones e inscritos
export function SkeletonAdministrarJornada() {
  return (
    <Cargando etiqueta="Cargando jornada">
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 8 }}>
          <Skeleton ancho={96} alto={26} radio={13} />
          <Skeleton ancho="82%" alto={24} />
          <Skeleton ancho="40%" alto={14} />
        </View>
        <TarjetaAdminSk style={{ gap: 14 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Fila key={i}>
              <Skeleton ancho={22} alto={22} radio={11} />
              <View style={[s.col, { gap: 6 }]}>
                <Skeleton ancho="24%" alto={10} />
                <Skeleton ancho={i === 0 ? "70%" : "48%"} alto={14} />
              </View>
            </Fila>
          ))}
          <Skeleton alto={12} />
          <Skeleton ancho="80%" alto={12} />
        </TarjetaAdminSk>
        <Skeleton alto={50} radio={12} />
        <Skeleton alto={50} radio={12} />
        <Skeleton alto={50} radio={12} />
        <TarjetaAdminSk style={{ gap: 12 }}>
          <Fila style={{ justifyContent: "space-between" }}>
            <Skeleton ancho={170} alto={18} />
            <Skeleton ancho={22} alto={22} radio={11} />
          </Fila>
          <SkeletonInscritosFilas n={3} />
        </TarjetaAdminSk>
      </View>
    </Cargando>
  );
}

// Filas de inscritos: número, nombre/correo/fecha y botón de asistencia
function SkeletonInscritosFilas({ n = 3 }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Fila key={i} gap={10} style={s.inscrito}>
          <Skeleton ancho={20} alto={16} />
          <View style={[s.col, { gap: 6 }]}>
            <Skeleton ancho="56%" alto={14} />
            <Skeleton ancho="72%" alto={11} />
            <Skeleton ancho="64%" alto={11} />
          </View>
          <Skeleton ancho={76} alto={34} radio={10} />
        </Fila>
      ))}
    </>
  );
}

// GESTOR/ADMIN · Administrar jornada — solo la lista de inscritos (la jornada ya está en pantalla)
export function SkeletonInscritos() {
  return (
    <Cargando etiqueta="Cargando inscritos" enLista>
      <SkeletonInscritosFilas n={3} />
    </Cargando>
  );
}

// GESTOR/ADMIN · Crear o editar jornada — encabezado verde, cuatro secciones con sus campos y barra con el botón
export function SkeletonFormularioJornada() {
  const seccion = (campos) => (
    <View style={[s.panel, { gap: 16, borderRadius: 20 }]}>
      <Fila>
        <Skeleton ancho={38} alto={38} radio={12} />
        <View style={[s.col, { gap: 6 }]}>
          <Skeleton ancho="40%" alto={16} />
          <Skeleton ancho="58%" alto={11} />
        </View>
      </Fila>
      {campos}
    </View>
  );
  return (
    <Cargando etiqueta="Cargando jornada">
      <View style={{ flex: 1, padding: 16, gap: 14 }}>
        <Skeleton alto={80} radio={20} />
        {seccion(
          <>
            <CampoSk etiqueta={52} />
            <CampoSk etiqueta={84} alto={110} />
            <CampoSk etiqueta={70} />
          </>
        )}
        {seccion(
          <>
            <CampoSk etiqueta={130} />
            <CampoSk etiqueta={88} />
          </>
        )}
        {seccion(
          <>
            <CampoSk etiqueta={44} />
            <Fila gap={12} style={{ alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <CampoSk etiqueta={80} />
              </View>
              <View style={{ flex: 1 }}>
                <CampoSk etiqueta={64} />
              </View>
            </Fila>
          </>
        )}
      </View>
      <View style={s.barraSk}>
        <Skeleton alto={52} radio={14} />
      </View>
    </Cargando>
  );
}

// ADMIN · Panel — saludo, tarjeta de usuarios (total, barra por rol, leyenda), de jornadas y mosaicos de estado
export function SkeletonPanelAdmin() {
  return (
    <Cargando etiqueta="Cargando el panel">
      <SaludoSk rol />
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton ancho={96} alto={20} />
        <View style={s.panel}>
          <Fila gap={8} style={{ alignItems: "flex-end" }}>
            <Skeleton ancho={70} alto={40} radio={10} />
            <Skeleton ancho={140} alto={14} />
          </Fila>
          <Skeleton alto={10} radio={5} />
          {[0, 1, 2].map((i) => (
            <Fila key={i} gap={10}>
              <Skeleton ancho={10} alto={10} radio={5} />
              <Skeleton ancho={i === 2 ? "38%" : "28%"} alto={14} />
              <Skeleton ancho={26} alto={14} style={{ marginLeft: "auto" }} />
            </Fila>
          ))}
        </View>
        <Skeleton ancho={80} alto={20} style={{ marginTop: 8 }} />
        <View style={s.panel}>
          <Fila gap={8} style={{ alignItems: "flex-end" }}>
            <Skeleton ancho={70} alto={40} radio={10} />
            <Skeleton ancho={120} alto={14} />
          </Fila>
          <Fila style={{ justifyContent: "space-between" }}>
            <Skeleton ancho={130} alto={14} />
            <Skeleton ancho={40} alto={18} />
          </Fila>
          <Skeleton alto={10} radio={5} />
        </View>
        <View style={s.mosaicos}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={s.mosaico}>
              <Skeleton ancho={36} alto={36} radio={12} />
              <Skeleton ancho={40} alto={26} radio={8} />
              <Skeleton ancho="60%" alto={13} />
            </View>
          ))}
        </View>
      </View>
    </Cargando>
  );
}

// ADMIN · Usuarios — botón crear, buscador, chips de rol y de estado, conteo y tarjetas de cuenta
export function SkeletonUsuarios() {
  return (
    <Cargando etiqueta="Cargando usuarios">
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton alto={48} radio={10} />
        <Skeleton alto={48} radio={10} />
        <ChipsSk anchos={[112, 72, 70, 118]} />
        <ChipsSk anchos={[124, 70, 76]} />
        <Skeleton ancho={90} alto={14} />
        {[0, 1, 2, 3, 4].map((i) => (
          <TarjetaAdminSk key={i}>
            <Skeleton ancho="52%" alto={15} />
            <Skeleton ancho="70%" alto={13} />
            <Skeleton ancho={i % 2 ? 84 : 56} alto={12} />
          </TarjetaAdminSk>
        ))}
      </View>
    </Cargando>
  );
}

// ADMIN · Detalle de usuario — datos de la cuenta, nombre, rol, botones (y jornadas si es gestor)
export function SkeletonDetalleUsuario() {
  return (
    <Cargando etiqueta="Cargando usuario">
      <View style={{ padding: 16, gap: 14 }}>
        <TarjetaAdminSk>
          <Skeleton ancho="58%" alto={22} />
          <Skeleton ancho="72%" alto={13} />
          <Skeleton ancho="52%" alto={13} />
          <Skeleton ancho="44%" alto={13} />
          <Skeleton ancho="64%" alto={10} />
        </TarjetaAdminSk>
        <CampoSk etiqueta={60} />
        <View style={{ gap: 8 }}>
          <Skeleton ancho={110} alto={12} />
          <ChipsSk anchos={[80, 76, 112]} />
        </View>
        <Skeleton alto={48} radio={10} />
        <Skeleton alto={48} radio={10} />
      </View>
    </Cargando>
  );
}

// ADMIN · Jornadas — crear, buscador, tres filas de filtros, conteo y cards con gestor asignado
export function SkeletonJornadasAdmin() {
  return (
    <Cargando etiqueta="Cargando jornadas">
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton alto={48} radio={10} />
        <Skeleton alto={48} radio={10} />
        <ChipsSk anchos={[128, 70, 86, 96, 92]} />
        <Fila gap={8}>
          {[132, 100, 120].map((a, i) => (
            <Skeleton key={i} ancho={a} alto={34} radio={17} />
          ))}
        </Fila>
        <Skeleton ancho={170} alto={34} radio={17} />
        <Skeleton ancho={110} alto={14} />
      </View>
      {[0, 1].map((i) => (
        <JornadaCardSk key={i} pie="estado" extra />
      ))}
    </Cargando>
  );
}

// ADMIN · Auditoría — leyenda y registros (acción, detalle, quién y cuándo) separados por línea
export function SkeletonAuditoria() {
  return (
    <Cargando etiqueta="Cargando auditoría">
      <View style={{ padding: 16 }}>
        <Skeleton ancho="62%" alto={14} style={{ marginBottom: 16 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[s.registro, i > 0 && s.registroSep]}>
            <Skeleton ancho={i % 2 ? "46%" : "38%"} alto={15} />
            <Skeleton ancho="70%" alto={13} />
            <Skeleton ancho="58%" alto={12} />
          </View>
        ))}
      </View>
    </Cargando>
  );
}

// ADMIN · Estadísticas y reportes — selector, cifras, medidor, columnas por mes, barra de estados y rankings
export function SkeletonReportes() {
  const barras = (anchos) =>
    anchos.map((a, i) => (
      <View key={i} style={{ gap: 5 }}>
        <Skeleton ancho={`${28 + ((i * 11) % 24)}%`} alto={12} />
        <Fila gap={8}>
          <Skeleton ancho={`${a}%`} alto={14} radio={4} />
          <Skeleton ancho={20} alto={12} />
        </Fila>
      </View>
    ));
  return (
    <Cargando etiqueta="Calculando estadísticas">
      <View style={{ padding: 16, gap: 14 }}>
        <Skeleton alto={46} radio={14} />
        <Fila gap={10}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={s.cifra}>
              <Skeleton ancho={50} alto={26} radio={8} />
              <Skeleton ancho="80%" alto={11} />
            </View>
          ))}
        </Fila>
        <View style={s.panel}>
          <Skeleton ancho="48%" alto={16} />
          <Fila gap={8} style={{ alignItems: "flex-end" }}>
            <Skeleton ancho={64} alto={34} radio={8} />
            <Skeleton ancho="46%" alto={13} />
          </Fila>
          <Skeleton alto={12} radio={6} />
        </View>
        <View style={s.panel}>
          <Skeleton ancho="42%" alto={16} />
          <Fila gap={3} style={{ alignItems: "flex-end", height: 120 }}>
            {[30, 55, 20, 80, 45, 100, 65, 35, 70, 25, 50, 85].map((h, i) => (
              <Skeleton key={i} alto={`${h}%`} radio={4} style={{ flex: 1 }} />
            ))}
          </Fila>
        </View>
        <View style={s.panel}>
          <Skeleton ancho="46%" alto={16} />
          <Skeleton alto={28} radio={4} />
          {[0, 1, 2, 3].map((i) => (
            <Fila key={i} gap={10}>
              <Skeleton ancho={12} alto={12} radio={3} />
              <Skeleton ancho="30%" alto={13} />
              <Skeleton ancho={26} alto={13} style={{ marginLeft: "auto" }} />
            </Fila>
          ))}
        </View>
        <View style={s.panel}>
          <Skeleton ancho="48%" alto={16} />
          {barras([88, 64, 52, 40, 30, 22])}
        </View>
        <View style={s.panel}>
          <Skeleton ancho="44%" alto={16} />
          {barras([92, 54, 32])}
        </View>
        <View style={s.panel}>
          <Skeleton ancho="42%" alto={16} />
          {barras([94, 18, 8])}
        </View>
      </View>
    </Cargando>
  );
}

// TODOS · Arranque de la app — se está leyendo la sesión y aún no se sabe el rol: pantalla neutra
export function SkeletonArranque() {
  return (
    <Cargando etiqueta="Abriendo Jornada Viva">
      <SaludoSk />
      <View style={{ paddingTop: 8 }}>
        {[0, 1].map((i) => (
          <JornadaCardSk key={i} pie="cupos" />
        ))}
      </View>
    </Cargando>
  );
}

// GESTOR/ADMIN · QR de asistencia — mientras el servidor firma el código
export function SkeletonCodigoQr() {
  return (
    <Cargando etiqueta="Generando código" enLista>
      <Skeleton ancho={180} alto={180} radio={16} />
    </Cargando>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  relleno: { flex: 1, overflow: "hidden" },
  col: { flex: 1, gap: 8 },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cuerpoTarjeta: { flexDirection: "row", gap: 14, padding: 14 },
  pieTarjeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  tarjetaAdmin: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saludo: {
    backgroundColor: colors.surface,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  seccion: { justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 22 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  mosaicos: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  mosaico: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  cifra: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  barraSk: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  inscrito: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  registro: { gap: 8, paddingVertical: 12 },
  registroSep: { borderTopWidth: 1, borderTopColor: colors.border },
});
