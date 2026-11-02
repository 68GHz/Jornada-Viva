import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { MorphingBlobatar } from "@blobatar/react-native";
import { happy, idle } from "blobatar/expression";
import { colors } from "../theme/colors";
import { leerLocal, guardarLocal } from "../services/localStore";

// Tono verde institucional (≈ #1A6B4A en OKLCh): solo cambian forma y rostro, no el color de marca
const HUE_INSTITUCIONAL = 158;

// Si el dibujo fallara, se muestra la inicial: el avatar nunca debe tumbar la pantalla
class LimiteError extends React.Component {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  render() {
    return this.state.fallo ? this.props.respaldo : this.props.children;
  }
}

function Inicial({ nombre, size }) {
  return (
    <View style={[styles.inicial, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.inicialTexto, { fontSize: size * 0.42 }]}>
        {(nombre || "E").trim().charAt(0).toUpperCase() || "E"}
      </Text>
    </View>
  );
}

// Avatar determinista del usuario (Blobatar), calculado en el dispositivo: funciona sin conexión.
// - Respiración suave con Animated (sin librerías nativas); se apaga con "reducir movimiento".
// - Al tocarlo reacciona con una expresión y vuelve a la normal.
// - `editable`: permite cambiar de diseño; la elección se guarda por usuario en el dispositivo.
export default function AvatarUsuario({ uid, nombre, size = 96, editable = false }) {
  const [variante, setVariante] = useState(0);
  const [expresion, setExpresion] = useState(idle);
  const [reducir, setReducir] = useState(false);
  const respiro = useRef(new Animated.Value(0)).current;
  const temporizador = useRef(null);

  useEffect(() => {
    let vivo = true;
    if (uid) {
      leerLocal(uid, "avatar", null).then((g) => {
        if (vivo && Number.isInteger(g?.variante)) setVariante(g.variante);
      });
    }
    AccessibilityInfo.isReduceMotionEnabled().then((v) => vivo && setReducir(!!v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducir);
    return () => {
      vivo = false;
      sub?.remove?.();
      clearTimeout(temporizador.current);
    };
  }, [uid]);

  useEffect(() => {
    if (reducir) {
      respiro.setValue(0);
      return;
    }
    const lazo = Animated.loop(
      Animated.sequence([
        Animated.timing(respiro, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(respiro, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    lazo.start();
    return () => lazo.stop();
  }, [reducir, respiro]);

  const reaccionar = useCallback(() => {
    setExpresion(happy);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setExpresion(idle), 1400);
  }, []);

  const cambiarDiseno = useCallback(() => {
    const siguiente = variante + 1;
    setVariante(siguiente);
    guardarLocal(uid, "avatar", { variante: siguiente });
    reaccionar();
  }, [variante, uid, reaccionar]);

  const semilla = `${uid || nombre || "estudiante"}:${variante}`;

  return (
    <View style={styles.contenedor}>
      <Pressable
        onPress={reaccionar}
        accessibilityRole="image"
        accessibilityLabel={`Avatar de ${nombre || "estudiante"}`}
      >
        <Animated.View
          style={{
            transform: [
              { translateY: respiro.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
              { scale: respiro.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
            ],
          }}
        >
          <LimiteError respaldo={<Inicial nombre={nombre} size={size} />}>
            <MorphingBlobatar
              name={semilla}
              size={size}
              hue={HUE_INSTITUCIONAL}
              expression={expresion}
              title={`Avatar de ${nombre || "estudiante"}`}
            />
          </LimiteError>
        </Animated.View>
      </Pressable>

      {editable && (
        <Pressable
          onPress={cambiarDiseno}
          style={styles.boton}
          accessibilityRole="button"
          accessibilityLabel="Cambiar diseño del avatar"
          hitSlop={8}
        >
          <Text style={styles.botonTexto}>Cambiar avatar</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { alignItems: "center", gap: 10 },
  inicial: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  inicialTexto: { fontWeight: "800", color: colors.white },
  boton: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.primaryPale,
  },
  botonTexto: { fontSize: 12, fontWeight: "700", color: colors.primary },
});
