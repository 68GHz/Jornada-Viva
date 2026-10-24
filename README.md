# Jornada Viva

Aplicación móvil (React Native + Expo) para gestionar la inscripción a jornadas, brigadas y actividades de proyección social y bienestar del **Tecnológico de Antioquia**. Los usuarios pueden crear una cuenta, explorar las jornadas disponibles, ver su detalle e inscribirse, con todo persistido en Firebase.

## Funcionalidades

- Registro, inicio y cierre de sesión con **Firebase Authentication**.
- Listado de jornadas cargado en tiempo real desde **Firestore** (título, fecha, hora, lugar y entidad organizadora).
- Vista de detalle con descripción completa, cupos disponibles y responsable.
- Inscripción a la jornada con confirmación visual, persistida en Firestore.
- Validación para evitar que un usuario se inscriba dos veces a la misma jornada.
- **Roles** (alumno, gestor de jornadas y administrador): los gestores gestionan sus jornadas asignadas y descargan la planilla; el administrador gestiona usuarios, gestores, jornadas, reportes y auditoría (ver [Roles y permisos](#roles-y-permisos)).

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
│   ├── app/         # Pantallas del estudiante: HomeScreen, JornadasListScreen, JornadaDetailScreen...
│   ├── maestro/     # Pantallas del gestor (y del administrador): MaestroHomeScreen, JornadaFormScreen, JornadaAdminScreen
│   └── admin/       # Módulo del administrador: dashboard, usuarios, jornadas, reportes, auditoría, perfil
└── theme/           # colors
```

## Modelo de datos (Firestore)

- **`users/{uid}`**: `uid`, `nombre`, `email`, `rol` (`estudiante`, `gestor` o `administrador`; sin rol = estudiante; `maestro` = alias antiguo de `gestor`), `activo` (`false` = cuenta desactivada), `creadoEn`, `jornadasVistas`.
- **`jornadas/{id}`**: `titulo`, `entidad`, `descripcion`, `fecha` (Timestamp, hora de negocio UTC-5), `lugar`, `responsable`, `cuposTotales`, `cuposOcupados`, `activa`, `creadoPor` (uid del gestor responsable; las jornadas anteriores a los roles no lo tienen) y `creadaEn`.
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

## Roles y permisos

La app tiene tres roles. El rol se guarda en `users/{uid}.rol` y decide qué pantallas se muestran; **lo que de verdad se permite lo valida el servidor** con las reglas de Firestore (`firestore.rules`), así que manipular la app, las URL o las solicitudes no da más permisos.

| Rol | Valor | Antes | Qué hace |
|---|---|---|---|
| **Usuario/Alumno** | `estudiante` (o sin rol) | Alumno | Consulta jornadas, se inscribe, cancela, Mis jornadas, filtros, modo offline y notificaciones |
| **Gestor de jornadas** | `gestor` | Maestro | Crea jornadas y gestiona las que tiene asignadas: editar, cancelar, reactivar, eliminar, ver inscritos y planilla |
| **Administrador** | `administrador` | (nuevo) | Módulo de administración: usuarios, gestores, jornadas, estadísticas, auditoría |

### Matriz de permisos

| Funcionalidad | Usuario/Alumno | Gestor de jornadas | Administrador |
|---|---|---|---|
| Consultar información propia | Sí | Sí | Sí |
| Participar en jornadas (inscribirse, cancelar) | Sí (reglas actuales) | No (sin cambios respecto a "maestro") | No (supuesto: la participación es del alumno) |
| Gestionar jornadas | No | Solo las **asignadas** a él (`creadoPor`) | **Todas**, y puede reasignarlas |
| Crear jornadas | No | A su nombre | Para cualquier gestor |
| Ver inscritos y descargar planilla | No | De sus jornadas | De cualquier jornada |
| Gestionar usuarios (crear, editar, activar/desactivar) | No | No | Sí |
| Asignar roles y permisos | No | No | Sí (nunca el suyo) |
| Dashboard administrativo | No | No | Sí |
| Reportes globales | No | No (supuesto: solo ve el resumen de sus jornadas) | Sí |
| Auditoría | No | No | Sí (solo lectura) |

### Pantallas del administrador

`AdminDashboard` (indicadores y accesos) · `UsuariosList` (búsqueda, filtros por rol y estado; también como listado de **gestores**) · `UsuarioDetalle` (datos, cambio de rol, activar/desactivar, jornadas asignadas si es gestor) · `UsuarioForm` (crear cuenta con rol) · `AdminJornadas` (todas las jornadas con filtros por estado, fecha, gestor y texto) · `JornadaForm` y `JornadaAdmin` (las mismas del gestor, con selector de gestor responsable) · `Reportes` (estadísticas y descarga de reporte para Excel) · `Auditoria` · `AdminPerfil`. Los gestores usan `GestorHome` (`screens/maestro/`, nombre de carpeta conservado).

### Cómo se protege (servidor)

- **Rol:** al registrarse solo se puede ser estudiante activo. Nadie puede cambiarse el rol ni su estado de cuenta, tampoco un administrador sobre sí mismo (así nunca se queda el sistema sin administrador). Solo un administrador cambia el rol o el estado de **otras** cuentas.
- **Cuentas desactivadas** (`activo: false`): la app cierra la sesión de inmediato y las reglas les impiden escribir (inscribirse, crear o editar jornadas, administrar). Nota: sin Admin SDK no se puede deshabilitar la cuenta de acceso de Firebase Auth en sí; el bloqueo lo aplican la app y las reglas.
- **Jornadas:** un gestor solo administra las que figuran a su nombre; las anteriores a los roles (sin `creadoPor`) y las ajenas solo las gestiona un administrador. Un gestor no puede reasignarlas. El servidor valida espacio, textos, cupos, fecha futura y que el gestor asignado exista, esté activo y tenga rol de gestor o administrador.
- **Inscritos:** el estudiante lee las suyas; el gestor, las de sus jornadas; el administrador, todas.
- **Auditoría:** el administrador registra sus acciones importantes (crear cuenta, cambiar rol, activar/desactivar, crear/editar/reasignar/cancelar/reactivar/eliminar jornadas, exportar reportes) en `auditoria`, siempre a su nombre y con la hora del servidor. Los registros no se pueden modificar ni borrar; solo los lee un administrador. Los cambios de cuentas se guardan en la **misma operación atómica** que el registro (si falla uno, falla el otro).
- **Compatibilidad:** el nombre anterior `maestro` se sigue aceptando como `gestor` (en la app y en las reglas) hasta migrar los datos.

### Crear el primer administrador y administrar cuentas

Las reglas impiden que alguien se asigne un rol, así que **el primer administrador se crea fuera de la app** (usa tu sesión de `gcloud`; sin `--aplicar` solo simula):

```bash
node scripts/admin.js crear-usuario admin@tdea.edu.co ClaveSegura123 administrador Nombre Apellido --aplicar
node scripts/admin.js rol alguien@tdea.edu.co administrador --aplicar   # o convertir una cuenta existente
node scripts/admin.js usuarios [rol]                                    # listar cuentas
```

A partir de ahí el administrador crea gestores y otras cuentas, y cambia roles desde la app. También se puede editar el campo `rol` en la consola de Firebase.

### Migración de datos (compatible hacia atrás)

No pierde ni duplica cuentas. Renombra el rol `maestro` a `gestor`, asigna `estudiante` a quien no tenía rol y lista las jornadas sin propietario. Es idempotente:

```bash
node scripts/admin.js migrar                 # simula
node scripts/admin.js migrar --aplicar
node scripts/admin.js propietario --huerfanas gestor@tdea.edu.co --aplicar   # opcional: asigna un gestor a las jornadas anteriores
```

Orden recomendado: 1) publicar las reglas, 2) actualizar la app, 3) migrar. Entre 1 y 3 todo sigue funcionando gracias al alias `maestro`.

### Despliegue de las reglas

```bash
npx firebase-tools deploy --only firestore:rules --project <id-del-proyecto>
```

### Pruebas

```bash
npm test             # lógica de roles, estados, usuarios, filtros, estadísticas, planilla y avisos
npm run test:rules   # reglas de Firestore contra el emulador (requiere Java)
npm run test:all     # ambas
```

Las pruebas de reglas cubren la autorización de los tres roles: un gestor no gestiona jornadas ajenas ni se las reasigna; un estudiante no administra nada ni se asigna roles; el administrador no puede cambiar su propio rol; las cuentas desactivadas no escriben; la auditoría es inmutable y solo la lee un administrador; y los flujos de inscripción siguen funcionando.

## Notificaciones

El estudiante recibe un aviso (pantalla **Notificaciones** y aviso local del dispositivo) cuando cambia una jornada en la que está inscrito:

| Aviso | Cuándo |
|---|---|
| Cancelación | La jornada pasa a inactiva antes de su fecha (no se avisa si se desactiva por haber vencido) |
| Reactivación | La jornada vuelve a estar activa |
| Reprogramación | Cambia la fecha o la hora |
| Actualización | Cambia el lugar, la descripción, el responsable, el título o la entidad |
| Eliminación | El maestro elimina la jornada |

**Cómo funciona.** La app compara cada jornada inscrita con lo que el estudiante ya conocía de ella. Ese "estado visto" se guarda en Firestore (`users/{uid}.jornadasVistas`), no en el dispositivo: la propia inscripción lo anota en su transacción y cancelar la inscripción lo quita. Así **no se pierde ningún cambio** aunque el estudiante haya cerrado sesión (al cerrar sesión se borran los datos locales), cambie de dispositivo o tenga la app cerrada cuando el maestro lo haga: el aviso se genera al volver a abrir la app. Si no se puede registrar un aviso, el estado visto no avanza y se reintenta en la siguiente lectura. Sin conexión se usa la copia local del estado.

**Limitación.** El aviso se genera cuando el estudiante abre la app: sin un servidor no hay notificaciones *push* con la app cerrada. `functions/index.js` tiene una Cloud Function pensada para eso, pero **no está desplegada** (requiere el plan Blaze de Firebase). Si se despliega, habría que desactivar la creación de avisos en la app o los estudiantes recibirían cada aviso dos veces.

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
