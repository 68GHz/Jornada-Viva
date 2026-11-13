import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "../theme/colors";
import { ESTADOS_JORNADA } from "../utils/estadoJornada";

// Piezas de gráficas del panel de estadísticas. Todas son vistas simples (sin librerías de gráficas):
// - TarjetaGrafica: contenedor con título y subtítulo
// - Cifra: tarjeta con un número destacado (KPI)
// - Medidor: una proporción contra un límite (p. ej. ocupación de cupos)
// - BarraSegmentada: un todo repartido en pocas partes (leyenda con nombre, cifra y %)
// - BarrasRanking: comparación ordenada de categorías (barras horizontales, un solo tono)
// - ColumnasMes: evolución en el tiempo (columnas por mes)
// Tocar una barra, un segmento o una columna muestra su detalle.

// Colores de las gráficas por estado de jornada: mismo tono que los chips de la app, pero
// ajustados para cumplir contraste (≥ 3:1) y separación para daltonismo. El gris es el estado «apagado».
export const COLOR_GRAFICA_ESTADO = {
  [ESTADOS_JORNADA.ACTIVA]: "#1D8A52",
  [ESTADOS_JORNADA.EN_CURSO]: "#E08A00",
  [ESTADOS_JORNADA.CANCELADA]: "#D63838",
  [ESTADOS_JORNADA.FINALIZADA]: "#7C8C8C",
};

const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) : 0);

export function TarjetaGrafica({ titulo, subtitulo, children }) {
  return (
    <View style={styles.tarjeta}>
      <View style={styles.cabecera}>
        <Text style={styles.titulo}>{titulo}</Text>
        {!!subtitulo && <Text style={styles.subtitulo}>{subtitulo}</Text>}
      </View>
      {children}
    </View>
  );
}

