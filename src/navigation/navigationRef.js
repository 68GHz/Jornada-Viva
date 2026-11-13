import { createNavigationContainerRef } from "@react-navigation/native";

// Permite navegar desde componentes que están fuera de los navegadores (ej. el banner de conexión)
export const navigationRef = createNavigationContainerRef();
