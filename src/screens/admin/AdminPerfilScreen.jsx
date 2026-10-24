import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { Boton, estilos } from "../../components/AdminUi";
import { ETIQUETA_ROL } from "../../utils/roles";

// Perfil y sesión del administrador
export default function AdminPerfilScreen() {
  const { usuario, rol, cerrarSesion } = useAuth();
  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={estilos.tarjeta}>
        <Text style={estilos.titulo}>{usuario?.displayName || "Administrador"}</Text>
        <Text style={estilos.texto}>{usuario?.email}</Text>
        <Text style={estilos.texto}>Rol: {ETIQUETA_ROL[rol]}</Text>
        <Text style={[estilos.texto, { fontSize: 11 }]}>ID: {usuario?.uid}</Text>
      </View>
      <Text style={estilos.texto}>
        Tu rol y el estado de tu cuenta solo pueden cambiarlos otro administrador: nadie puede modificar los suyos.
      </Text>
      <Boton texto="Cerrar sesión" variante="peligro" onPress={cerrarSesion} />
    </ScrollView>
  );
}
