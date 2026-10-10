import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { colors } from "../theme/colors";
import { aDayjsNegocio } from "../utils/jornadaFecha";

const FORMATO = "YYYY-MM-DD";
const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

// Selector de una fecha o de un rango. Trabaja con cadenas "YYYY-MM-DD"
// (días de calendario, sin zona horaria) para `desde` y `hasta`.
export default function CalendarioRango({ visible, desde, hasta, onAplicar, onCerrar }) {
  const hoy = aDayjsNegocio(Date.now()).format(FORMATO);

  const [inicio, setInicio] = useState(desde);
  const [fin, setFin] = useState(hasta);
  const [mes, setMes] = useState(dayjs(desde || hoy).startOf("month"));

  // Al abrir, parte de la selección vigente
  React.useEffect(() => {
    if (visible) {
      setInicio(desde);
      setFin(hasta);
      setMes(dayjs(desde || hoy).startOf("month"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const seleccionar = (dia) => {
    if (!inicio || fin) {
      setInicio(dia);
      setFin(null);
    } else if (dia < inicio) {
      setInicio(dia);
    } else {
      setFin(dia);
    }
  };

  // Celdas del mes: huecos iniciales (lunes como primer día) + días
  const huecos = (mes.day() + 6) % 7;
  const celdas = [
    ...Array(huecos).fill(null),
    ...Array.from({ length: mes.daysInMonth() }, (_, i) =>
      mes.date(i + 1).format(FORMATO)
    ),
  ];

  const extremoFin = fin || inicio;
  const resumen = !inicio
    ? "Toca un día, o dos para elegir un rango"
    : fin && fin !== inicio
    ? `${dayjs(inicio).locale("es").format("D MMM")} – ${dayjs(fin).locale("es").format("D MMM YYYY")}`
    : dayjs(inicio).locale("es").format("dddd D [de] MMMM [de] YYYY");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={styles.fondo}>
        <View style={styles.hoja}>
          <Text style={styles.titulo}>Elegir fecha o rango</Text>

          <View style={styles.cabeceraMes}>
            <TouchableOpacity
              style={styles.flecha}
              onPress={() => setMes((m) => m.subtract(1, "month"))}
              accessibilityRole="button"
              accessibilityLabel="Mes anterior"
            >
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </TouchableOpacity>
            <Text style={styles.mesTexto} accessibilityRole="header">
              {mes.locale("es").format("MMMM YYYY")}
            </Text>
            <TouchableOpacity
              style={styles.flecha}
              onPress={() => setMes((m) => m.add(1, "month"))}
              accessibilityRole="button"
              accessibilityLabel="Mes siguiente"
            >
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.fila}>
            {DIAS_SEMANA.map((d) => (
              <Text key={d} style={styles.diaSemana}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.cuadricula}>
            {celdas.map((dia, i) => {
              if (!dia) return <View key={`h${i}`} style={styles.celda} />;

              const esExtremo = dia === inicio || dia === extremoFin;
              const enRango = inicio && extremoFin && dia > inicio && dia < extremoFin;
              return (
                <TouchableOpacity
                  key={dia}
                  style={[
                    styles.celda,
                    enRango && styles.celdaRango,
                    esExtremo && styles.celdaExtremo,
                  ]}
                  onPress={() => seleccionar(dia)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: esExtremo || !!enRango }}
                  accessibilityLabel={dayjs(dia).locale("es").format("dddd D [de] MMMM [de] YYYY")}
                >
                  <Text
                    style={[
                      styles.diaTexto,
                      dia === hoy && styles.diaHoy,
                      esExtremo && styles.diaTextoExtremo,
                    ]}
                  >
                    {dayjs(dia).date()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.resumen}>{resumen}</Text>

          <View style={styles.acciones}>
            <TouchableOpacity
              style={[styles.boton, styles.botonSecundario]}
              onPress={onCerrar}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
            >
              <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.boton, !inicio && styles.botonDeshabilitado]}
              onPress={() => onAplicar(inicio, extremoFin)}
              disabled={!inicio}
              accessibilityRole="button"
              accessibilityLabel="Aplicar fecha"
              accessibilityState={{ disabled: !inicio }}
            >
              <Text style={styles.botonTexto}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  hoja: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  titulo: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  cabeceraMes: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  flecha: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  mesTexto: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    textTransform: "capitalize",
  },
  fila: {
    flexDirection: "row",
  },
  diaSemana: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  cuadricula: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  celda: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  celdaRango: {
    backgroundColor: colors.primaryPale,
  },
  celdaExtremo: {
    backgroundColor: colors.primary,
    borderRadius: 22,
  },
  diaTexto: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  diaHoy: {
    fontWeight: "800",
    color: colors.primary,
  },
  diaTextoExtremo: {
    color: colors.white,
    fontWeight: "800",
  },
  resumen: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    textTransform: "capitalize",
  },
  acciones: {
    flexDirection: "row",
    gap: 10,
  },
  boton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  botonSecundario: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  botonDeshabilitado: {
    opacity: 0.5,
  },
  botonTexto: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
  botonSecundarioTexto: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },
});
