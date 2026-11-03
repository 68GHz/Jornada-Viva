import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useTodasJornadas, useUsuarios } from "../../hooks/useAdmin";
import { actualizarUsuario, mensajeErrorAdmin } from "../../services/adminService";
import AvatarMini from "../../components/AvatarMini";
import JornadaCard from "../../components/JornadaCard";
import SelectDesplegable from "../../components/SelectDesplegable";
import { estadoParaCard } from "../../components/EstadoJornadaChip";
import { SkeletonDetalleUsuario } from "../../components/Skeleton";
import { Boton, Campo, Entrada } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { ETIQUETA_ROL, ROLES, esGestor } from "../../utils/roles";
import { estadoJornada } from "../../utils/estadoJornada";
import { formatearFecha } from "../../utils/jornadaFecha";
import { cuentaActiva, puedeModificarCuenta } from "../../utils/usuariosAdmin";

const OPCIONES_ROL = Object.values(ROLES).map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }));

function Dato({ icono, etiqueta, valor, seleccionable }) {
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

// Detalle de una cuenta: datos, rol, estado y (para gestores) sus jornadas asignadas
export default function UsuarioDetalleScreen({ navigation, route }) {
  const { usuarioId } = route.params;
  const { usuario: actorAuth } = useAuth();
  const { enLinea } = useConnectivity();
  const { usuarios, cargando, reintentar } = useUsuarios();
  const usuario = usuarios.find((u) => u.id === usuarioId);
  const gestor = usuario && esGestor(usuario.rol);
  const asignadas = useTodasJornadas(gestor ? usuarioId : "__ninguno__");

  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState(ROLES.ESTUDIANTE);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (usuario) {
      setNombre(usuario.nombre || "");
      setRol(usuario.rol);
    }
  }, [usuario?.id, usuario?.nombre, usuario?.rol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) return <SkeletonDetalleUsuario />;
  if (!usuario) {
    return (
      <View style={styles.noExiste}>
        <Ionicons name="person-remove-outline" size={44} color={colors.textDisabled} />
        <Text style={styles.noExisteTexto}>El usuario no existe.</Text>
      </View>
    );
  }

  const actor = { uid: actorAuth.uid, nombre: actorAuth.displayName || actorAuth.email };
  const esPropia = !puedeModificarCuenta(actor.uid, usuario);
  const activa = cuentaActiva(usuario);
  const hayCambios = nombre.trim() !== (usuario.nombre || "") || rol !== usuario.rol;
  const colorRol =
    usuario.rol === ROLES.ADMINISTRADOR ? colors.error : usuario.rol === ROLES.GESTOR ? colors.primaryLight : colors.textSecondary;

  const aplicar = async (cambios, textoExito) => {
    if (!enLinea) {
      Alert.alert("Sin conexión", "Necesitas conexión a internet para modificar cuentas.");
      return;
    }
    setGuardando(true);
    try {
      await actualizarUsuario(actor, usuario, cambios);
      reintentar(); // ya no hay actualización en vivo: se vuelven a pedir las cuentas
      if (textoExito) Alert.alert("Listo", textoExito);
    } catch (e) {
      Alert.alert("No se pudo guardar", mensajeErrorAdmin(e));
    } finally {
      setGuardando(false);
    }
  };

  const guardar = () => {
    if (!nombre.trim()) return Alert.alert("Nombre requerido", "Escribe el nombre del usuario.");
    const cambia = rol !== usuario.rol;
    const ejecutar = () => aplicar({ nombre: nombre.trim(), rol }, "Los cambios se guardaron.");
    if (!cambia) return ejecutar();
    Alert.alert(
      "Cambiar rol",
      `${usuario.nombre || usuario.email} pasará de «${ETIQUETA_ROL[usuario.rol]}» a «${ETIQUETA_ROL[rol]}». Los permisos cambian de inmediato.\n\n¿Deseas continuar?`,
      [{ text: "Cancelar", style: "cancel" }, { text: "Sí, cambiar", onPress: ejecutar }]
    );
  };

  const cambiarEstado = () =>
    Alert.alert(
      activa ? "Desactivar cuenta" : "Activar cuenta",
      activa
        ? `${usuario.nombre || usuario.email} no podrá usar la app: su sesión se cierra y no podrá realizar acciones. Podrás reactivarla después.\n\n¿Deseas desactivarla?`
        : `${usuario.nombre || usuario.email} volverá a poder usar la app.\n\n¿Deseas activarla?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: activa ? "Sí, desactivar" : "Sí, activar",
          style: activa ? "destructive" : "default",
          onPress: () => aplicar({ activo: !activa }),
        },
      ]
    );

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <View style={styles.perfil}>
        <AvatarMini uid={usuario.id} nombre={usuario.nombre || usuario.email} size={88} />
        <Text style={styles.nombre}>{usuario.nombre || "Sin nombre"}</Text>
        <Text style={styles.correo} selectable>
          {usuario.email}
        </Text>
        <View style={styles.etiquetas}>
          <View style={[styles.pildora, { backgroundColor: `${colorRol}1F` }]}>
            <Text style={[styles.pildoraTexto, { color: colorRol }]}>{ETIQUETA_ROL[usuario.rol]}</Text>
          </View>
          <View style={[styles.pildora, { backgroundColor: activa ? colors.primaryPale : "#FDECEC" }]}>
            <Text style={[styles.pildoraTexto, { color: activa ? colors.primary : colors.error }]}>
              {activa ? "Cuenta activa" : "Cuenta inactiva"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tarjeta}>
        {!!usuario.creadoEn && (
          <Dato icono="calendar-outline" etiqueta="Registrado el" valor={formatearFecha(usuario.creadoEn, "D [de] MMMM [de] YYYY")} />
        )}
        <Dato icono="key-outline" etiqueta="ID de la cuenta" valor={usuario.id} seleccionable />
      </View>

      {esPropia && (
        <View style={styles.nota}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.notaTexto}>
            Es tu propia cuenta: no puedes cambiar tu rol ni desactivarte (solo editar tu nombre).
          </Text>
        </View>
      )}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>Editar cuenta</Text>
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChangeText={setNombre} maxLength={100} accessibilityLabel="Nombre" />
        </Campo>
        <Campo etiqueta="Rol y permisos">
          <SelectDesplegable
            titulo="Rol y permisos"
            icono="shield-checkmark-outline"
            valor={rol}
            opciones={OPCIONES_ROL}
            onChange={setRol}
            deshabilitado={esPropia}
          />
        </Campo>
        <Boton texto="Guardar cambios" icono="save-outline" onPress={guardar} cargando={guardando} deshabilitado={!hayCambios} />
      </View>

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>Estado de la cuenta</Text>
        <Text style={styles.texto}>
          {activa
            ? "Mientras esté activa, la persona puede usar la app según su rol."
            : "La cuenta está inactiva: la persona no puede usar la app hasta que se reactive."}
        </Text>
        <Boton
          texto={activa ? "Desactivar cuenta" : "Activar cuenta"}
          icono={activa ? "ban-outline" : "checkmark-circle-outline"}
          variante={activa ? "peligro" : "secundario"}
          onPress={cambiarEstado}
          deshabilitado={esPropia || guardando}
        />
      </View>

      {gestor && (
        <View style={{ gap: 4 }}>
          <Text style={[styles.tituloSeccion, { marginLeft: 4 }]}>Jornadas asignadas ({asignadas.jornadas.length})</Text>
          {asignadas.jornadas.length === 0 ? (
            <Text style={[styles.texto, { marginLeft: 4 }]}>Este gestor no tiene jornadas asignadas.</Text>
          ) : (
            asignadas.jornadas.map((j) => (
              <View key={j.id} style={{ marginHorizontal: -16 }}>
                <JornadaCard
                  jornada={j}
                  estado={estadoParaCard(estadoJornada(j))}
                  onPress={() => navigation.navigate("JornadaAdmin", { jornadaId: j.id })}
                />
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  noExiste: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.background },
  noExisteTexto: { fontSize: 15, color: colors.textSecondary },
  perfil: { alignItems: "center", gap: 6, paddingVertical: 8 },
  nombre: { fontSize: 22, fontWeight: "800", color: colors.textPrimary, textAlign: "center", marginTop: 6 },
  correo: { fontSize: 14, color: colors.textSecondary },
  etiquetas: { flexDirection: "row", gap: 8, marginTop: 6 },
  pildora: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
  pildoraTexto: { fontSize: 12, fontWeight: "800" },
  tarjeta: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  tituloSeccion: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
  texto: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
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
  nota: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingHorizontal: 4 },
  notaTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
});
