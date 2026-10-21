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
- `@react-native-async-storage/async-storage` (persistencia local) y `@react-native-community/netinfo` (estado de la conexión) para el modo offline

> Este proyecto usa Expo SDK 54+. Consulta la documentación versionada en <https://docs.expo.dev/versions/v54.0.0/> antes de modificar la configuración nativa.

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

```src/
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

## Modo offline

La app sigue siendo útil sin internet (se puede abrir en modo avión): muestra las jornadas y las inscripciones ya descargadas y permite inscribirse o cancelar; esas acciones quedan guardadas en el dispositivo y se envían a Firestore al recuperar la conexión.

### Qué se guarda localmente y con qué librería

Todo se guarda con **AsyncStorage**, en claves propias de cada usuario (`jv:v1:<uid>:<nombre>`). Al **cerrar sesión se borran todas** (incluidas las instantáneas de notificaciones) y no se vuelve a escribir nada hasta iniciar sesión de nuevo.

| Clave | Contenido |
|---|---|
| `jornadas` | Última lista de jornadas recibida del servidor (con `fecha` en milisegundos) |
| `inscripciones` | Inscripciones del usuario (`jornadaId`, título, fecha, `asistio`) |
| `cola` | Cola de acciones pendientes de sincronizar |
| `meta` | Fecha de la última sincronización |

El estado de la red se detecta con **NetInfo**. La persistencia propia de Firestore solo se usa como apoyo: en React Native guarda en memoria, así que la lógica offline es la de la app (`src/services/localStore.js`).

### Cómo funciona

1. **Lectura.** `JornadasContext` es la fuente única de datos. Al iniciar carga lo guardado en AsyncStorage y, cuando el servidor responde, se actualiza y se vuelve a guardar. Un snapshot vacío que llega de la caché (sin red) nunca borra lo que ya se muestra, y nunca queda cargando indefinidamente.
2. **Avisos de estado.** `ConnectionBanner` (parte inferior de las pantallas) muestra un solo aviso a la vez: *Conectado* o *Sin conexión* durante exactamente 10 s tras cada cambio de conexión; *Sincronizando datos* mientras se envían los cambios pendientes (se oculta al terminar bien, sin límite de tiempo si la sincronización es larga); y, si algo falla, un aviso de error que conserva los datos pendientes y se reintenta solo. Al tocar un aviso de error se abre la pantalla **Sincronización** (reintentar o descartar cada acción).
3. **Escritura.** Inscribirse y cancelar pasan siempre por la cola (`src/services/syncQueueService.js`). Con conexión se envían al instante; sin conexión quedan como **"Pendiente por sincronizar"** (en la lista, el detalle, Mis jornadas y el inicio) y los cupos mostrados incluyen su efecto. Antes de continuar sin conexión la app informa y pide confirmación.
4. **Sincronización.** `src/services/syncEngine.js` envía las acciones una a una y en orden cuando vuelve internet, al volver a abrir la app o desde "Sincronizar ahora". Cada envío (`src/services/inscripcionService.js`) es una transacción de Firestore que valida jornada activa y vigente, cupos y duplicados.
5. **Cierre de sesión.** Si hay acciones pendientes (o no hay conexión) se avisa de que se perderán y se pide confirmación.

### Reglas de negocio y conflictos

El **servidor manda** sobre cupos y estado de la jornada, y los envíos son **idempotentes**:

| Caso al sincronizar | Resultado |
|---|---|
| Inscripción y la jornada ya no tiene cupos / está desactivada / venció / no existe | Se **rechaza** con el motivo (queda visible en Sincronización; se puede reintentar o descartar) |
| La inscripción ya existe (otro dispositivo, reenvío) | Se da por hecha, sin duplicarla ni sumar otro cupo |
| Cancelación de algo ya cancelado | Se da por hecha, el cupo nunca baja de 0 |
| Inscribirse y cancelar sin haber enviado nada | Se anulan entre sí; no se envía nada |

- **Fechas:** el plazo de cancelación (2 días) y el vencimiento de las jornadas se validan con la **fecha del dispositivo** en el momento de la acción.
- **Duplicados:** la inscripción nueva usa el ID `<uid>_<jornadaId>` y las reglas de Firestore no permiten `update` sobre inscripciones, así que un doble toque o un reenvío no la duplican. También se detectan las inscripciones antiguas (ID aleatorio).
- **Errores de red:** la acción sigue pendiente y se reintenta sola con espera creciente (5 s, 10 s, 20 s... hasta 2 min) o al recuperar la conexión; no se pierde nada aunque se cierre la app (se vuelve a enviar sin duplicar).
- **Errores permanentes** (sin cupos, sin permiso...): la acción queda **rechazada** con el motivo, sin perder datos, y se avisa al usuario.
- Sin conexión la limpieza de jornadas vencidas no se ejecuta (siguen ocultas) y se hace al reconectar.

### Cómo probarlo

1. Inicia sesión con conexión y abre *Jornadas disponibles* y *Mis jornadas* (así se descargan).
2. Activa el **modo avión** y cierra y vuelve a abrir la app: se ven las jornadas y las inscripciones guardadas, y aparece el aviso "Sin conexión" durante 10 s.
3. Sin conexión, inscríbete en una jornada: la app pide confirmación, la marca "Pendiente por sincronizar" y descuenta el cupo en pantalla. Cancela una inscripción y verifica la marca "Cancelación pendiente".
4. Cierra la app con acciones pendientes y vuelve a abrirla: siguen ahí.
5. Desactiva el modo avión: aparece "Conectado" (10 s) o, si hay acciones pendientes, "Sincronizando datos" hasta que terminen; luego el aviso se oculta y la marca de pendiente desaparece. Si una jornada se llenó mientras tanto, la acción queda rechazada y se explica el motivo en *Sincronización*.
6. Con acciones pendientes, intenta **Cerrar sesión**: se avisa y se pide confirmación; al confirmar se borran los datos locales.

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
