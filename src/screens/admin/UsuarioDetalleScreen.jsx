import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useConnectivity } from "../../context/ConnectivityContext";
import { useTodasJornadas, useUsuarios } from "../../hooks/useAdmin";
import { actualizarUsuario, mensajeErrorAdmin } from "../../services/adminService";
import LoadingSpinner from "../../components/LoadingSpinner";
import EstadoJornadaChip from "../../components/EstadoJornadaChip";
import { Boton, Campo, Chip, Entrada, estilos } from "../../components/AdminUi";
import { colors } from "../../theme/colors";
import { ETIQUETA_ROL, ROLES, esGestor } from "../../utils/roles";
import { estadoJornada } from "../../utils/estadoJornada";
import { formatearFecha } from "../../utils/jornadaFecha";
import { cuentaActiva, puedeModificarCuenta } from "../../utils/usuariosAdmin";

// Detalle de una cuenta: datos, rol, estado y (para gestores) sus jornadas asignadas
export default function UsuarioDetalleScreen({ navigation, route }) {
  const { usuarioId } = route.params;
  const { usuario: actorAuth } = useAuth();
  const { enLinea } = useConnectivity();
  const { usuarios, cargando } = useUsuarios();
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

  if (cargando) return <LoadingSpinner mensaje="Cargando usuario..." />;
  if (!usuario) {
    return (
      <View style={estilos.vacio}>
        <Text style={estilos.vacioTexto}>El usuario no existe.</Text>
      </View>
    );
  }

  const actor = { uid: actorAuth.uid, nombre: actorAuth.displayName || actorAuth.email };
  const esPropia = !puedeModificarCuenta(actor.uid, usuario);
  const activa = cuentaActiva(usuario);
  const hayCambios = nombre.trim() !== (usuario.nombre || "") || rol !== usuario.rol;

  const aplicar = async (cambios, textoExito) => {
    if (!enLinea) {
      Alert.alert("Sin conexión", "Necesitas conexión a internet para modificar cuentas.");
      return;
    }
    setGuardando(true);
    try {
      await actualizarUsuario(actor, usuario, cambios);
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
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
      <View style={estilos.tarjeta}>
        <Text style={estilos.titulo}>{usuario.nombre || "Sin nombre"}</Text>
        <Text style={estilos.texto}>{usuario.email}</Text>
        <Text style={estilos.texto}>
          {ETIQUETA_ROL[usuario.rol]} · {activa ? "Cuenta activa" : "Cuenta inactiva"}
        </Text>
        {!!usuario.creadoEn && <Text style={estilos.texto}>Registrado el {formatearFecha(usuario.creadoEn, "DD/MM/YYYY")}</Text>}
        <Text style={[estilos.texto, { fontSize: 11 }]}>ID: {usuario.id}</Text>
      </View>

      {esPropia && (
        <Text style={estilos.texto}>
          Es tu propia cuenta: no puedes cambiar tu rol ni desactivarte (solo editar tu nombre).
        </Text>
      )}

      <Campo etiqueta="Nombre">
        <Entrada value={nombre} onChangeText={setNombre} maxLength={100} accessibilityLabel="Nombre" />
      </Campo>

      <Campo etiqueta="Rol y permisos">
        <View style={estilos.fila}>
          {Object.values(ROLES).map((r) => (
            <Chip
              key={r}
              etiqueta={ETIQUETA_ROL[r]}
              activo={rol === r}
              onPress={() => !esPropia && setRol(r)}
            />
          ))}
        </View>
      </Campo>

      <Boton texto="Guardar cambios" onPress={guardar} cargando={guardando} deshabilitado={!hayCambios} />
      <Boton
        texto={activa ? "Desactivar cuenta" : "Activar cuenta"}
        variante={activa ? "peligro" : "secundario"}
        onPress={cambiarEstado}
        deshabilitado={esPropia || guardando}
      />

      {gestor && (
        <View style={{ gap: 8 }}>
          <Text style={estilos.seccion}>Jornadas asignadas ({asignadas.jornadas.length})</Text>
          {asignadas.jornadas.length === 0 ? (
            <Text style={estilos.texto}>Este gestor no tiene jornadas asignadas.</Text>
          ) : (
            asignadas.jornadas.map((j) => (
              <TouchableOpacity
                key={j.id}
                style={estilos.tarjeta}
                onPress={() => navigation.navigate("JornadaAdmin", { jornadaId: j.id })}
                accessibilityRole="button"
                accessibilityLabel={j.titulo}
              >
                <Text style={{ fontWeight: "700", color: colors.textPrimary }}>{j.titulo}</Text>
                <Text style={estilos.texto}>
                  {formatearFecha(j.fecha, "DD/MM/YYYY")} · {j.lugar}
                </Text>
                <EstadoJornadaChip estado={estadoJornada(j)} />
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}