export function Cifra({ valor, etiqueta, color = colors.primary }) {
  return (
    <View style={styles.cifra} accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={[styles.cifraValor, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      <Text style={styles.cifraEtiqueta} numberOfLines={2}>
        {etiqueta}
      </Text>
    </View>
  );
}

export function Medidor({ valor, total, etiqueta }) {
  const pct = Math.min(100, porcentaje(valor, total));
  return (
    <View accessible accessibilityLabel={`${etiqueta}: ${valor} de ${total}, ${pct}%`}>
      <View style={styles.medidorFila}>
        <Text style={styles.medidorPct}>{pct}%</Text>
        <Text style={styles.medidorDetalle}>
          {valor} de {total} {etiqueta}
        </Text>
      </View>
      <View style={styles.pista}>
        <View style={[styles.relleno, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function Detalle({ texto }) {
  if (!texto) return null;
  return (
    <View style={styles.detalle} accessibilityLiveRegion="polite">
      <Text style={styles.detalleTexto}>{texto}</Text>
    </View>
  );
}

// segmentos: [{ etiqueta, valor, color }]
export function BarraSegmentada({ segmentos, unidad = "jornadas" }) {
  const [elegido, setElegido] = useState(null);
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const visibles = segmentos.filter((x) => x.valor > 0);
  const sel = segmentos.find((x) => x.etiqueta === elegido);
  const alternar = (etiqueta) => setElegido((a) => (a === etiqueta ? null : etiqueta));
  return (
    <View style={styles.bloque}>
      <View style={styles.segmentada}>
        {visibles.map((s, i) => (
          <TouchableOpacity
            key={s.etiqueta}
            activeOpacity={0.8}
            onPress={() => alternar(s.etiqueta)}
            accessibilityRole="button"
            accessibilityLabel={`${s.etiqueta}: ${s.valor} ${unidad}`}
            style={{
              flex: s.valor,
              backgroundColor: s.color,
              marginRight: i < visibles.length - 1 ? 2 : 0, // 2 px de separación entre segmentos
              opacity: elegido && elegido !== s.etiqueta ? 0.35 : 1,
            }}
          />
        ))}
      </View>
      {segmentos.map((s) => (
        <TouchableOpacity
          key={s.etiqueta}
          style={styles.leyenda}
          onPress={() => alternar(s.etiqueta)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${s.etiqueta}: ${s.valor}, ${porcentaje(s.valor, total)}%`}
        >
          <View style={[styles.muestra, { backgroundColor: s.color }]} />
          <Text style={[styles.leyendaNombre, elegido === s.etiqueta && styles.negrita]}>{s.etiqueta}</Text>
          <Text style={styles.leyendaValor}>{s.valor}</Text>
          <Text style={styles.leyendaPct}>{porcentaje(s.valor, total)}%</Text>
        </TouchableOpacity>
      ))}
      <Detalle
        texto={
          sel ? `${sel.etiqueta}: ${sel.valor} de ${total} ${unidad} (${porcentaje(sel.valor, total)}%)` : null
        }
      />
    </View>
  );
}

// filas: [[nombre, valor]] ya ordenadas de mayor a menor. `tope`: cuántas se muestran; el resto se suma
// en «Otros», que se puede desplegar con «Ver todos».
export function BarrasRanking({ filas, tope = 8, color = colors.primary, unidad = "jornadas", vacio = "Sin datos." }) {
  const [verTodos, setVerTodos] = useState(false);
  const [elegido, setElegido] = useState(null);
  if (!filas || filas.length === 0) return <Text style={styles.vacio}>{vacio}</Text>;

  const total = filas.reduce((s, [, v]) => s + v, 0);
  const hayResto = filas.length > tope;
  let visibles = filas;
  if (hayResto && !verTodos) {
    const resto = filas.slice(tope - 1);
    visibles = [
      ...filas.slice(0, tope - 1),
      [`Otros (${resto.length})`, resto.reduce((s, [, v]) => s + v, 0), true],
    ];
  }
  const max = Math.max(...visibles.map(([, v]) => v), 1);
  const sel = visibles.find(([n]) => n === elegido);

  return (
    <View style={styles.bloque}>
      {visibles.map(([nombre, valor, esOtros]) => (
        <TouchableOpacity
          key={nombre}
          style={[styles.fila, elegido && elegido !== nombre && { opacity: 0.45 }]}
          onPress={() => setElegido((a) => (a === nombre ? null : nombre))}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${nombre}: ${valor} ${unidad}, ${porcentaje(valor, total)}%`}
        >
          <Text style={[styles.filaNombre, elegido === nombre && styles.negrita]} numberOfLines={1}>
            {nombre}
          </Text>
          <View style={styles.filaBarra}>
            {/* La barra ocupa como máximo el espacio que deja la cifra: nunca se sale de la tarjeta */}
            <View style={styles.filaPista}>
              <View
                style={[
                  styles.barra,
                  { width: `${(valor / max) * 100}%`, backgroundColor: esOtros ? colors.textDisabled : color },
                ]}
              />
            </View>
            <Text style={styles.filaValor}>{valor}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {hayResto && (
        <TouchableOpacity
          style={styles.enlace}
          onPress={() => {
            setVerTodos((v) => !v);
            setElegido(null);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.enlaceTexto}>{verTodos ? "Ver menos" : `Ver todos (${filas.length})`}</Text>
        </TouchableOpacity>
      )}
      <Detalle texto={sel ? `${sel[0]}: ${sel[1]} de ${total} ${unidad} (${porcentaje(sel[1], total)}%)` : null} />
    </View>
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// porMes: { "YYYY-MM": cantidad }. Muestra los últimos `meses` meses hasta el último con jornadas
// (o hasta `mesActual`), rellenando con 0 los meses sin jornadas. El mes actual va en el tono pleno.
export function ColumnasMes({ porMes, mesActual, meses = 12, unidad = "jornadas" }) {
  const [elegido, setElegido] = useState(null);
  const claves = Object.keys(porMes || {}).sort();
  if (claves.length === 0) return <Text style={styles.vacio}>Aún no hay jornadas con fecha.</Text>;

  const fin = mesActual && mesActual > claves[claves.length - 1] ? mesActual : claves[claves.length - 1];
  const [anioFin, mesFin] = fin.split("-").map(Number);
  const serie = [];
  for (let i = meses - 1; i >= 0; i--) {
    const idx = anioFin * 12 + (mesFin - 1) - i;
    const clave = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
    serie.push({ clave, valor: porMes[clave] || 0 });
  }
  const max = Math.max(...serie.map((m) => m.valor), 1);
  const total = serie.reduce((s, m) => s + m.valor, 0);
  const sel = serie.find((m) => m.clave === elegido);
  const nombreMes = (clave) => {
    const [a, m] = clave.split("-").map(Number);
    return `${MESES_LARGOS[m - 1]} de ${a}`;
  };
  const ALTO = 120;

  return (
    <View style={styles.bloque}>
      <View style={[styles.columnas, { height: ALTO + 34 }]}>
        {serie.map((m) => {
          const alto = m.valor === 0 ? 2 : Math.max(6, (m.valor / max) * ALTO);
          const esActual = m.clave === (mesActual || fin);
          const [, mm] = m.clave.split("-").map(Number);
          return (
            <TouchableOpacity
              key={m.clave}
              style={styles.columnaCelda}
              onPress={() => setElegido((a) => (a === m.clave ? null : m.clave))}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${nombreMes(m.clave)}: ${m.valor} ${unidad}`}
            >
              <Text style={styles.columnaValor}>{m.valor > 0 ? m.valor : ""}</Text>
              <View
                style={[
                  styles.columna,
                  {
                    height: alto,
                    backgroundColor: esActual ? colors.primary : colors.primaryLight,
                    opacity: elegido && elegido !== m.clave ? 0.4 : m.valor === 0 ? 0.35 : 1,
                  },
                ]}
              />
              <Text style={[styles.columnaMes, mm === 1 && styles.negrita]}>
                {mm === 1 || m === serie[0] ? `${MESES[mm - 1]}\n${m.clave.slice(2, 4)}` : MESES[mm - 1]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Detalle texto={sel ? `${nombreMes(sel.clave)}: ${sel.valor} ${unidad}` : `${total} ${unidad} en los últimos ${meses} meses`} />
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cabecera: { gap: 2 },
  titulo: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  subtitulo: { fontSize: 12, color: colors.textSecondary },
  bloque: { gap: 10 },
  vacio: { fontSize: 13, color: colors.textSecondary },
  negrita: { fontWeight: "800" },

  cifra: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 2,
  },
  cifraValor: { fontSize: 26, fontWeight: "800" },
  cifraEtiqueta: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, lineHeight: 15 },

  medidorFila: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 8 },
  medidorPct: { fontSize: 34, fontWeight: "800", color: colors.primary },
  medidorDetalle: { flex: 1, fontSize: 13, color: colors.textSecondary },
  pista: { height: 12, borderRadius: 6, backgroundColor: colors.primaryPale, overflow: "hidden" },
  relleno: { height: 12, borderRadius: 6, backgroundColor: colors.primary },

  segmentada: { flexDirection: "row", height: 28, borderRadius: 4, overflow: "hidden", backgroundColor: colors.border },
  leyenda: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  muestra: { width: 12, height: 12, borderRadius: 3 },
  leyendaNombre: { flex: 1, fontSize: 14, color: colors.textPrimary },
  leyendaValor: { fontSize: 14, fontWeight: "800", color: colors.textPrimary, minWidth: 28, textAlign: "right" },
  leyendaPct: { fontSize: 12, color: colors.textSecondary, minWidth: 40, textAlign: "right" },

  fila: { gap: 4, minHeight: 36, justifyContent: "center" },
  filaNombre: { fontSize: 13, color: colors.textPrimary },
  filaBarra: { flexDirection: "row", alignItems: "center", gap: 8 },
  filaPista: { flex: 1, minWidth: 0 },
  barra: { height: 14, borderTopRightRadius: 4, borderBottomRightRadius: 4, minWidth: 2 },
  filaValor: { fontSize: 13, fontWeight: "800", color: colors.textPrimary, minWidth: 28, textAlign: "right" },
  enlace: { alignSelf: "flex-start", minHeight: 36, justifyContent: "center" },
  enlaceTexto: { fontSize: 13, fontWeight: "800", color: colors.primary },

  detalle: { backgroundColor: colors.primaryPale, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  detalleTexto: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },

  columnas: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  columnaCelda: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 3 },
  columna: { width: "70%", maxWidth: 24, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  columnaValor: { fontSize: 10, fontWeight: "800", color: colors.textPrimary },
  columnaMes: { fontSize: 9, color: colors.textSecondary, textAlign: "center", height: 24 },
});
