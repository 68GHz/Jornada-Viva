import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MorphingBlobatar } from "@blobatar/react-native";
import { happy, idle } from "blobatar/expression";
import { colors } from "../theme/colors";
import { leerLocal, guardarLocal } from "../services/localStore";

// Tono verde institucional (≈ #1A6B4A en OKLCh): solo cambian forma y rostro, no el color de marca
const HUE_INSTITUCIONAL = 158;

// Si el dibujo fallara, se muestra la inicial: el avatar nunca debe tumbar la pantalla
export class LimiteError extends React.Component {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  render() {
    return this.state.fallo ? this.props.respaldo : this.props.children;
  }
}

export function Inicial({ nombre, size }) {
  return (
    <View style={[styles.inicial, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.inicialTexto, { fontSize: size * 0.42 }]}>
        {(nombre || "E").trim().charAt(0).toUpperCase() || "E"}
      </Text>
    </View>
  );
}

// Avatar determinista del usuario (Blobatar), calculado en el dispositivo: funciona sin conexión.
// Es ESTÁTICO: no se mueve por sí solo. Solo cambia cuando el usuario toca «Cambiar avatar» (`editable`),
// que genera otro diseño con una breve expresión de alegría; la elección se guarda por usuario.
export default function AvatarUsuario({ uid, nombre, size = 96, editable = false, onPress }) {
  const [variante, setVariante] = useState(0);
  const [expresion, setExpresion] = useState(idle);
  const temporizador = useRef(null);

  useEffect(() => {
    let vivo = true;
    if (uid) {
      leerLocal(uid, "avatar", null).then((g) => {
        if (vivo && Number.isInteger(g?.variante)) setVariante(g.variante);
      });
    }
    return () => {
      vivo = false;
      clearTimeout(temporizador.current);
    };
  }, [uid]);

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
      {/* Con `onPress` el avatar es un botón (p. ej. para abrir el perfil); sin él, es solo la imagen */}
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : "image"}
        accessibilityLabel={onPress ? "Abrir mi perfil" : `Avatar de ${nombre || "estudiante"}`}
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
