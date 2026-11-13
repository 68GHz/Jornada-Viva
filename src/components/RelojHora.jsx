import React, { useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

const TAM = 268; // lado del reloj
const C = TAM / 2;
const R_NUMEROS = 104;
const R_SELECCION = 22;
const HORA_POR_DEFECTO = "09:00";

const dos = (n) => String(n).padStart(2, "0");

// "14:30" -> { h12: 2, min: 30, pm: true }
function descomponer(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  const [h, min] = m ? [Number(m[1]), Number(m[2])] : [9, 0];
  const h24 = h >= 0 && h < 24 ? h : 9;
  return { h12: h24 % 12 === 0 ? 12 : h24 % 12, min: min < 60 ? min : 0, pm: h24 >= 12 };
}

// { h12: 2, min: 30, pm: true } -> "14:30"
function componer({ h12, min, pm }) {
  return `${dos((h12 % 12) + (pm ? 12 : 0))}:${dos(min)}`;
}

export function etiquetaHora(hhmm) {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return "";
  const { h12, min, pm } = descomponer(hhmm);
  return `${h12}:${dos(min)} ${pm ? "p. m." : "a. m."}`;
}

const posicion = (valorEnCircunferencia, radio) => {
  const ang = (valorEnCircunferencia * Math.PI) / 180;
  return { x: C + radio * Math.sin(ang), y: C - radio * Math.cos(ang) };
};

// Campo de hora con reloj interactivo: se toca (o arrastra) la hora y luego los minutos.
// `valor` y `onChange` usan el formato 24 h "HH:mm".
export default function RelojHora({ valor, onChange, titulo = "Hora de inicio", error = false }) {
  const [abierto, setAbierto] = useState(false);
  const [t, setT] = useState(descomponer(valor));
  const [modo, setModo] = useState("hora"); // "hora" | "minuto"
  const modoRef = useRef(modo);
  modoRef.current = modo;

  const abrir = () => {
    setT(descomponer(valor || HORA_POR_DEFECTO));
    setModo("hora");
    setAbierto(true);
  };

  // Convierte el toque en hora o minutos según el ángulo respecto al centro
  const aplicarToque = (x, y, soltar) => {
    const ang = ((Math.atan2(x - C, C - y) * 180) / Math.PI + 360) % 360;
    if (modoRef.current === "hora") {
      const h = Math.round(ang / 30) % 12 || 12;
      setT((a) => ({ ...a, h12: h }));
      if (soltar) setModo("minuto");
    } else {
      const m = (Math.round(ang / 30) * 5) % 60;
      setT((a) => ({ ...a, min: m }));
    }
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => aplicarToque(e.nativeEvent.locationX, e.nativeEvent.locationY, false),
        onPanResponderMove: (e) => aplicarToque(e.nativeEvent.locationX, e.nativeEvent.locationY, false),
        onPanResponderRelease: (e) => aplicarToque(e.nativeEvent.locationX, e.nativeEvent.locationY, true),
      }),
    []
  );

  const enHora = modo === "hora";
  const gradosSeleccion = enHora ? (t.h12 % 12) * 30 : t.min * 6;
  const punta = posicion(gradosSeleccion, R_NUMEROS);
  const numeros = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return enHora ? n : (n * 5) % 60;
  });
  const hayMinutoIntermedio = !enHora && t.min % 5 !== 0;

  const confirmar = () => {
    setAbierto(false);
    onChange(componer(t));
  };

  const texto = etiquetaHora(valor) || (valor ? valor : "");

  return (
    <>
      <TouchableOpacity
        style={[styles.campo, error && styles.campoError]}
        onPress={abrir}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${titulo}: ${texto || "sin seleccionar"}`}
        accessibilityHint="Abre un reloj para elegir la hora"
      >
        <Ionicons name="time-outline" size={18} color={colors.primary} />
        <Text style={[styles.valor, !texto && styles.placeholder]}>{texto || "Elegir hora"}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={styles.fondo} onPress={() => setAbierto(false)} accessibilityLabel="Cerrar reloj" />
        <View style={styles.centro} pointerEvents="box-none">
          <View style={styles.tarjeta}>
            <View style={styles.cabecera}>
              <Text style={styles.titulo}>{titulo}</Text>
              <View style={styles.pantalla}>
                <TouchableOpacity
                  onPress={() => setModo("hora")}
                  style={[styles.segmento, enHora && styles.segmentoActivo]}
                  accessibilityRole="button"
                  accessibilityLabel={`Hora ${t.h12}`}
                >
                  <Text style={[styles.digitos, enHora && styles.digitosActivo]}>{dos(t.h12)}</Text>
                </TouchableOpacity>
                <Text style={styles.dosPuntos}>:</Text>
                <TouchableOpacity
                  onPress={() => setModo("minuto")}
                  style={[styles.segmento, !enHora && styles.segmentoActivo]}
                  accessibilityRole="button"
                  accessibilityLabel={`Minutos ${t.min}`}
                >
                  <Text style={[styles.digitos, !enHora && styles.digitosActivo]}>{dos(t.min)}</Text>
                </TouchableOpacity>
                <View style={styles.ampm}>
                  {[false, true].map((esPm) => (
                    <TouchableOpacity
                      key={String(esPm)}
                      onPress={() => setT((a) => ({ ...a, pm: esPm }))}
                      style={[styles.ampmBoton, t.pm === esPm && styles.ampmActivo]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: t.pm === esPm }}
                      accessibilityLabel={esPm ? "p. m." : "a. m."}
                    >
                      <Text style={[styles.ampmTexto, t.pm === esPm && styles.ampmTextoActivo]}>
                        {esPm ? "PM" : "AM"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.cuerpo}>
              <View style={styles.reloj} {...pan.panHandlers}>
                <Svg width={TAM} height={TAM} pointerEvents="none">
                  <Circle cx={C} cy={C} r={C} fill={colors.background} />
                  <Line
                    x1={C}
                    y1={C}
                    x2={punta.x}
                    y2={punta.y}
                    stroke={colors.primary}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <Circle cx={C} cy={C} r={5} fill={colors.primary} />
                  <Circle cx={punta.x} cy={punta.y} r={R_SELECCION} fill={colors.primary} />
                  {hayMinutoIntermedio && <Circle cx={punta.x} cy={punta.y} r={3} fill={colors.white} />}
                  {numeros.map((n, i) => {
                    const p = posicion((i + 1) * 30, R_NUMEROS);
                    const activo = enHora ? n === t.h12 : n === t.min;
                    return (
                      <SvgText
                        key={i}
                        x={p.x}
                        y={p.y + 5.5}
                        fontSize={17}
                        fontWeight={activo ? "700" : "500"}
                        textAnchor="middle"
                        fill={activo && !hayMinutoIntermedio ? colors.white : colors.textPrimary}
                      >
                        {enHora ? n : dos(n)}
                      </SvgText>
                    );
                  })}
                </Svg>
              </View>

              <View style={styles.acciones}>
                <TouchableOpacity style={styles.accion} onPress={() => setAbierto(false)} accessibilityRole="button">
                  <Text style={styles.accionCancelar}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.accion, styles.accionAceptar]}
                  onPress={confirmar}
                  accessibilityRole="button"
                >
                  <Text style={styles.accionAceptarTexto}>Aceptar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  campo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  campoError: { borderColor: colors.error },
  valor: { flex: 1, fontSize: 15, color: colors.textPrimary },
  placeholder: { color: colors.textDisabled },
  fondo: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  tarjeta: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 28,
    overflow: "hidden",
  },
  cabecera: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 8,
  },
  titulo: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  pantalla: { flexDirection: "row", alignItems: "center" },
  segmento: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 2 },
  segmentoActivo: { backgroundColor: "rgba(255,255,255,0.2)" },
  digitos: { fontSize: 48, fontWeight: "300", color: "rgba(255,255,255,0.6)" },
  digitosActivo: { color: colors.white, fontWeight: "500" },
  dosPuntos: { fontSize: 44, fontWeight: "300", color: "rgba(255,255,255,0.6)", marginHorizontal: 2 },
  ampm: {
    marginLeft: "auto",
    flexDirection: "column",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  ampmBoton: { paddingHorizontal: 12, paddingVertical: 7, alignItems: "center" },
  ampmActivo: { backgroundColor: colors.white },
  ampmTexto: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.8)" },
  ampmTextoActivo: { color: colors.primary },
  cuerpo: { padding: 20, alignItems: "center", gap: 14 },
  reloj: { width: TAM, height: TAM },
  acciones: { flexDirection: "row", alignSelf: "stretch", justifyContent: "flex-end", gap: 8 },
  accion: { minHeight: 44, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  accionCancelar: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
  accionAceptar: { backgroundColor: colors.primary },
  accionAceptarTexto: { fontSize: 14, fontWeight: "800", color: colors.white },
});
