# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

# Regla de UI: carga con skeleton

- Mientras una pantalla o sección carga contenido se muestra un **skeleton** con la forma exacta de lo que esa pantalla va a mostrar (`src/components/Skeleton.jsx`). Nunca un spinner a pantalla completa ni el texto «Cargando…».
- **Cada pantalla tiene su propio skeleton**, nombrado `Skeleton<Pantalla>` (`SkeletonInicioGestor`, `SkeletonReportes`, `SkeletonDetalleUsuario`…), con los mismos bloques, proporciones y orden que la pantalla real. Dos pantallas con contenido distinto no comparten skeleton; solo comparten las piezas que imitan un componente real (`JornadaCardSk`, `PrestamoCardSk`…).
- Pantalla nueva = skeleton nuevo en ese mismo archivo. Pantalla rediseñada = skeleton rediseñado. Si una pantalla carga solo una parte (una lista dentro de una pantalla ya visible), su skeleton cubre solo esa parte (`SkeletonInscritos`, `SkeletonInicioEstudiante`).
- El `ActivityIndicator` solo se permite dentro de un botón o de una acción en curso (guardar, enviar, marcar…), nunca para cargar contenido.
- Todo skeleton envuelve su contenido en `<Cargando etiqueta="…">` (accesibilidad: un solo elemento «cargando») y usa el `Skeleton` base, que comparte una única animación y respeta «reducir movimiento»; no se crean animaciones propias por pantalla.
