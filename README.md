# Jornada Viva

Aplicación móvil (React Native + Expo) para gestionar la inscripción a jornadas, brigadas y actividades de proyección social y bienestar del **Tecnológico de Antioquia**. Los usuarios pueden crear una cuenta, explorar las jornadas disponibles, ver su detalle e inscribirse, con todo persistido en Firebase.

## Funcionalidades

- Registro, inicio y cierre de sesión con **Firebase Authentication**.
- Listado de jornadas cargado en tiempo real desde **Firestore** (título, fecha, hora, lugar y entidad organizadora).
- Vista de detalle con descripción completa, cupos disponibles y responsable.
- Inscripción a la jornada con confirmación visual, persistida en Firestore.
- Validación para evitar que un usuario se inscriba dos veces a la misma jornada.

## Stack

- Expo `~57` / React Native `0.86`
- React Navigation (native stack)
- Firebase (Auth + Firestore)
- dayjs para formato de fechas

> Este proyecto usa Expo SDK 54+. Consulta la documentación versionada en https://docs.expo.dev/versions/v54.0.0/ antes de modificar la configuración nativa.

## Requisitos previos

- Node.js LTS
- Expo CLI (`npx expo`)
- Un proyecto de Firebase con Authentication (Email/Password) y Firestore habilitados

## Configuración

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea un archivo `.env` en la raíz a partir de `.env.example` y completa tus credenciales de Firebase:

   ```bash
   EXPO_PUBLIC_FIREBASE_API_KEY=
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   EXPO_PUBLIC_FIREBASE_APP_ID=
   ```

3. Inicia la app:

   ```bash
   npm start
   ```

   Luego abre en Expo Go (escaneando el QR) o en un emulador con `npm run android` / `npm run ios`.

## Estructura del proyecto

```
src/
├── components/      # JornadaCard, LoadingSpinner
├── context/         # AuthContext (estado de autenticación)
├── navigation/      # AppNavigator (stacks auth y app)
├── screens/
│   ├── auth/        # LoginScreen, RegisterScreen
│   └── app/         # HomeScreen, JornadasListScreen, JornadaDetailScreen
└── theme/           # colors
```

## Modelo de datos (Firestore)

- **`users/{uid}`**: `uid`, `nombre`, `email`, `creadoEn`.
- **`jornadas/{id}`**: `titulo`, `entidad`, `descripcion`, `fecha`, `hora`, `lugar`, `responsable`, `cuposTotales`, `cuposOcupados`, `activa`.
- **`inscripciones/{id}`**: `userId`, `jornadaId`, `nombreUsuario`, `emailUsuario`, `tituloJornada`, `fechaJornada`, `inscritoEn`, `asistio`.

## Investigación de campo

El material del trabajo de campo en el campus TdeA está en [`docs/investigacion`](docs/investigacion).

### Documentos

- [`informe-hallazgos.pdf`](docs/investigacion/informe-hallazgos.pdf) — problema identificado, hallazgos y conclusión.
- [`matriz-trazabilidad.pdf`](docs/investigacion/matriz-trazabilidad.pdf) — trazabilidad de hallazgos a requisitos, con **FE-01** (listado + detalle) y **FE-02** (inscripción con control de cupo) definidas.
- [`ficha-observacion.pdf`](docs/investigacion/ficha-observacion.pdf) — observación del proceso actual de inscripción y asistencia.

### Entrevistas

Dos entrevistas a actores reales del campus, con autorización registrada:

- [`entrevista-01.pdf`](docs/investigacion/entrevistas/entrevista-01.pdf) — Beatriz (Biblioteca). Audio: [`Beatriz (Biblioteca).mp4`](docs/investigacion/entrevistas/Beatriz%20(Biblioteca).mp4)
- [`entrevista-02.pdf`](docs/investigacion/entrevistas/entrevista-02.pdf) — Alejo (Gimnasio / Bienestar). Audio: [`Alejandro (Gimnasio).mp4`](docs/investigacion/entrevistas/Alejandro%20(Gimnasio).mp4)
- [`Preguntas.pdf`](docs/investigacion/entrevistas/Preguntas.pdf) — guion de preguntas aplicado.

### Registro fotográfico

Fotografías del equipo en campo en [`fotografias/`](docs/investigacion/fotografias): entrevista en biblioteca, entrevista en gimnasio y el equipo en el espacio.
