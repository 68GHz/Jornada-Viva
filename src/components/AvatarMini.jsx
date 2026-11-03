import React from "react";
import { Blobatar } from "@blobatar/react-native";
import { LimiteError, Inicial } from "./AvatarUsuario";

// Avatar pequeño y estático de cualquier persona (listas y detalles de usuarios). Se calcula en el
// dispositivo a partir de su identificador, con el mismo tono verde que el avatar del propio usuario.
// Si fallara el dibujo se muestra la inicial del nombre.
export default function AvatarMini({ uid, nombre, size = 44 }) {
  return (
    <LimiteError respaldo={<Inicial nombre={nombre} size={size} />}>
      <Blobatar name={`${uid || nombre || "usuario"}:0`} size={size} hue={158} title={`Avatar de ${nombre || "usuario"}`} />
    </LimiteError>
  );
}
